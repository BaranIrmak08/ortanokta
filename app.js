// Orta Nokta: arkadaş grubuna adil uzaklıkta mekan bulur.
// Altyapı: Leaflet + OpenStreetMap (harita), Nominatim (adres arama), Overpass (mekanlar). Anahtar gerekmez.

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

let kisiler = [];          // {id, ad, adres, lat, lon}
let aktifId = null;
let kategori = "hepsi";
let sayac = 0;

// ---------- Harita ----------
const harita = L.map("harita", { zoomControl: true }).setView([41.015, 28.979], 11);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, attribution: "© OpenStreetMap katkıcıları",
}).addTo(harita);
const kisiKatmani = L.layerGroup().addTo(harita);
const sonucKatmani = L.layerGroup().addTo(harita);
const cizgiKatmani = L.layerGroup().addTo(harita);

harita.on("click", async (e) => {
  const k = kisiler.find((x) => x.id === aktifId) || kisiler.find((x) => x.lat == null);
  if (!k) return durum("Önce bir kişi seç ya da yeni kişi ekle.");
  k.lat = e.latlng.lat; k.lon = e.latlng.lng; k.adres = "Haritadan seçildi";
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
function renk(i) { return RENKLER[i % RENKLER.length]; }
function km(m) { return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`; }

function mesafe(a, b) { // haversine, metre
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Herkesi kapsayan en küçük çemberin merkezi: en uzaktaki kişiye olan mesafeyi en aza indiren nokta.
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

async function getJSON(url, secenek) {
  const r = await fetch(url, secenek);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function adresBul(metin) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=tr&q=${encodeURIComponent(metin)}`;
  const s = await getJSON(url);
  return s[0] ? { lat: +s[0].lat, lon: +s[0].lon, ad: s[0].display_name } : null;
}
async function tersAdres(lat, lon) {
  try {
    const s = await getJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=tr&lat=${lat}&lon=${lon}`);
    return s.display_name ? s.display_name.split(",").slice(0, 3).join(",") : null;
  } catch { return null; }
}

// ---------- Kişi listesi ----------
function kisiEkle(veri = {}) {
  const k = { id: ++sayac, ad: veri.ad || `Kişi ${kisiler.length + 1}`, adres: veri.adres || "", lat: veri.lat ?? null, lon: veri.lon ?? null };
  kisiler.push(k); aktifId = k.id; ciz();
  return k;
}

function ciz() {
  const ul = $("#kisiler"); ul.innerHTML = "";
  kisiKatmani.clearLayers();
  kisiler.forEach((k, i) => {
    const li = document.createElement("li");
    li.className = "kisi" + (k.id === aktifId ? " aktif" : "");
    li.innerHTML = `
      <span class="rozet" style="background:${renk(i)}">${harf(k.ad)}</span>
      <input class="isim" value="" aria-label="İsim">
      <button class="sil" title="Kişiyi sil">×</button>
      <div class="adres-satir">
        <input class="adres" placeholder="Adres, semt ya da mekan yaz" aria-label="Adres">
        <button class="kucuk konumum" title="Telefonun konumunu kullan">Konumum</button>
      </div>
      <div class="konum-yazi ${k.lat != null ? "tamam" : ""}"></div>`;
    li.querySelector(".isim").value = k.ad;
    li.querySelector(".adres").value = k.lat != null ? "" : k.adres;
    li.querySelector(".konum-yazi").textContent = k.lat != null ? `✓ ${k.adres || "Konum alındı"}` : "Konum yok";
    li.addEventListener("click", () => { if (aktifId !== k.id) { aktifId = k.id; ul.querySelectorAll(".kisi").forEach((x) => x.classList.remove("aktif")); li.classList.add("aktif"); } });
    li.querySelector(".isim").addEventListener("input", (e) => { k.ad = e.target.value; li.querySelector(".rozet").textContent = harf(k.ad); kaydet(); });
    li.querySelector(".isim").addEventListener("change", ciz);
    li.querySelector(".sil").addEventListener("click", (e) => { e.stopPropagation(); kisiler = kisiler.filter((x) => x !== k); ciz(); });
    li.querySelector(".adres").addEventListener("keydown", async (e) => {
      if (e.key !== "Enter" || !e.target.value.trim()) return;
      durum("Adres aranıyor…");
      try {
        const s = await adresBul(e.target.value.trim());
        if (!s) return durum("Bu adres bulunamadı. Daha açık yaz (ör. 'Kadıköy Moda, İstanbul').", true);
        Object.assign(k, { lat: s.lat, lon: s.lon, adres: s.ad.split(",").slice(0, 3).join(",") });
        durum(""); ciz(); haritayiSigdir();
      } catch { durum("Adres servisine ulaşılamadı, biraz sonra tekrar dene.", true); }
    });
    li.querySelector(".konumum").addEventListener("click", (e) => {
      e.stopPropagation();
      if (!navigator.geolocation) return durum("Bu tarayıcı konum vermiyor.", true);
      durum("Konum alınıyor…");
      navigator.geolocation.getCurrentPosition(async (p) => {
        Object.assign(k, { lat: p.coords.latitude, lon: p.coords.longitude, adres: "Telefon konumu" });
        durum(""); ciz(); haritayiSigdir();
        k.adres = (await tersAdres(k.lat, k.lon)) || k.adres; ciz();
      }, () => durum("Konum izni verilmedi. Adres yazabilir ya da haritaya tıklayabilirsin.", true), { enableHighAccuracy: true, timeout: 15000 });
    });
    ul.appendChild(li);

    if (k.lat != null) {
      L.marker([k.lat, k.lon], {
        icon: L.divIcon({ className: "", html: `<div class="pin" style="background:${renk(i)}">${harf(k.ad)}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
        draggable: true,
      }).bindTooltip(k.ad).on("dragend", async (e) => {
        const ll = e.target.getLatLng(); k.lat = ll.lat; k.lon = ll.lng; k.adres = (await tersAdres(k.lat, k.lon)) || "Haritadan seçildi"; ciz();
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

// ---------- Bağlantı ve kayıt ----------
function kaydet() {
  const hazir = kisiler.filter((k) => k.lat != null);
  const parca = hazir.map((k) => [k.ad, k.lat.toFixed(5), k.lon.toFixed(5)].map(encodeURIComponent).join(",")).join(";");
  history.replaceState(null, "", hazir.length ? `#g=${parca}&k=${kategori}` : location.pathname);
}
function baglantidanYukle() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get("k") && KATEGORI[h.get("k")]) kategori = h.get("k");
  (h.get("g") || "").split(";").filter(Boolean).forEach((p) => {
    const [ad, lat, lon] = p.split(",").map(decodeURIComponent);
    if (!isNaN(+lat) && !isNaN(+lon)) kisiEkle({ ad, lat: +lat, lon: +lon, adres: "Bağlantıdan geldi" });
  });
}

// ---------- Mekan arama ----------
async function overpass(sorgu) {
  let son;
  for (const u of OVERPASS) {
    try { return await getJSON(u, { method: "POST", body: "data=" + encodeURIComponent(sorgu), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(10000) }); }
    catch (e) { son = e; }
  }
  throw son;
}

// Birincil kaynak Photon (hızlı, merkeze en yakın mekanları döner). Çalışmazsa Overpass'a düşer.
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

async function mekanlariGetir(merkez, yaricap) {
  // "Hepsi" seçiliyse her türü ayrı sor ki kafeler sinemaları ezmesin.
  const gruplar = kategori === "hepsi" ? ["kafe", "bar", "restoran", "etkinlik"] : [kategori];
  let sonuc;
  try {
    sonuc = (await Promise.all(gruplar.map((g) => photonGetir(merkez, yaricap, KATEGORI[g])))).flat();
  } catch (e) {
    console.warn("Photon çalışmadı, Overpass deneniyor", e);
    sonuc = await overpassGetir(merkez, yaricap, KATEGORI[kategori]);
  }
  const gorulen = new Set();
  return sonuc.filter((m) => !gorulen.has(m.id) && gorulen.add(m.id));
}

async function bul() {
  const hazir = kisiler.filter((k) => k.lat != null);
  if (hazir.length < 2) return durum("En az 2 kişinin konumu lazım.", true);
  const btn = $("#bul"); btn.disabled = true;
  sonucKatmani.clearLayers(); cizgiKatmani.clearLayers();
  try {
    const { merkez, yaricap } = adilMerkez(hazir);
    // Arama çemberi: grup dağıldıkça büyür, bulamazsa genişletir.
    let r = Math.min(Math.max(1500, yaricap * 0.5), 15000), mekanlar = [];
    for (let deneme = 0; deneme < 3; deneme++) {
      durum(`Orta noktanın ${km(r)} çevresinde mekan aranıyor…`);
      mekanlar = await mekanlariGetir(merkez, r);
      if (mekanlar.length >= 8) break;
      r = Math.min(r * 2, 30000);
    }
    const cember = mekanlar.length ? Math.max(...mekanlar.map((m) => mesafe(merkez, m))) : r;
    L.circle([merkez.lat, merkez.lon], { radius: cember, color: "#e4572e", weight: 1, fillOpacity: 0.04, dashArray: "4 6" }).addTo(sonucKatmani);
    L.circleMarker([merkez.lat, merkez.lon], { radius: 6, color: "#1d1d1f", fillColor: "#fff", fillOpacity: 1, weight: 2 })
      .bindTooltip("Adil orta nokta").addTo(sonucKatmani);

    if (!mekanlar.length) { $("#sonucBolumu").hidden = true; return durum("Bu bölgede uygun mekan bulunamadı. Başka bir kategori dene.", true); }

    // Puan: en uzaktaki kişinin mesafesi + aradaki farkın yarısı. Düşük olan daha adil.
    for (const m of mekanlar) {
      m.mesafeler = hazir.map((k) => mesafe(k, m));
      m.enUzak = Math.max(...m.mesafeler);
      m.fark = m.enUzak - Math.min(...m.mesafeler);
      m.puan = m.enUzak + 0.5 * m.fark;
    }
    mekanlar.sort((a, b) => a.puan - b.puan);
    const ilk = mekanlar.slice(0, 15);
    sonuclariGoster(ilk, hazir);
    durum(`${mekanlar.length} mekan bulundu, en adil ${ilk.length} tanesi aşağıda.`);
    harita.fitBounds([...hazir.map((k) => [k.lat, k.lon]), ...ilk.map((m) => [m.lat, m.lon])], { padding: [40, 40] });
    mekanSec(ilk[0], hazir, 0);
  } catch (e) {
    console.error(e);
    durum("Mekan servisine ulaşılamadı (ücretsiz servis yoğun olabilir). Birkaç saniye sonra tekrar dene.", true);
  } finally { btn.disabled = false; }
}

let pinler = [];
function sonuclariGoster(liste, hazir) {
  const ol = $("#sonuclar"); ol.innerHTML = ""; pinler = [];
  $("#sonucBolumu").hidden = false;
  liste.forEach((m, sira) => {
    const li = document.createElement("li"); li.className = "sonuc";
    const harita_url = `https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lon}`;
    li.innerHTML = `
      <div class="ust"><span class="ad"></span><span class="tur"></span></div>
      <div class="mesafeler">${hazir.map((k, i) => `<span><i class="nokta" style="background:${renk(kisiler.indexOf(k))}"></i>${esc(k.ad)}: ${km(m.mesafeler[i])}</span>`).join("")}</div>
      ${m.adres ? `<div class="ozet">${esc(m.adres)}</div>` : ""}
      <div class="ozet">En uzak: ${km(m.enUzak)} · Fark: ${km(m.fark)} · <a href="${harita_url}" target="_blank" rel="noopener">Haritada aç</a></div>`;
    li.querySelector(".ad").textContent = m.ad;
    li.querySelector(".tur").textContent = m.tur;
    li.addEventListener("click", (e) => { if (e.target.tagName !== "A") mekanSec(m, hazir, sira); });
    ol.appendChild(li);
    const pin = L.marker([m.lat, m.lon], { icon: L.divIcon({ className: "", html: `<div class="mekan-pin"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] }) })
      .bindTooltip(`${sira + 1}. ${esc(m.ad)}`).on("click", () => mekanSec(m, hazir, sira)).addTo(sonucKatmani);
    pinler.push(pin);
  });
}

function mekanSec(m, hazir, sira) {
  cizgiKatmani.clearLayers();
  hazir.forEach((k) => L.polyline([[k.lat, k.lon], [m.lat, m.lon]], { color: renk(kisiler.indexOf(k)), weight: 3, opacity: 0.8, dashArray: "6 6" }).addTo(cizgiKatmani));
  document.querySelectorAll(".sonuc").forEach((x, i) => x.classList.toggle("secili", i === sira));
  pinler.forEach((p, i) => p.setIcon(L.divIcon({ className: "", html: `<div class="mekan-pin${i === sira ? " secili" : ""}"></div>`, iconSize: i === sira ? [22, 22] : [14, 14], iconAnchor: i === sira ? [11, 11] : [7, 7] })));
  pinler[sira]?.setZIndexOffset(1000).openTooltip();
}

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// ---------- Başlat ----------
$("#kisiEkle").addEventListener("click", () => kisiEkle());
$("#bul").addEventListener("click", bul);
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

baglantidanYukle();
document.querySelectorAll("#kategoriler button").forEach((x) => x.classList.toggle("secili", x.dataset.k === kategori));
if (!kisiler.length) { kisiEkle({ ad: "Ben" }); kisiEkle({ ad: "Arkadaş 1" }); aktifId = kisiler[0].id; ciz(); }
haritayiSigdir();
