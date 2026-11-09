// Orta Nokta: arkadaş grubuna gerçek yolculuk süresine göre adil mekan bulur.
// Her kişi kendi ulaşımını seçer. Toplu taşıma, araba, yürüyüş, bisiklet: kendi MOTIS sunucumuz (İBB verisi + İstanbul OSM).
// Mekanlar ve istasyon girişleri: kendi OSM çıkarımımız (mekanlar.json, girisler.json). Adres önerisi: Photon (yedek MOTIS).

// ---------- Ayarlar ----------
// MOTIS'e aynı adresten (/motis) ulaşılır: sunucu.py istekleri yerel MOTIS'e aktarır. Böylece telefondan da çalışır.
const MOTIS = (() => { try { return localStorage.getItem("motis") || `${location.origin}/motis`; } catch { return `${location.origin}/motis`; } })();
const OSRM = {
  car:  ["https://routing.openstreetmap.de/routed-car", "https://router.project-osrm.org"],
  foot: ["https://routing.openstreetmap.de/routed-foot"],
  bike: ["https://routing.openstreetmap.de/routed-bike"],
};
const TURLER = {
  transit: { ad: "Toplu taşıma", ikon: "🚇" },
  car:     { ad: "Araba",        ikon: "🚗" },
  foot:    { ad: "Yürüyerek",    ikon: "🚶" },
  bike:    { ad: "Bisiklet",     ikon: "🚲" },
};
const AKTARMA_CEZASI = 5 * 60;  // sn; sırf 1 dk kısa diye çok aktarmalı rota seçilmesin
const TABLO_SINIRI = 100;       // OSRM tablo isteğindeki en fazla nokta
const YURUME_HIZI = 1.2;        // m/sn
const DOLAMBAC = 1.3;           // kuş uçuşu -> gerçek yürüme yolu çarpanı
const DURAK_YARICAP = 800;      // mekana bu kadar yakın duraklara bakılır (m)
// Ücret tahmini (Kasım 2026; kaynak: İstanbulkart Temmuz 2026 tarifesi haberleri, EPDK İstanbul benzin ortalaması)
const UCRET = {
  tam: 46.20, aktarma: 34.40,                       // İstanbulkart tam biniş ve aktarma (yaklaşık)
  marmarayEnAz: 37.40, marmarayEnCok: 82.17, marmarayHatKm: 76,  // Marmaray mesafeye göre
  benzinLitre: 74.5, litre100km: 7,                 // arabada yalnız yakıt; köprü/otopark hariç
};
const RENKLER = ["#3a6ea5", "#2a9d6f", "#8e44ad", "#d4a017", "#c0392b", "#16a085", "#e67e22", "#5d6d7e", "#d35400", "#7f8c8d"];
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

const KATEGORI = {
  kafe:     [["amenity", "cafe"]],
  bar:      [["amenity", "bar|pub|biergarten"]],
  restoran: [["amenity", "restaurant|fast_food"]],
  etkinlik: [["amenity", "cinema|theatre|arts_centre|nightclub"],
             ["leisure", "bowling_alley|escape_game|amusement_arcade|miniature_golf"]],
};
KATEGORI.hepsi = [...KATEGORI.kafe, ...KATEGORI.bar, ...KATEGORI.restoran, ...KATEGORI.etkinlik];
const TUR_ADI = {
  cafe: "Kafe", bar: "Bar", pub: "Pub", biergarten: "Bira bahçesi", restaurant: "Restoran", fast_food: "Fast food",
  cinema: "Sinema", theatre: "Tiyatro", arts_centre: "Sanat merkezi", nightclub: "Gece kulübü",
  bowling_alley: "Bowling", escape_game: "Kaçış oyunu", amusement_arcade: "Oyun salonu", miniature_golf: "Mini golf",
};

let kisiler = [];   // {id, ad, adres, lat, lon, tur}
let aktifId = null;
let kategori = "hepsi";
let sayac = 0;

// ---------- Harita ----------
const harita = L.map("harita", { zoomControl: true, preferCanvas: false }).setView([41.015, 28.979], 11);
const ATIF = "© OpenStreetMap katkıcıları · Toplu taşıma: İBB Açık Veri";
// Koyu harita: aynı OpenStreetMap karoları CSS filtresiyle koyulaştırılır (ek servis ve anahtar gerekmez)
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: ATIF, className: "zemin" }).addTo(harita);
let tema = (() => { try { return localStorage.getItem("harita-tema") || "acik"; } catch { return "acik"; } })();
const TemaDugmesi = L.Control.extend({
  options: { position: "topright" },
  onAdd() {
    const b = L.DomUtil.create("button", "tema-dugme");
    const yaz = () => { b.textContent = tema === "acik" ? "🌙 Koyu" : "☀️ Açık"; b.title = "Harita rengini değiştir"; };
    yaz();
    L.DomEvent.on(b, "click", (e) => {
      L.DomEvent.stop(e);
      tema = tema === "acik" ? "koyu" : "acik";
      document.body.classList.toggle("koyu-harita", tema === "koyu");
      try { localStorage.setItem("harita-tema", tema); } catch { /* önemli değil */ }
      yaz();
    });
    return b;
  },
});
new TemaDugmesi().addTo(harita);
document.body.classList.toggle("koyu-harita", tema === "koyu");
const kisiKatmani = L.layerGroup().addTo(harita);
const sonucKatmani = L.layerGroup().addTo(harita);
const cizgiKatmani = L.layerGroup().addTo(harita);

harita.on("click", async (e) => {
  const k = kisiler.find((x) => x.id === aktifId) || kisiler.find((x) => x.lat == null);
  if (!k) return durum("Önce bir kişi seç ya da yeni kişi ekle.");
  k.lat = e.latlng.lat; k.lon = e.latlng.lng; k.adres = "Haritadan seçildi"; k.yazilan = ""; k.genel = false;
  ciz();
  k.adres = (await tersAdres(k.lat, k.lon)) || k.adres;
  ciz();
});

// ---------- Yardımcılar ----------
const $ = (s) => document.querySelector(s);
function durum(metin, hata = false) {
  const d = $("#durum"); d.textContent = metin; d.className = "durum" + (hata ? " hata" : "");
}
function harf(ad) { return (ad || "?").trim().charAt(0).toLocaleUpperCase("tr") || "?"; }
function renk(k) { return RENKLER[kisiler.indexOf(k) % RENKLER.length]; }
function km(m) { return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`; }
function dk(sn) { const d = Math.max(1, Math.round(sn / 60)); return d < 60 ? `${d} dk` : `${Math.floor(d / 60)} sa ${d % 60} dk`; }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function mesafe(a, b) { // haversine, metre
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const yurumeSuresi = (m) => (m * DOLAMBAC) / YURUME_HIZI;

async function getJSON(url, secenek) {
  const r = await fetch(url, secenek);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// İstanbul saati (UTC+3, yaz saati yok) <-> ISO
function zamanISO(yerel, dakikaKayma = 0) { // "2026-11-10T19:00" -> UTC ISO
  const [g, s] = yerel.split("T"); const [y, a, d] = g.split("-").map(Number); const [sa, dk_] = s.split(":").map(Number);
  return new Date(Date.UTC(y, a - 1, d, sa - 3, dk_) + dakikaKayma * 60000).toISOString().replace(".000", "");
}
function saatYaz(iso) { const t = new Date(new Date(iso).getTime() + 3 * 3600000); return t.toISOString().slice(11, 16); }
function varsayilanZaman() {
  const t = new Date(Date.now() + 3 * 3600000 + 90 * 60000); // 1,5 saat sonrası, tam saate yuvarla
  t.setUTCMinutes(0, 0, 0);
  return t.toISOString().slice(0, 16);
}

// Google/OSRM tarzı kodlanmış çizgi (MOTIS: hassasiyet 7)
function cizgiCoz(metin, hassasiyet = 7) {
  const carpan = 10 ** hassasiyet, sonuc = [];
  let i = 0, lat = 0, lon = 0;
  while (i < metin.length) {
    for (const eksen of [0, 1]) {
      let sonucDeger = 0, kaydir = 0, b;
      do { b = metin.charCodeAt(i++) - 63; sonucDeger |= (b & 0x1f) << kaydir; kaydir += 5; } while (b >= 0x20);
      const fark = sonucDeger & 1 ? ~(sonucDeger >> 1) : sonucDeger >> 1;
      if (eksen === 0) lat += fark; else lon += fark;
    }
    sonuc.push([lat / carpan, lon / carpan]);
  }
  return sonuc;
}

// ---------- Adres ----------
// Yazarken öneri: Photon (otomatik tamamlamaya izin veriyor), İstanbul çevresiyle sınırlı.
const ISTANBUL_KUTU = "27.9,40.75,29.95,41.6";
const GENEL_YER = new Set(["city", "town", "suburb", "district", "quarter", "neighbourhood", "borough", "village", "county", "state", "province"]);
async function oneriGetir(metin, adet = 6) {
  try { return await photonOneri(metin, adet); }
  catch (e) { console.warn("Photon öneri vermedi, MOTIS adres araması deneniyor", e); }
  // Yedek: kendi MOTIS sunucumuz (aynı İstanbul haritası; sıralaması Photon kadar iyi değil)
  const j = await getJSON(`${MOTIS}/api/v1/geocode?text=${encodeURIComponent(metin)}&language=tr`, { signal: AbortSignal.timeout(8000) });
  return (Array.isArray(j) ? j : []).slice(0, adet).map((x) => {
    const bolge = (x.areas || []).filter((a) => a.adminLevel >= 6).map((a) => a.name).slice(0, 2);
    const sokak = x.street ? x.street + (x.houseNumber ? " " + x.houseNumber : "") : "";
    return { lat: x.lat, lon: x.lon, ad: [x.name, sokak !== x.name ? sokak : "", ...bolge].filter(Boolean).join(", "), genel: false };
  });
}
async function photonOneri(metin, adet) {
  const j = await getJSON(`https://photon.komoot.io/api/?q=${encodeURIComponent(metin)}&limit=${adet}&lat=41.01&lon=28.98&bbox=${ISTANBUL_KUTU}`,
    { signal: AbortSignal.timeout(8000) });
  return j.features.map((f) => {
    const p = f.properties;
    const sokak = p.street ? p.street + (p.housenumber ? " " + p.housenumber : "") : "";
    const yer = [p.district || p.locality, p.city].filter((x, i, a) => x && a.indexOf(x) === i && x !== p.name);
    return {
      lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
      ad: [p.name || sokak, p.name && sokak && sokak !== p.name ? sokak : "", ...yer].filter(Boolean).join(", "),
      genel: GENEL_YER.has(p.osm_value) || p.type === "city" || p.type === "district",
    };
  }).filter((x) => x.ad);
}
// Tek sonuç: önce Photon, olmazsa Nominatim
async function adresBul(metin) {
  try {
    const o = await oneriGetir(metin, 1);
    if (o[0]) return o[0];
  } catch { /* Nominatim'e düş */ }
  const s = await getJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=tr&countrycodes=tr&q=${encodeURIComponent(metin)}`);
  return s[0] ? { lat: +s[0].lat, lon: +s[0].lon, ad: s[0].display_name.split(",").slice(0, 3).join(","), genel: ["city", "town", "suburb", "administrative"].includes(s[0].type) } : null;
}
function konumuAyarla(k, s) {
  Object.assign(k, { lat: s.lat, lon: s.lon, adres: s.ad, genel: !!s.genel, yazilan: "" });
}

// Adres kutusu: yazdıkça öneri listesi, ok tuşları + Enter ile seçim
function adresKutusunuBagla(k, li) {
  const girdi = li.querySelector(".adres"), liste = li.querySelector(".oneriler");
  let oneriler = [], secili = -1, zamanlayici, istekNo = 0;
  const kapat = () => { liste.hidden = true; girdi.setAttribute("aria-expanded", "false"); secili = -1; };
  const goster = () => {
    liste.innerHTML = "";
    if (!oneriler.length) {
      liste.innerHTML = `<li class="bos">Sonuç yok. Sokak, mahalle ya da mekan adıyla dene.</li>`;
    }
    oneriler.forEach((o, i) => {
      const e = document.createElement("li");
      e.setAttribute("role", "option");
      e.className = i === secili ? "secili" : "";
      e.textContent = o.ad;
      if (o.genel) e.insertAdjacentHTML("beforeend", ` <small>semt</small>`);
      e.addEventListener("mousedown", (ev) => { ev.preventDefault(); sec(i); });
      liste.appendChild(e);
    });
    liste.hidden = false; girdi.setAttribute("aria-expanded", "true");
  };
  const sec = (i) => {
    const o = oneriler[i]; if (!o) return;
    konumuAyarla(k, o); kapat(); durum(""); ciz(); haritayiSigdir();
  };
  girdi.addEventListener("input", () => {
    k.yazilan = girdi.value;
    clearTimeout(zamanlayici);
    const metin = girdi.value.trim();
    if (metin.length < 3) return kapat();
    zamanlayici = setTimeout(async () => {
      const no = ++istekNo;
      try { const o = await oneriGetir(metin); if (no === istekNo) { oneriler = o; secili = o.length ? 0 : -1; goster(); } }
      catch { /* öneri gelmezse Enter yine çalışır */ }
    }, 300);
  });
  girdi.addEventListener("keydown", async (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (liste.hidden || !oneriler.length) return;
      e.preventDefault();
      secili = (secili + (e.key === "ArrowDown" ? 1 : -1) + oneriler.length) % oneriler.length; goster();
    } else if (e.key === "Escape") kapat();
    else if (e.key === "Enter") {
      e.preventDefault();
      if (!liste.hidden && secili >= 0) return sec(secili);
      if (!girdi.value.trim()) return;
      durum("Adres aranıyor…");
      try {
        const s = await adresBul(girdi.value.trim());
        if (!s) return durum(`"${girdi.value.trim()}" bulunamadı. Sokak, mahalle ya da mekan adıyla dene.`, true);
        konumuAyarla(k, s); durum(""); ciz(); haritayiSigdir();
      } catch { durum("Adres servisine ulaşılamadı, biraz sonra tekrar dene.", true); }
    }
  });
  girdi.addEventListener("blur", () => setTimeout(kapat, 150));
}

// "Bul"a basıldığında yazılmış ama seçilmemiş adresleri kendimiz ara
async function bekleyenAdresleriCoz() {
  for (const k of kisiler) {
    const metin = (k.yazilan || "").trim();
    if (!metin) continue;
    durum(`${k.ad} için "${metin}" aranıyor…`);
    const s = await adresBul(metin);
    if (!s) throw new Error(`${k.ad} için "${metin}" bulunamadı. Sokak, mahalle ya da mekan adıyla dene.`);
    konumuAyarla(k, s);
  }
  ciz();
}
async function tersAdres(lat, lon) {
  try {
    const s = await getJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=tr&lat=${lat}&lon=${lon}`);
    return s.display_name ? s.display_name.split(",").slice(0, 3).join(",") : null;
  } catch { return null; }
}

// ---------- Yol süreleri: araba / yürüyüş / bisiklet (OSRM) ----------
async function osrm(tur, yol) {
  let son;
  for (const taban of OSRM[tur]) {
    try {
      const j = await getJSON(`${taban}${yol}`, { signal: AbortSignal.timeout(25000) });
      if (j.code !== "Ok") throw new Error(j.code);
      return j;
    } catch (e) { son = e; }
  }
  throw son;
}

// Kişilerden hedeflere yol süresi/mesafesi. Sonuç: hedef başına {sure:[kişi], mesafe:[kişi]}
async function osrmTablo(tur, kisiListesi, hedefler) {
  const sonuc = [];
  const parca = TABLO_SINIRI - kisiListesi.length;
  for (let i = 0; i < hedefler.length; i += parca) {
    const grup = hedefler.slice(i, i + parca);
    const noktalar = [...kisiListesi, ...grup].map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
    const kaynak = kisiListesi.map((_, k) => k).join(";");
    const hedef = grup.map((_, k) => k + kisiListesi.length).join(";");
    const j = await osrm(tur, `/table/v1/driving/${noktalar}?sources=${kaynak}&destinations=${hedef}&annotations=duration,distance`);
    grup.forEach((_, h) => sonuc.push({
      sure: kisiListesi.map((_, k) => j.durations[k][h]),
      mesafe: kisiListesi.map((_, k) => j.distances[k][h]),
    }));
  }
  return sonuc;
}

// ---------- Toplu taşıma (MOTIS) ----------
// Bir kişiden, buluşma saatinden önce yola çıkınca ulaşabildiği bütün duraklar (videodaki "yayılma").
// Dönen fonksiyon: bir noktaya tahmini kapıdan kapıya süre (sn, aktarma cezası dahil).
async function topluErisim(kisi, zaman) {
  const ONCE = 120; // buluşmadan 2 saat önce yola çıkıyormuş gibi yay
  const url = `${MOTIS}/api/v1/one-to-all?one=${kisi.lat.toFixed(6)},${kisi.lon.toFixed(6)}&time=${zamanISO(zaman, -ONCE)}&maxTravelTime=${ONCE}`;
  const j = await getJSON(url, { signal: AbortSignal.timeout(30000) });
  const izgara = new Map(); // ~800 m'lik hücreler
  const tum = [];
  const hucre = (lat, lon) => `${Math.floor(lat / 0.008)},${Math.floor(lon / 0.01)}`;
  for (const x of j.all) {
    const s = { lat: x.place.lat, lon: x.place.lon, sure: x.duration * 60 + Math.max(0, x.k - 1) * AKTARMA_CEZASI };
    tum.push(s);
    const h = hucre(s.lat, s.lon);
    if (!izgara.has(h)) izgara.set(h, []);
    izgara.get(h).push(s);
  }
  const fn = (nokta) => {
    let enIyi = mesafe(kisi, nokta) < 2500 ? yurumeSuresi(mesafe(kisi, nokta)) : Infinity; // yürüyerek de gidebilir
    const [a, b] = hucre(nokta.lat, nokta.lon).split(",").map(Number);
    for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) {
      for (const s of izgara.get(`${a + i},${b + k}`) || []) {
        const m = mesafe(s, nokta);
        if (m <= DURAK_YARICAP) enIyi = Math.min(enIyi, s.sure + yurumeSuresi(m));
      }
    }
    return enIyi;
  };
  fn.noktalar = tum; // yayılma animasyonu için
  return fn;
}

// Kesin toplu taşıma yolculuğu: buluşma saatinde orada olacak şekilde. En iyi seçenek: süre + aktarma cezası.
async function topluRota(kisi, hedef, zaman) {
  const url = `${MOTIS}/api/v1/plan?fromPlace=${kisi.lat.toFixed(6)},${kisi.lon.toFixed(6)}&toPlace=${hedef.lat.toFixed(6)},${hedef.lon.toFixed(6)}`
    + `&time=${zamanISO(zaman)}&arriveBy=true&numItineraries=5&maxPreTransitTime=1200&maxPostTransitTime=1200`;
  const j = await getJSON(url, { signal: AbortSignal.timeout(30000) });
  const secenekler = [...(j.itineraries || []), ...(j.direct || [])];
  if (!secenekler.length) return null;
  // Süre + cezalar + buluşmadan 10 dk'dan fazla erken varmanın yarısı (boşuna beklemesin)
  const hedefSaat = new Date(zamanISO(zaman)).getTime();
  const maliyet = (it) => it.duration + ekMaliyet(it)
    + 0.5 * Math.max(0, (hedefSaat - new Date(it.endTime).getTime()) / 1000 - 600);
  return secenekler.sort((a, b) => maliyet(a) - maliyet(b))[0];
}

// Minibüs ve dolmuşun gerçek saati yok (İBB verisi "kaç dakikada bir"), motor beklemeyi az sayar.
const MINIBUS_PAYI = 5 * 60;
const tarifesiz = (l) => /minibus|dolmus/i.test(l.agencyName || "");
// Sıralamada kullanılan ek maliyet: aktarma cezası + tarifesiz hat payı
function ekMaliyet(it) {
  return (it.transfers || 0) * AKTARMA_CEZASI + it.legs.filter(tarifesiz).length * MINIBUS_PAYI;
}

// Hat türü, simge ve renk (İBB verisinde Marmaray "metro", metrobüs "otobüs" görünüyor; düzeltiyoruz)
function hatTuru(leg) {
  const kisa = leg.routeShortName || leg.displayName || "";
  const ajans = (leg.agencyName || "").toLowerCase();
  if (leg.mode === "WALK") return { ad: "Yürü", ikon: "🚶", renk: null };
  if (leg.mode === "FERRY") return { ad: "Vapur", ikon: "⛴️", renk: "#1d4e89" };
  if (/marmaray/i.test(kisa) || ajans.includes("tcdd")) return { ad: "Marmaray", ikon: "🚆", renk: "#5c677d" };
  if (leg.mode === "TRAM" || leg.routeType === 0) return { ad: "Tramvay", ikon: "🚋", renk: "#f77f00" };
  if (leg.mode === "FUNICULAR" || leg.routeType === 7) return { ad: "Füniküler", ikon: "🚞", renk: "#9b5de5" };
  if (leg.mode === "AERIAL_LIFT" || leg.routeType === 6) return { ad: "Teleferik", ikon: "🚡", renk: "#9b5de5" };
  if (["SUBWAY", "METRO", "RAIL", "SUBURBAN", "REGIONAL_RAIL"].includes(leg.mode) || leg.routeType === 1) return { ad: "Metro", ikon: "🚇", renk: "#d62828" };
  if (ajans.includes("minibus")) return { ad: "Minibüs", ikon: "🚐", renk: "#8d6e63" };
  if (ajans.includes("dolmus")) return { ad: "Dolmuş", ikon: "🚐", renk: "#8d6e63" };
  if (/^34[A-Z]{0,2}$/.test(kisa)) return { ad: "Metrobüs", ikon: "🚍", renk: "#c9a227" };
  return { ad: "Otobüs", ikon: "🚌", renk: "#2a9d8f" };
}
function yerAdi(yer) { return yer.name === "START" ? "çıkış noktası" : yer.name === "END" ? "mekan" : yer.name; }

// ---------- Araba / yürüyüş / bisiklet (MOTIS sokak yönlendirmesi, aynı İstanbul haritası) ----------
const SOKAK_MODU = { car: "CAR", foot: "WALK", bike: "BIKE" };
async function sokakSureleri(k, noktalar) {
  const parcalar = [];
  for (let i = 0; i < noktalar.length; i += 100) parcalar.push(noktalar.slice(i, i + 100));
  const sonuclar = await Promise.all(parcalar.map(async (parca) => { // sunucu çok çekirdekli: parçaları aynı anda sor
    const many = parca.map((p) => `${p.lat.toFixed(6)};${p.lon.toFixed(6)}`).join(",");
    const j = await getJSON(`${MOTIS}/api/v1/one-to-many?one=${k.lat.toFixed(6)};${k.lon.toFixed(6)}&many=${many}`
      + `&mode=${SOKAK_MODU[k.tur]}&max=7200&maxMatchingDistance=250&arriveBy=false`, { signal: AbortSignal.timeout(30000) });
    if (!Array.isArray(j)) throw new Error(j.error || "one-to-many");
    return j.map((x) => x.duration ?? Infinity);
  }));
  return sonuclar.flat();
}
// Sokak rotası (çizgi + mesafe): önce MOTIS, olmazsa OSRM
async function sokakRotasi(k, m, zaman) {
  try {
    const j = await getJSON(`${MOTIS}/api/v1/plan?fromPlace=${k.lat.toFixed(6)},${k.lon.toFixed(6)}&toPlace=${m.lat.toFixed(6)},${m.lon.toFixed(6)}`
      + `&directModes=${SOKAK_MODU[k.tur]}&transitModes=&time=${zamanISO(zaman)}&arriveBy=true&maxDirectTime=7200`, { signal: AbortSignal.timeout(20000) });
    const legs = j.direct?.[0]?.legs;
    if (!legs?.length) throw new Error("yol yok");
    return { nokta: legs.flatMap((l) => cizgiCoz(l.legGeometry.points, l.legGeometry.precision || 7)), mesafe: legs.reduce((s, l) => s + (l.distance || 0), 0) };
  } catch {
    return osrm(k.tur, `/route/v1/driving/${k.lon.toFixed(6)},${k.lat.toFixed(6)};${m.lon.toFixed(6)},${m.lat.toFixed(6)}?overview=full&geometries=geojson`)
      .then((j) => ({ nokta: j.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]), mesafe: j.routes[0].distance }))
      .catch(() => ({ nokta: [[k.lat, k.lon], [m.lat, m.lon]], mesafe: null }));
  }
}

// ---------- Herkesin süresi (karışık grup) ----------
// noktalar: [{lat, lon}] -> nokta başına {sure:[kişi], mesafe:[kişi]}  (sure: sn, toplu taşımada aktarma cezası dahil)
async function herkesinSuresi(hazir, noktalar, toplu) {
  const sonuc = noktalar.map(() => ({ sure: new Array(hazir.length), mesafe: new Array(hazir.length).fill(null) }));
  await Promise.all(hazir.map(async (k, i) => {
    if (k.tur === "transit") return;
    try {
      const s = await sokakSureleri(k, noktalar);
      s.forEach((x, n) => { sonuc[n].sure[i] = x; });
    } catch (e) {
      console.warn("MOTIS sokak yönlendirmesi çalışmadı, OSRM deneniyor", e);
      const tablo = await osrmTablo(k.tur, [k], noktalar);
      tablo.forEach((t, n) => { sonuc[n].sure[i] = t.sure[0]; sonuc[n].mesafe[i] = t.mesafe[0]; });
    }
  }));
  hazir.forEach((k, i) => {
    if (k.tur === "transit") noktalar.forEach((p, n) => { sonuc[n].sure[i] = toplu.get(k.id)(p); });
  });
  return sonuc;
}

// Adalet puanı: en uzun yolculuk + kişiler arası farkın yarısı. Ulaşılamayan varsa elenir.
function puanla(sureler) {
  if (sureler.some((s) => s == null || !isFinite(s))) return null;
  const enUzun = Math.max(...sureler), fark = enUzun - Math.min(...sureler);
  return { enUzun, fark, puan: enUzun + 0.5 * fark };
}

// Herkesi kapsayan en küçük çemberin merkezi (başlangıç tahmini).
function adilMerkez(noktalar) {
  const lat0 = noktalar.reduce((s, p) => s + p.lat, 0) / noktalar.length;
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540;
  const P = noktalar.map((p) => ({ x: p.lon * kx, y: p.lat * ky }));
  let c = { ...P[0] };
  for (let i = 1; i < 2000; i++) {
    let uzak = P[0], dmax = -1;
    for (const p of P) { const d = Math.hypot(p.x - c.x, p.y - c.y); if (d > dmax) { dmax = d; uzak = p; } }
    c.x += (uzak.x - c.x) / (i + 1); c.y += (uzak.y - c.y) / (i + 1);
  }
  const merkez = { lat: c.y / ky, lon: c.x / kx };
  return { merkez, yaricap: Math.max(...noktalar.map((p) => mesafe(p, merkez))) };
}
function ornekNoktalar(merkez, yaricap) {
  const kx = 111320 * Math.cos(merkez.lat * Math.PI / 180), ky = 110540;
  const noktalar = [{ ...merkez }];
  [[0.2, 6], [0.4, 10], [0.6, 14], [0.85, 18]].forEach(([oran, adet]) => {
    for (let i = 0; i < adet; i++) {
      const a = (2 * Math.PI * i) / adet + oran;
      noktalar.push({ lat: merkez.lat + (Math.sin(a) * yaricap * oran) / ky, lon: merkez.lon + (Math.cos(a) * yaricap * oran) / kx });
    }
  });
  return noktalar;
}

// ---------- Kişi listesi ----------
function kisiEkle(veri = {}) {
  const k = { id: ++sayac, ad: veri.ad || `Kişi ${kisiler.length + 1}`, adres: veri.adres || "", lat: veri.lat ?? null, lon: veri.lon ?? null,
    tur: TURLER[veri.tur] ? veri.tur : "transit" };
  kisiler.push(k); aktifId = k.id; ciz();
  return k;
}

function ciz() {
  const ul = $("#kisiler"); ul.innerHTML = "";
  kisiKatmani.clearLayers();
  kisiler.forEach((k) => {
    const li = document.createElement("li");
    li.className = "kisi" + (k.id === aktifId ? " aktif" : "");
    li.innerHTML = `
      <span class="rozet" style="background:${renk(k)}">${harf(k.ad)}</span>
      <input class="isim" value="" aria-label="İsim">
      <button class="sil" title="Kişiyi sil">×</button>
      <div class="adres-satir">
        <div class="adres-kutu">
          <input class="adres" placeholder="Sokak, mekan ya da semt yaz" aria-label="Adres" autocomplete="off" role="combobox" aria-expanded="false">
          <ul class="oneriler" role="listbox" hidden></ul>
        </div>
        <button class="kucuk konumum" title="Telefonun konumunu kullan">📍 Konumum</button>
      </div>
      <div class="konum-yazi ${k.lat != null ? "tamam" : ""}"></div>
      <div class="tur-secim" role="group" aria-label="Ulaşım">${Object.entries(TURLER).map(([t, v]) =>
        `<button data-t="${t}" class="${k.tur === t ? "secili" : ""}" title="${v.ad}">${v.ikon} <span>${v.ad}</span></button>`).join("")}</div>`;
    li.querySelector(".isim").value = k.ad;
    li.querySelector(".adres").value = k.yazilan || "";
    li.querySelector(".konum-yazi").textContent = k.lat != null
      ? `✓ ${k.adres || "Konum alındı"}${k.genel ? " (semt merkezi alındı; daha doğru sonuç için sokak ya da mekan yaz)" : ""}`
      : "Konum yok: adres yaz ve listeden seç, ya da 📍 Konumum'a bas";
    li.addEventListener("click", () => { if (aktifId !== k.id) { aktifId = k.id; ul.querySelectorAll(".kisi").forEach((x) => x.classList.remove("aktif")); li.classList.add("aktif"); } });
    li.querySelectorAll(".tur-secim button").forEach((b) => b.addEventListener("click", () => {
      k.tur = b.dataset.t; li.querySelectorAll(".tur-secim button").forEach((x) => x.classList.toggle("secili", x === b)); kaydet();
    }));
    li.querySelector(".isim").addEventListener("input", (e) => { k.ad = e.target.value; li.querySelector(".rozet").textContent = harf(k.ad); kaydet(); });
    li.querySelector(".isim").addEventListener("change", ciz);
    li.querySelector(".sil").addEventListener("click", (e) => { e.stopPropagation(); kisiler = kisiler.filter((x) => x !== k); ciz(); });
    adresKutusunuBagla(k, li);
    li.querySelector(".konumum").addEventListener("click", (e) => {
      e.stopPropagation();
      if (!navigator.geolocation) return durum("Bu tarayıcı konum vermiyor.", true);
      durum("Konum alınıyor…");
      navigator.geolocation.getCurrentPosition(async (p) => {
        Object.assign(k, { lat: p.coords.latitude, lon: p.coords.longitude, adres: "Telefon konumu", yazilan: "", genel: false });
        durum(""); ciz(); haritayiSigdir();
        k.adres = (await tersAdres(k.lat, k.lon)) || k.adres; ciz();
      }, () => durum("Konum izni verilmedi. Adres yazabilir ya da haritaya tıklayabilirsin.", true), { enableHighAccuracy: true, timeout: 15000 });
    });
    ul.appendChild(li);

    if (k.lat != null) {
      L.marker([k.lat, k.lon], {
        icon: L.divIcon({ className: "", html: `<div class="pin" style="background:${renk(k)}">${harf(k.ad)}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
        draggable: true,
      }).bindTooltip(k.ad).on("dragend", async (e) => {
        const ll = e.target.getLatLng(); k.lat = ll.lat; k.lon = ll.lng; k.genel = false; k.adres = (await tersAdres(k.lat, k.lon)) || "Haritadan seçildi"; ciz();
      }).addTo(kisiKatmani);
    }
  });
  kaydet();
}

function haritayiSigdir() {
  const n = kisiler.filter((k) => k.lat != null);
  if (n.length === 1) harita.setView([n[0].lat, n[0].lon], 14);
  else if (n.length > 1) harita.fitBounds(n.map((k) => [k.lat, k.lon]), { padding: [40, 40] });
}

// ---------- Bağlantı ----------
function kaydet() {
  const hazir = kisiler.filter((k) => k.lat != null);
  const parca = hazir.map((k) => [k.ad, k.lat.toFixed(5), k.lon.toFixed(5), k.tur].map(encodeURIComponent).join(",")).join(";");
  history.replaceState(null, "", hazir.length ? `#g=${parca}&k=${kategori}` : location.pathname);
}
function baglantidanYukle() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get("k") && KATEGORI[h.get("k")]) kategori = h.get("k");
  (h.get("g") || "").split(";").filter(Boolean).forEach((p) => {
    const [ad, lat, lon, tur] = p.split(",").map(decodeURIComponent);
    if (!isNaN(+lat) && !isNaN(+lon)) kisiEkle({ ad, lat: +lat, lon: +lon, tur, adres: "Bağlantıdan geldi" });
  });
}

// ---------- Mekanlar ----------
async function overpass(sorgu) {
  let son;
  for (const u of OVERPASS) {
    try { return await getJSON(u, { method: "POST", body: "data=" + encodeURIComponent(sorgu), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(10000) }); }
    catch (e) { son = e; }
  }
  throw son;
}
async function photonGetir(merkez, yaricap, etiketler) {
  const tag = etiketler.flatMap(([anahtar, deger]) => deger.split("|").map((v) => `&osm_tag=${anahtar}:${v}`)).join("");
  const url = `https://photon.komoot.io/reverse?lat=${merkez.lat.toFixed(6)}&lon=${merkez.lon.toFixed(6)}&radius=${(yaricap / 1000).toFixed(1)}&limit=50&lang=default${tag}`;
  const veri = await getJSON(url, { signal: AbortSignal.timeout(12000) });
  return veri.features.filter((f) => f.properties.name).map((f) => {
    const p = f.properties;
    const adres = [p.street && (p.street + (p.housenumber ? " " + p.housenumber : "")), p.district, p.city].filter(Boolean).join(", ");
    return { id: p.osm_type + p.osm_id, ad: p.name, tur: TUR_ADI[p.osm_value] || "Mekan", lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], adres };
  });
}
async function overpassGetir(merkez, yaricap, etiketler) {
  const satirlar = etiketler.map(([anahtar, deger]) =>
    `nwr["${anahtar}"~"^(${deger})$"]["name"](around:${Math.round(yaricap)},${merkez.lat.toFixed(6)},${merkez.lon.toFixed(6)});`).join("");
  const veri = await overpass(`[out:json][timeout:20];(${satirlar});out center tags 300;`);
  return veri.elements.map((e) => {
    const t = e.tags || {};
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    const adres = [t["addr:street"] && (t["addr:street"] + (t["addr:housenumber"] ? " " + t["addr:housenumber"] : "")), t["addr:district"]].filter(Boolean).join(", ");
    return { id: e.type + e.id, ad: t.name, tur: TUR_ADI[t.amenity] || TUR_ADI[t.leisure] || "Mekan", lat, lon, adres };
  }).filter((m) => m.lat != null);
}
// Birincil kaynak: kendi OSM verimizden çıkarılmış mekanlar.json (veri/mekanlar.py). Dış servis yalnız yedek.
let yerelMekanlar = null;
async function yerelMekanlariYukle() {
  if (!yerelMekanlar) {
    const j = await getJSON("mekanlar.json", { signal: AbortSignal.timeout(15000) });
    yerelMekanlar = j.m.map(([lat, lon, ad, t, adres, saat]) => ({ lat, lon, ad, osm: j.turler[t], adres, saat, id: `${ad}|${lat}|${lon}` }));
  }
  return yerelMekanlar;
}
async function mekanlariGetir(merkez, yaricap) {
  const gruplar = kategori === "hepsi" ? ["kafe", "bar", "restoran", "etkinlik"] : [kategori];
  const izinli = new Set(gruplar.flatMap((g) => KATEGORI[g].flatMap(([, deger]) => deger.split("|"))));
  try {
    const hepsi = await yerelMekanlariYukle();
    return hepsi.filter((m) => izinli.has(m.osm) && mesafe(merkez, m) <= yaricap)
      .map((m) => ({ ...m, tur: TUR_ADI[m.osm] || "Mekan" }));
  } catch (e) {
    console.warn("mekanlar.json okunamadı, dış servis deneniyor", e);
  }
  let sonuc;
  try {
    sonuc = (await Promise.all(gruplar.map((g) => photonGetir(merkez, yaricap, KATEGORI[g])))).flat();
  } catch (e) {
    console.warn("Photon çalışmadı, Overpass deneniyor", e);
    sonuc = await overpassGetir(merkez, yaricap, KATEGORI[kategori]);
  }
  return sonuc;
}

// Aynı anda en fazla n iş
async function sinirli(isler, n = 6) {
  const sonuc = new Array(isler.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, isler.length) }, async () => {
    while (i < isler.length) { const j = i++; sonuc[j] = await isler[j](); }
  }));
  return sonuc;
}

// ---------- Sıralama ----------
// Mod: "adil" (en uzun yolculuk + farkın yarısı), "toplam" (herkesin süresi toplamı), "aktarma" (adil + aktarma başına 15 dk)
// Ek cezalar: buluşma bitmeden kapanan mekan +20 dk, toplu taşımayla eve dönemeyen her kişi +60 dk.
function siralamaPuani(m) {
  const s = m.cezali || m.sureler;
  if (!s || s.some((x) => x == null || !isFinite(x))) return Infinity;
  const enUzun = Math.max(...s), fark = enUzun - Math.min(...s);
  const mod = $("#siralama").value;
  let p = mod === "toplam" ? s.reduce((a, b) => a + b, 0) : enUzun + 0.5 * fark;
  if (mod === "aktarma") p += (m.aktarmaSayisi || 0) * 15 * 60;
  if (m.acik?.durum === "erken") p += 20 * 60;
  p += (m.donusYok?.length || 0) * 3600;
  return p;
}
function goruntuDegerleri(m) {
  m.enUzun = Math.max(...m.sureler);
  m.fark = m.enUzun - Math.min(...m.sureler);
  m.puan = siralamaPuani(m);
}

// ---------- Dönüş yolu ----------
// Buluşma bitince toplu taşımayla eve dönüş. null: o saatten sonra 3 saat içinde dönüş yok.
async function donusRotasi(k, m, zaman, sureDk) {
  const cikis = zamanISO(zaman, sureDk);
  const url = `${MOTIS}/api/v1/plan?fromPlace=${m.lat.toFixed(6)},${m.lon.toFixed(6)}&toPlace=${k.lat.toFixed(6)},${k.lon.toFixed(6)}`
    + `&time=${cikis}&arriveBy=false&numItineraries=2&maxPreTransitTime=1200&maxPostTransitTime=1200&searchWindow=10800`;
  const j = await getJSON(url, { signal: AbortSignal.timeout(30000) });
  const secenekler = [...(j.itineraries || []), ...(j.direct || [])]
    .filter((it) => new Date(it.startTime) - new Date(cikis) < 3 * 3600000);
  if (!secenekler.length) return null;
  const maliyet = (it) => new Date(it.endTime).getTime() + ekMaliyet(it) * 1000; // en erken eve varış (cezalarla)
  return secenekler.sort((a, b) => maliyet(a) - maliyet(b))[0];
}
// Dönüşte 1 saatten fazla beklemek gerekiyorsa da "dönüş yok" sayılır
function donusSorunlu(it, zaman, sureDk) {
  return !it || new Date(it.startTime) - new Date(zamanISO(zaman, sureDk)) > 3600000;
}

// ---------- Ücret ----------
function topluUcret(it) {
  if (!it) return null;
  let tl = 0, binis = 0, tahmini = false;
  for (const l of it.legs) {
    if (l.mode === "WALK") continue;
    if (tarifesiz(l)) { tahmini = true; continue; } // minibüs/dolmuş: mesafeye göre nakit, bilinmiyor
    if (hatTuru(l).ad === "Marmaray") {
      const kmYol = (mesafe(l.from, l.to) / 1000) * 1.1;
      tl += Math.min(UCRET.marmarayEnCok, UCRET.marmarayEnAz + (UCRET.marmarayEnCok - UCRET.marmarayEnAz) * (kmYol / UCRET.marmarayHatKm));
    } else tl += binis === 0 ? UCRET.tam : UCRET.aktarma;
    binis++;
  }
  return { tl, tahmini };
}
function kisiUcreti(k, m, i) {
  if (k.tur === "transit") return topluUcret(m.rotalar?.[k.id]);
  if (k.tur === "car") return m.mesafeler[i] != null ? { tl: (m.mesafeler[i] / 1000) * (UCRET.litre100km / 100) * UCRET.benzinLitre, tahmini: false, yakit: true } : null;
  return { tl: 0, tahmini: false };
}
const tlYaz = (u) => (u ? (u.tl === 0 && !u.tahmini ? "ücretsiz" : `≈ ${Math.round(u.tl)} TL${u.tahmini ? "+" : ""}`) : "");

// ---------- İstasyon girişleri ----------
let girisler = [];
getJSON("girisler.json").then((j) => { girisler = j.map(([lat, lon, ad, ref]) => ({ lat, lon, ad, ref })); }).catch(() => {});
const RAYLI = new Set(["Metro", "Marmaray", "Tramvay", "Füniküler"]);
// İstasyona (durak) 350 m içindeki girişlerden, yürüyüşün öbür ucuna en yakın olanı
function enYakinGiris(durak, oburUc) {
  let en = null, enM = Infinity;
  for (const g of girisler) {
    if (mesafe(g, durak) > 350) continue;
    const m = mesafe(g, oburUc);
    if (m < enM) { enM = m; en = g; }
  }
  return en;
}
// Girişin okunur adı; adı da numarası da yoksa "" (yalnız haritada işaretlenir)
function girisAdi(g) {
  if (g.ad && g.ref && !g.ad.includes(g.ref)) return `${g.ad} (${g.ref})`;
  return g.ad || (g.ref ? `${g.ref} numaralı giriş` : "");
}

// ---------- Ana akış ----------
let sonArama = null; // {hazir, zaman, sureDk, ilk, toplu}
async function bul() {
  try { await bekleyenAdresleriCoz(); } catch (e) { return durum(e.message.startsWith("HTTP") ? "Adres servisine ulaşılamadı, biraz sonra tekrar dene." : e.message, true); }
  const hazir = kisiler.filter((k) => k.lat != null);
  if (hazir.length < 2) return durum("En az 2 kişinin konumu lazım: adres yaz ve listeden seç, ya da 📍 Konumum'a bas.", true);
  const zaman = $("#zaman").value;
  if (!zaman) return durum("Buluşma zamanını seç.", true);
  const sureDk = +$("#sure").value * 60;
  const btn = $("#bul"); btn.disabled = true;
  sonucKatmani.clearLayers(); cizgiKatmani.clearLayers(); yayilmaKatmani.clearLayers();
  const t0 = performance.now();
  try {
    // 0) Toplu taşımacılar için "nereye kaç dakikada varırım" haritası
    const toplu = new Map();
    const topluKisiler = hazir.filter((k) => k.tur === "transit");
    if (topluKisiler.length) {
      durum("Toplu taşıma ağında herkesin ulaşabildiği yerler hesaplanıyor…");
      try {
        await Promise.all(topluKisiler.map(async (k) => toplu.set(k.id, await topluErisim(k, zaman))));
      } catch (e) {
        console.error(e);
        throw new Error("Toplu taşıma sunucusuna ulaşılamadı. baslat.bat ile açtığından emin ol.");
      }
    }

    // 1) Herkese en adil bölge
    const { merkez, yaricap } = adilMerkez(hazir);
    durum("Herkese en adil bölge aranıyor…");
    const ornekler = ornekNoktalar(merkez, Math.max(yaricap, 1500));
    const tablo = await herkesinSuresi(hazir, ornekler, toplu);
    const adaylar = ornekler.map((p, i) => ({ p, puan: puanla(tablo[i].sure) })).filter((x) => x.puan).sort((a, b) => a.puan.puan - b.puan.puan);
    if (!adaylar.length) throw new Error("Herkesin ulaşabildiği bir bölge bulunamadı. Buluşma saatini değiştirmeyi dene.");
    const enIyi = adaylar[0].p;
    const ikinci = adaylar.slice(1, 8).map((x) => x.p).find((p) => mesafe(p, enIyi) > 2500);

    // 2) Bölgelerdeki mekanlar; buluşma saatinde kapalı olanlar elenir
    const r = Math.min(Math.max(1200, yaricap * 0.25), 5000);
    durum("Adil bölgelerde mekan aranıyor…");
    const gorulen = new Set();
    let mekanlar = (await Promise.all((ikinci ? [enIyi, ikinci] : [enIyi]).map((m) => mekanlariGetir(m, r)))).flat()
      .filter((m) => !gorulen.has(m.id) && gorulen.add(m.id));
    if (!mekanlar.length) mekanlar = await mekanlariGetir(enIyi, r * 3);
    mekanlar.forEach((m) => { m.acik = acikMi(m.saat, zaman, sureDk); });
    const kapali = mekanlar.filter((m) => m.acik.durum === "kapali").length;
    mekanlar = mekanlar.filter((m) => m.acik.durum !== "kapali");
    if (!mekanlar.length) { $("#sonucBolumu").hidden = true; return durum(`Bu bölgede o saatte açık uygun mekan bulunamadı${kapali ? ` (${kapali} mekan kapalı)` : ""}. Başka bir kategori ya da saat dene.`, true); }
    mekanlar.sort((a, b) => mesafe(enIyi, a) - mesafe(enIyi, b));
    mekanlar = mekanlar.slice(0, 120);

    // 3) Her mekana herkesin tahmini süresi, ön sıralama
    durum(`${mekanlar.length} mekan için herkesin süresi hesaplanıyor…`);
    const sureler = await herkesinSuresi(hazir, mekanlar, toplu);
    mekanlar.forEach((m, i) => { m.sureler = sureler[i].sure; m.mesafeler = sureler[i].mesafe; m.puan = siralamaPuani(m); });
    mekanlar = mekanlar.filter((m) => isFinite(m.puan)).sort((a, b) => a.puan - b.puan);
    if (!mekanlar.length) throw new Error("Mekanlara herkesin ulaşabildiği yol bulunamadı.");

    // 4) İlk 12 için toplu taşımacılara kesin gidiş ve dönüş planı
    let ilk = mekanlar.slice(0, 12);
    if (topluKisiler.length) {
      durum("En iyi mekanlar için gidiş ve dönüş tarifleri çıkarılıyor…");
      const isler = [], donusOnbellek = {};
      ilk.forEach((m) => {
        m.rotalar = {}; m.donusler = {}; m.cezali = [...m.sureler];
        hazir.forEach((k, i) => {
          if (k.tur !== "transit") return;
          isler.push(async () => {
            const it = await topluRota(k, m, zaman).catch(() => null);
            m.rotalar[k.id] = it;
            m.sureler[i] = it ? it.duration : Infinity;
            m.cezali[i] = it ? it.duration + ekMaliyet(it) : Infinity;
          });
          // Birbirine ~300 m yakın mekanların dönüşü neredeyse aynı: bölge başına bir kez sor
          const anahtar = `${k.id}|${Math.round(m.lat / 0.003)}|${Math.round(m.lon / 0.004)}`;
          isler.push(async () => {
            donusOnbellek[anahtar] ??= donusRotasi(k, m, zaman, sureDk).catch(() => null);
            m.donusler[k.id] = await donusOnbellek[anahtar];
          });
        });
      });
      await sinirli(isler, 8);
      ilk.forEach((m) => {
        m.aktarmaSayisi = Object.values(m.rotalar).reduce((t, it) => t + (it?.transfers || 0), 0);
        m.donusYok = hazir.filter((k) => k.tur === "transit" && donusSorunlu(m.donusler[k.id], zaman, sureDk)).map((k) => k.ad);
      });
    }
    ilk.forEach(goruntuDegerleri);
    ilk = ilk.filter((m) => isFinite(m.puan)).sort((a, b) => a.puan - b.puan);
    if (!ilk.length) throw new Error("Bu saatte toplu taşımayla herkesin ulaşabildiği mekan bulunamadı. Saati değiştirmeyi dene.");
    ilk = ilk.slice(0, 10);
    sonArama = { hazir, zaman, sureDk, ilk, toplu };
    sonArama.yayilmaHazirlik = yayilmaHazirla(sonArama); // arka planda; "Yayılmayı izle" hemen oynasın
    sonArama.yayilmaHazirlik.catch(() => { sonArama.yayilmaHazirlik = null; });
    sonuclariGoster(ilk, hazir, zaman);
    durum(`${mekanlar.length} mekan değerlendirildi${kapali ? `, ${kapali} kapalı mekan elendi` : ""}; en iyi ${ilk.length} tanesi aşağıda (${((performance.now() - t0) / 1000).toFixed(0)} sn).`);
    harita.fitBounds([...hazir.map((k) => [k.lat, k.lon]), ...ilk.map((m) => [m.lat, m.lon])], { padding: [40, 40] });
    mekanSec(ilk[0], hazir, 0, zaman);
    if (matchMedia("(max-width: 760px)").matches) $("#sonucBolumu").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    console.error(e);
    durum(e.message.startsWith("HTTP") || e.name === "TypeError" || e.name === "TimeoutError"
      ? "Harita servislerine ulaşılamadı. Birkaç saniye sonra tekrar dene."
      : e.message, true);
  } finally { btn.disabled = false; }
}

// Sıralama değişince yeniden hesaplamadan sırala
function yenidenSirala() {
  if (!sonArama) return;
  const { ilk, hazir, zaman } = sonArama;
  ilk.forEach(goruntuDegerleri);
  ilk.sort((a, b) => a.puan - b.puan);
  sonuclariGoster(ilk, hazir, zaman);
  mekanSec(ilk[0], hazir, 0, zaman);
}

// ---------- Sonuç listesi ----------
let pinler = [];
function kisiOzeti(m, k, i) {
  const it = m.rotalar?.[k.id];
  const ek = k.tur === "transit"
    ? (it ? (it.transfers ? `${it.transfers} aktarma` : (it.legs.every((l) => l.mode === "WALK") ? "yürüyerek" : "aktarmasız")) : "")
    : (m.mesafeler[i] != null ? km(m.mesafeler[i]) : "");
  return `<span><i class="nokta" style="background:${renk(k)}"></i>${TURLER[k.tur].ikon} ${esc(k.ad)}: <b>${dk(m.sureler[i])}</b>${ek ? ` · ${ek}` : ""}</span>`;
}
function acikRozeti(a) {
  if (!a || a.durum === "bilinmiyor") return `<span class="rozet-k gri" title="Haritada açılış saati yok">saat bilgisi yok</span>`;
  if (a.durum === "erken") return `<span class="rozet-k sari">⚠️ Buluşma bitmeden kapanıyor · kapanış ${a.kapanis}</span>`;
  return `<span class="rozet-k yesil">✓ Açık${a.kapanis ? ` · kapanış ${a.kapanis}` : " · 24 saat"}</span>`;
}

function sonuclariGoster(liste, hazir, zaman) {
  const ol = $("#sonuclar"); ol.innerHTML = ""; pinler = [];
  sonucKatmani.clearLayers();
  $("#sonucBolumu").hidden = false;
  liste.forEach((m, sira) => {
    const li = document.createElement("li"); li.className = "sonuc";
    const harita_url = `https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lon}`;
    const ucretler = hazir.map((k, i) => kisiUcreti(k, m, i));
    const toplamTl = ucretler.reduce((t, u) => t + (u?.tl || 0), 0);
    const tahmini = ucretler.some((u) => !u || u.tahmini);
    li.innerHTML = `
      <div class="ust"><span class="ad"></span><span class="tur"></span></div>
      <div class="rozetler">${acikRozeti(m.acik)}${m.donusYok?.length ? `<span class="rozet-k kirmizi">🌙 ${esc(m.donusYok.join(", "))}: dönüş yok</span>` : (m.donusler ? `<span class="rozet-k yesil">🌙 Herkes dönebilir</span>` : "")}</div>
      <div class="mesafeler">${hazir.map((k, i) => kisiOzeti(m, k, i)).join("")}</div>
      ${m.adres ? `<div class="ozet">${esc(m.adres)}</div>` : ""}
      <div class="ozet">En uzun yolculuk: ${dk(m.enUzun)} · Süre farkı: ${dk(m.fark)} · Yol ücreti toplam ≈ ${Math.round(toplamTl)} TL${tahmini ? "+" : ""} · <a href="${harita_url}" target="_blank" rel="noopener">Haritada aç</a></div>
      <div class="tarifler" hidden></div>`;
    li.querySelector(".ad").textContent = m.ad;
    li.querySelector(".tur").textContent = m.tur;
    li.addEventListener("click", (e) => { if (!e.target.closest("a")) mekanSec(m, hazir, sira, zaman); });
    ol.appendChild(li);
    const pin = L.marker([m.lat, m.lon], { icon: L.divIcon({ className: "", html: `<div class="mekan-pin"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] }) })
      .bindTooltip(`${sira + 1}. ${esc(m.ad)}`).on("click", () => mekanSec(m, hazir, sira, zaman)).addTo(sonucKatmani);
    pinler.push(pin);
  });
}

// Toplu taşıma yolculuğunun adımları (gidiş ya da dönüş)
function adimlarHTML(it) {
  return it.legs.map((l, n) => {
    const h = hatTuru(l);
    if (l.mode === "WALK") {
      if (l.duration < 60 && l.to.name !== "END") return "";
      const sonraki = it.legs[n + 1], onceki = it.legs[n - 1];
      let giris = "";
      if (sonraki && RAYLI.has(hatTuru(sonraki).ad)) { const g = enYakinGiris(l.to, l.from); if (g) giris = ` <span class="giris">· en yakın giriş${girisAdi(g) ? `: ${esc(girisAdi(g))}` : " haritada M ile işaretli"}</span>`; }
      else if (onceki && RAYLI.has(hatTuru(onceki).ad)) { const g = enYakinGiris(l.from, l.to); if (g) giris = ` <span class="giris">· en yakın çıkış${girisAdi(g) ? `: ${esc(girisAdi(g))}` : " haritada M ile işaretli"}</span>`; }
      return `<li class="adim yuru">🚶 ${dk(l.duration)} yürü → ${esc(yerAdi(l.to))}${giris}</li>`;
    }
    const durak = (l.intermediateStops?.length || 0) + 1;
    const hat = l.routeShortName || l.displayName || "";
    const etiket = hat.toLocaleLowerCase("tr").includes(h.ad.toLocaleLowerCase("tr")) ? hat : `${h.ad} ${hat}`;
    return `<li class="adim"><span class="hat" style="background:${h.renk}">${h.ikon} ${esc(etiket)}</span>
      <div>Bin: <b>${esc(yerAdi(l.from))}</b> · ${saatYaz(l.startTime)}${l.headsign ? ` · ${esc(l.headsign)} yönü` : ""}</div>
      <div>İn: <b>${esc(yerAdi(l.to))}</b> · ${saatYaz(l.endTime)} · ${durak} durak</div>
      ${tarifesiz(l) ? `<div class="not">Sabit saati yok, saatler tahmini. Birkaç dakika fazla bekleyebilirsin.</div>` : ""}</li>`;
  }).join("");
}

// Adım adım tarif (HTML)
function tarifHTML(k, m, i) {
  const t = TURLER[k.tur];
  const u = kisiUcreti(k, m, i);
  const bas = `<div class="tarif-bas"><i class="nokta" style="background:${renk(k)}"></i><b>${esc(k.ad)}</b> · ${t.ikon} ${t.ad} · ${dk(m.sureler[i])}${u ? ` · ${tlYaz(u)}${u.yakit ? " yakıt" : ""}` : ""}`;
  if (k.tur !== "transit") {
    return `<div class="tarif">${bas}${m.mesafeler[i] != null ? ` · ${km(m.mesafeler[i])}` : ""}</div>
      <div class="adim">${k.tur === "car" ? "Trafiksiz tahmini süre. Köprü, otopark ayrıca." : "Haritadaki yolu izle."}</div></div>`;
  }
  const it = m.rotalar?.[k.id];
  if (!it) return `<div class="tarif">${bas}</div><div class="adim">Bu saatte toplu taşıma rotası bulunamadı.</div></div>`;
  let donus = "";
  if (m.donusler) {
    const d = m.donusler[k.id], ss = sonArama?.sureDk ?? 120;
    donus = donusSorunlu(d, sonArama?.zaman ?? "", ss)
      ? `<div class="donus kotu">🌙 Dönüş: ${d ? `ilk toplu taşıma çıkışı ${saatYaz(d.startTime)}, uzun bekleme var` : "buluşma bitince 3 saat içinde toplu taşımayla dönüş yok"}. Taksi ya da araba düşün.</div>`
      : `<details class="donus"><summary>🌙 Dönüş: çıkış ${saatYaz(d.startTime)}, eve varış ${saatYaz(d.endTime)} (${dk(d.duration)})</summary><ol class="adimlar">${adimlarHTML(d)}</ol></details>`;
  }
  return `<div class="tarif">${bas} · Çıkış ${saatYaz(it.startTime)}, varış ${saatYaz(it.endTime)}</div><ol class="adimlar">${adimlarHTML(it)}</ol>${donus}</div>`;
}

// Seçilen mekana herkesin rotasını çizer, tarifleri açar.
let secimNo = 0;
async function mekanSec(m, hazir, sira, zaman) {
  const no = ++secimNo;
  cizgiKatmani.clearLayers();
  document.querySelectorAll(".sonuc").forEach((x, i) => {
    x.classList.toggle("secili", i === sira);
    const t = x.querySelector(".tarifler");
    if (i === sira) { t.innerHTML = hazir.map((k, j) => tarifHTML(k, m, j)).join(""); t.hidden = false; } else t.hidden = true;
  });
  pinler.forEach((p, i) => p.setIcon(L.divIcon({ className: "", html: `<div class="mekan-pin${i === sira ? " secili" : ""}"></div>`, iconSize: i === sira ? [22, 22] : [14, 14], iconAnchor: i === sira ? [11, 11] : [7, 7] })));
  pinler[sira]?.setZIndexOffset(1000).openTooltip();

  m.yollar ??= {};
  await Promise.all(hazir.map(async (k, i) => {
    if (k.tur === "transit" || m.yollar[k.id]) return;
    m.yollar[k.id] = await sokakRotasi(k, m, zaman);
    if (m.mesafeler[i] == null) m.mesafeler[i] = m.yollar[k.id].mesafe;
  }));
  await Promise.all(hazir.map(async (k) => {
    if (k.tur !== "transit" || m.rotalar?.[k.id] !== undefined) return;
    (m.rotalar ??= {})[k.id] = await topluRota(k, m, zaman).catch(() => null);
  }));
  if (no !== secimNo) return;
  const kart = document.querySelectorAll(".sonuc")[sira];
  if (kart) kart.querySelector(".tarifler").innerHTML = hazir.map((k, j) => tarifHTML(k, m, j)).join(""); // mesafe ve ücret artık belli

  hazir.forEach((k) => {
    const r = renk(k);
    if (k.tur !== "transit") {
      L.polyline(m.yollar[k.id].nokta, { color: r, weight: 10, opacity: 0.25, lineCap: "round" }).addTo(cizgiKatmani);
      L.polyline(m.yollar[k.id].nokta, { color: r, weight: 4, opacity: 0.95, lineCap: "round", dashArray: k.tur === "foot" ? "2 8" : null })
        .bindTooltip(`${esc(k.ad)} · ${TURLER[k.tur].ad}`, { sticky: true }).addTo(cizgiKatmani);
      return;
    }
    const it = m.rotalar?.[k.id];
    if (!it) return;
    it.legs.forEach((l, n) => {
      const nokta = l.legGeometry?.points ? cizgiCoz(l.legGeometry.points, l.legGeometry.precision || 7) : [[l.from.lat, l.from.lon], [l.to.lat, l.to.lon]];
      const h = hatTuru(l);
      if (l.mode === "WALK") {
        L.polyline(nokta, { color: r, weight: 3, opacity: 0.9, dashArray: "2 7", lineCap: "round" }).addTo(cizgiKatmani);
        const sonraki = it.legs[n + 1], onceki = it.legs[n - 1];
        const g = sonraki && RAYLI.has(hatTuru(sonraki).ad) ? enYakinGiris(l.to, l.from)
          : onceki && RAYLI.has(hatTuru(onceki).ad) ? enYakinGiris(l.from, l.to) : null;
        if (g) L.marker([g.lat, g.lon], { icon: L.divIcon({ className: "", html: `<div class="giris-pin">M</div>`, iconSize: [16, 16], iconAnchor: [8, 8] }), zIndexOffset: -1000 })
          .bindTooltip(`İstasyon girişi${girisAdi(g) ? `: ${esc(girisAdi(g))}` : ""}`).addTo(cizgiKatmani);
      } else {
        L.polyline(nokta, { color: r, weight: 12, opacity: 0.25, lineCap: "round" }).addTo(cizgiKatmani);
        L.polyline(nokta, { color: h.renk, weight: 5, opacity: 0.95, lineCap: "round" })
          .bindTooltip(`${esc(k.ad)}: ${h.ikon} ${esc(h.ad)} ${esc(l.routeShortName || "")} · ${esc(l.from.name)} → ${esc(l.to.name)}`, { sticky: true }).addTo(cizgiKatmani);
        L.circleMarker([l.from.lat, l.from.lon], { radius: 4, color: h.renk, fillColor: "#fff", fillOpacity: 1, weight: 2 })
          .bindTooltip(`Bin: ${esc(l.from.name)} · ${saatYaz(l.startTime)}`).addTo(cizgiKatmani);
      }
    });
  });
}

// ---------- Yayılma animasyonu (videodaki "herkesten aynı anda yayılan arama") ----------
const yayilmaKatmani = L.layerGroup().addTo(harita);
const tuval = L.canvas({ padding: 0.3 });
const SaatKutusu = L.Control.extend({
  options: { position: "bottomleft" },
  onAdd() { this.el = L.DomUtil.create("div", "saat-kutusu"); this.el.hidden = true; return this.el; },
});
const saatKutusu = new SaatKutusu().addTo(harita);

// Kişi başı "ne zaman nereye varır" noktaları: toplu taşımacı için duraklar, diğerleri için ızgaraya sokak süresi
async function yayilmaHazirla(d) {
  const hedef = d.ilk[0];
  const sinirKutu = L.latLngBounds([...d.hazir.map((k) => [k.lat, k.lon]), [hedef.lat, hedef.lon]]).pad(0.15);
  const izgara = [], n = 20;
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    izgara.push({ lat: sinirKutu.getSouth() + (sinirKutu.getNorth() - sinirKutu.getSouth()) * i / n, lon: sinirKutu.getWest() + (sinirKutu.getEast() - sinirKutu.getWest()) * j / n });
  }
  const kisiler_ = await Promise.all(d.hazir.map(async (k) => {
    let liste;
    if (k.tur === "transit") liste = d.toplu.get(k.id).noktalar.filter((p) => sinirKutu.contains([p.lat, p.lon]));
    else { const s = await sokakSureleri(k, izgara); liste = izgara.map((p, i) => ({ ...p, sure: s[i] })); }
    return liste.filter((p) => isFinite(p.sure)).sort((a, b) => a.sure - b.sure);
  }));
  return { sinirKutu, kisiler: kisiler_ };
}

async function yayilmaOynat() {
  const d = sonArama;
  if (!d) return durum("Önce \"Buluşma yeri bul\" ile bir arama yap.", true);
  const btn = $("#yayilma"); btn.disabled = true;
  try {
    yayilmaKatmani.clearLayers(); cizgiKatmani.clearLayers();
    const hedef = d.ilk[0];
    const sinir = Math.max(...d.ilk.map((m) => Math.max(...m.sureler))) * 1.1;
    // Kişi başı noktalar: toplu taşımacı için duraklar, diğerleri için ızgara noktalarına sokak süresi
    durum("Yayılma hazırlanıyor…");
    const { sinirKutu, kisiler: hazirNoktalar } = await (d.yayilmaHazirlik ??= yayilmaHazirla(d));
    const kisiNoktalari = hazirNoktalar.map((liste) => liste.filter((p) => p.sure <= sinir));
    durum("Herkes aynı anda yola çıkıyor: renkler, o kişinin o sürede ulaşabildiği yerler.");
    harita.fitBounds(sinirKutu);
    saatKutusu.el.hidden = false;
    const SURE_MS = 7000, basla = performance.now(), isaret = d.hazir.map(() => 0);
    await new Promise((bitti) => {
      // requestAnimationFrame arka plan sekmesinde durur; zamanlayıcı her durumda ilerler
      const kare = () => {
        const oran = Math.min(1, (performance.now() - basla) / SURE_MS), t = sinir * oran;
        kisiNoktalari.forEach((liste, ki) => {
          const r = renk(d.hazir[ki]);
          while (isaret[ki] < liste.length && liste[isaret[ki]].sure <= t) {
            const p = liste[isaret[ki]++];
            const topluMu = d.hazir[ki].tur === "transit"; // duraklar küçük ve belirgin; sokak ızgarası iri ama saydam (öbürlerini örtmesin)
            L.circleMarker([p.lat, p.lon], { renderer: tuval, radius: topluMu ? 2.5 : 5, stroke: false, fillColor: r, fillOpacity: topluMu ? 0.65 : 0.22, interactive: false }).addTo(yayilmaKatmani);
          }
        });
        saatKutusu.el.textContent = `⏱ ${Math.round(t / 60)} dk`;
        if (oran < 1) setTimeout(kare, 30); else bitti();
      };
      kare();
    });
    saatKutusu.el.textContent = `📍 ${hedef.ad}: en uzun yolculuk ${dk(hedef.enUzun)}`;
    await new Promise((r) => setTimeout(r, 1200));
    mekanSec(hedef, d.hazir, 0, d.zaman);
    setTimeout(() => { yayilmaKatmani.clearLayers(); saatKutusu.el.hidden = true; }, 4000);
    durum("");
  } catch (e) {
    console.error(e);
    durum("Yayılma gösterilemedi: toplu taşıma sunucusuna ulaşılamadı.", true);
  } finally { btn.disabled = false; }
}

// ---------- Başlat ----------
$("#kisiEkle").addEventListener("click", () => kisiEkle());
$("#bul").addEventListener("click", bul);
$("#yayilma").addEventListener("click", yayilmaOynat);
$("#siralama").addEventListener("change", yenidenSirala);
$("#paylas").addEventListener("click", async () => {
  kaydet();
  try { await navigator.clipboard.writeText(location.href); durum("Bağlantı kopyalandı. Gruba at, herkes kendi konumunu ekleyip geri göndersin."); }
  catch { prompt("Bu bağlantıyı kopyala:", location.href); }
});
document.querySelectorAll("#kategoriler button").forEach((b) => b.addEventListener("click", () => {
  kategori = b.dataset.k;
  document.querySelectorAll("#kategoriler button").forEach((x) => x.classList.toggle("secili", x === b));
  kaydet();
}));
$("#zaman").value = varsayilanZaman();

baglantidanYukle();
document.querySelectorAll("#kategoriler button").forEach((x) => x.classList.toggle("secili", x.dataset.k === kategori));
if (!kisiler.length) { kisiEkle({ ad: "Ben" }); kisiEkle({ ad: "Arkadaş 1" }); aktifId = kisiler[0].id; ciz(); }
haritayiSigdir();
