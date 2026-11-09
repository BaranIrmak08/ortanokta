// Çalıştır: node test/saatler.test.js
const assert = require("assert");
const { acikMi, saatleriCoz } = require("../saatler.js");
// 2026-11-10 Salı, 2026-11-14 Cumartesi, 2026-11-15 Pazar
const d = (metin, zaman, sure = 120) => acikMi(metin, zaman, sure);
assert.deepStrictEqual(d("24/7", "2026-11-10T03:00"), { durum: "acik", kapanis: null });
assert.strictEqual(d("Mo-Su 10:00-22:00", "2026-11-10T21:00").durum, "erken");          // 2 saatlik buluşma bitmeden kapanıyor
assert.strictEqual(d("Mo-Su 10:00-22:00", "2026-11-10T21:00").kapanis, "22:00");
assert.strictEqual(d("Mo-Su 10:00-22:00", "2026-11-10T19:00").durum, "acik");
assert.strictEqual(d("Mo-Su 10:00-22:00", "2026-11-10T23:00").durum, "kapali");
assert.strictEqual(d("Mo-Su 10:00-02:00", "2026-11-11T01:00", 45).durum, "acik");       // gece yarısını aşan
assert.strictEqual(d("Mo-Su 10:00-02:00", "2026-11-10T23:00").kapanis, "02:00");
assert.strictEqual(d("Mo-Fr 08:00-20:00; Sa 12:00-17:00", "2026-11-15T14:00").durum, "kapali"); // Pazar kural yok
assert.strictEqual(d("Mo-Fr 08:00-20:00; Sa 12:00-17:00", "2026-11-14T14:00").kapanis, "17:00");
assert.strictEqual(d("Mo-Sa 09:00-23:00; Su off", "2026-11-15T12:00").durum, "kapali");
assert.strictEqual(d("Mo,We 10:00-14:00,16:00-20:00", "2026-11-10T12:00").durum, "kapali"); // Salı
assert.strictEqual(d("Fr-Sa 18:00-03:00", "2026-11-15T01:00", 60).durum, "acik");         // Cumartesi gecesi -> Pazar 01:00
assert.strictEqual(d("Su-Tu 10:00-12:00", "2026-11-10T11:00").durum, "erken");          // hafta sonunu saran aralık
assert.strictEqual(d("Mo-Su,PH 10:00-22:00", "2026-11-10T12:00").durum, "acik");
assert.strictEqual(d("10:00-23:00", "2026-11-10T12:00").durum, "acik");
assert.strictEqual(d("garip yazım", "2026-11-10T12:00").durum, "bilinmiyor");
assert.strictEqual(d("", "2026-11-10T12:00").durum, "bilinmiyor");
console.log("saatler: tüm testler geçti");
assert.strictEqual(acikMi("07:00 - 23:00", "2026-11-10T12:00").durum, "acik");
assert.strictEqual(acikMi("We, Fr, Sa 22:00-05:00", "2026-11-10T23:00").durum, "kapali");
assert.strictEqual(acikMi("Mo-Sa 08:30-21:30, Su 09:00-14:00", "2026-11-15T12:00", 60).durum, "acik");
assert.strictEqual(acikMi("Mo-Sa 08:30-21:30, Su 09:00-14:00", "2026-11-15T15:00").durum, "kapali");
console.log("saatler: yazım farkı testleri geçti");
