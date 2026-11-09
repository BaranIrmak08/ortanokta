// OSM "opening_hours" yazımını çözer ve bir mekanın belli bir zaman aralığında açık olup olmadığını söyler.
// Desteklenen: "24/7", "Mo-Fr 09:00-18:00; Sa 10:00-02:00", "Mo,We 10:00-14:00,16:00-20:00", "Su off",
// gün belirtmeyen kurallar ("10:00-22:00"), gece yarısını aşan saatler. Anlaşılmayan yazımda null döner (bilinmiyor).
// Tatil (PH/SH), ay/tarih kuralları desteklenmez: bunları içeren kural atlanır.

const GUNLER = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function gunSeciciCoz(metin) {
  const gunler = new Set();
  for (const parca of metin.split(",")) {
    const p = parca.trim();
    if (p === "PH" || p === "SH") continue;
    const m = p.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/);
    if (!m) return null;
    const a = GUNLER.indexOf(m[1]), b = m[2] ? GUNLER.indexOf(m[2]) : a;
    for (let i = a; ; i = (i + 1) % 7) { gunler.add(i); if (i === b) break; }
  }
  return gunler;
}

function dakika(s) {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  return m ? +m[1] * 60 + +m[2] : null;
}

// Haftalık tablo: gün (0=Pzt) -> [[başlangıç, bitiş]] dakika; bitiş 1440'ı aşabilir (ertesi güne taşar)
function saatleriCoz(metin) {
  if (!metin) return null;
  // Yaygın yazım farklarını düzelt: "07:00 - 23:00", "We, Fr", "Mo-Sa 08:30-21:30, Su 09:00-14:00"
  const t = metin.trim()
    .replace(/\s*-\s*/g, "-")
    .replace(/(Mo|Tu|We|Th|Fr|Sa|Su|PH)\s*,\s*(?=(Mo|Tu|We|Th|Fr|Sa|Su|PH))/g, "$1,")
    .replace(/(\d)\s*,\s*(?=(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b)/g, "$1; ");
  if (t === "24/7") return Array.from({ length: 7 }, () => [[0, 1440]]);
  const hafta = Array.from({ length: 7 }, () => null); // null = bu gün için kural yok
  for (let kural of t.split(";")) {
    kural = kural.trim();
    if (!kural) continue;
    if (/PH|SH|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|week|"/.test(kural) && !/^(Mo|Tu|We|Th|Fr|Sa|Su)/.test(kural.replace(/^PH,?\s*/, ""))) continue;
    const m = kural.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?,?)+)\s+(.+)$/);
    let gunler = new Set([0, 1, 2, 3, 4, 5, 6]), saatKismi = kural;
    if (m) {
      gunler = gunSeciciCoz(m[1]);
      if (!gunler) return null;
      saatKismi = m[2].trim();
    }
    let araliklar;
    if (/^(off|closed)$/i.test(saatKismi)) araliklar = [];
    else {
      araliklar = [];
      for (const a of saatKismi.split(",")) {
        const x = a.trim().match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\+?$/) || a.trim().match(/^(\d{1,2}:\d{2})\+$/);
        if (!x) return null;
        const bas = dakika(x[1]);
        let bit = x[2] ? dakika(x[2]) : 1440 + 120; // "18:00+" -> açık uçlu, gece 02:00 varsay
        if (bas == null || bit == null) return null;
        if (bit <= bas) bit += 1440;
        araliklar.push([bas, bit]);
      }
    }
    for (const g of gunler) hafta[g] = araliklar;
  }
  if (hafta.every((g) => g === null)) return null;
  return hafta.map((g) => g || []);
}

// Haftanın dakikası (Pzt 00:00 = 0) açık mı?
function acikMiDakika(hafta, haftaDk) {
  const gun = Math.floor(haftaDk / 1440) % 7, dk = haftaDk % 1440;
  if (hafta[gun].some(([a, b]) => dk >= a && dk < b)) return true;
  const dun = (gun + 6) % 7;
  return hafta[dun].some(([, b]) => b > 1440 && dk + 1440 < b);
}

// yerel: "2026-11-10T19:00" (İstanbul saati). sureDk: buluşmanın süresi.
// Sonuç: {durum: "acik" | "kapali" | "erken" | "bilinmiyor", kapanis: "HH:MM" | null}
function acikMi(metin, yerel, sureDk = 120) {
  const hafta = saatleriCoz(metin);
  if (!hafta) return { durum: "bilinmiyor", kapanis: null };
  const [g, s] = yerel.split("T");
  const [y, a, d] = g.split("-").map(Number);
  const gun = (new Date(Date.UTC(y, a - 1, d)).getUTCDay() + 6) % 7; // 0 = Pazartesi
  const [sa, dk] = s.split(":").map(Number);
  const bas = gun * 1440 + sa * 60 + dk;
  if (!acikMiDakika(hafta, bas)) return { durum: "kapali", kapanis: null };
  for (let t = bas + 15; t <= bas + 24 * 60; t += 15) {
    if (!acikMiDakika(hafta, t % (7 * 1440))) {
      const kapanis = `${String(Math.floor((t % 1440) / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
      return { durum: t < bas + sureDk ? "erken" : "acik", kapanis };
    }
  }
  return { durum: "acik", kapanis: null }; // 24 saat açık
}

if (typeof module !== "undefined") module.exports = { saatleriCoz, acikMi };
