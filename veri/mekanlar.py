"""İstanbul OSM haritasından buluşma mekanlarını çıkarır (dış mekan servisine bağımlılık kalmasın).

Kullanım: python veri/mekanlar.py   (önce veri/indir.py)
Gerekli: pip install osmium
Çıktı : mekanlar.json (site kökünde; tarayıcı doğrudan okur)
Biçim : {"turler": [...], "m": [[lat, lon, ad, tur_no, adres], ...]}
"""
import json
import pathlib

import osmium

KOK = pathlib.Path(__file__).resolve().parent
GIRDI = KOK / "indirilen" / "Istanbul.osm.pbf"
CIKTI = KOK.parent / "mekanlar.json"

# OSM etiketi -> sitedeki tür kodu (app.js'deki KATEGORI ile aynı aileler)
ETIKET = {
    ("amenity", "cafe"): "cafe", ("amenity", "bar"): "bar", ("amenity", "pub"): "pub",
    ("amenity", "biergarten"): "biergarten", ("amenity", "restaurant"): "restaurant",
    ("amenity", "fast_food"): "fast_food", ("amenity", "cinema"): "cinema",
    ("amenity", "theatre"): "theatre", ("amenity", "arts_centre"): "arts_centre",
    ("amenity", "nightclub"): "nightclub", ("leisure", "bowling_alley"): "bowling_alley",
    ("leisure", "escape_game"): "escape_game", ("leisure", "amusement_arcade"): "amusement_arcade",
    ("leisure", "miniature_golf"): "miniature_golf",
}
TURLER = sorted(set(ETIKET.values()))
TUR_NO = {t: i for i, t in enumerate(TURLER)}


def tur_bul(etiketler):
    for (anahtar, deger), tur in ETIKET.items():
        if etiketler.get(anahtar) == deger:
            return tur
    return None


def adres(etiketler):
    sokak = etiketler.get("addr:street", "")
    if sokak and etiketler.get("addr:housenumber"):
        sokak += " " + etiketler["addr:housenumber"]
    return ", ".join(x for x in (sokak, etiketler.get("addr:suburb") or etiketler.get("addr:district", "")) if x)


def main():
    mekanlar, gorulen = [], set()
    isleyici = osmium.FileProcessor(str(GIRDI)).with_locations().with_filter(osmium.filter.KeyFilter("amenity", "leisure"))
    for nesne in isleyici:
        if nesne.is_relation():
            continue
        etiketler = {t.k: t.v for t in nesne.tags}
        tur, ad = tur_bul(etiketler), etiketler.get("name:tr") or etiketler.get("name")
        if not tur or not ad:
            continue
        if nesne.is_node():
            lat, lon = nesne.location.lat, nesne.location.lon
        else:  # bina olarak çizilmiş mekan: köşelerin ortalaması
            noktalar = [(n.location.lat, n.location.lon) for n in nesne.nodes if n.location.valid()]
            if not noktalar:
                continue
            lat, lon = sum(p[0] for p in noktalar) / len(noktalar), sum(p[1] for p in noktalar) / len(noktalar)
        anahtar = (ad, round(lat, 4), round(lon, 4))
        if anahtar in gorulen:
            continue
        gorulen.add(anahtar)
        mekanlar.append([round(lat, 6), round(lon, 6), ad, TUR_NO[tur], adres(etiketler)])
    CIKTI.write_text(json.dumps({"turler": TURLER, "m": mekanlar}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    sayim = {t: sum(1 for m in mekanlar if TURLER[m[3]] == t) for t in TURLER}
    print(f"{len(mekanlar):,} mekan -> {CIKTI.name} ({CIKTI.stat().st_size / 1e6:.1f} MB)")
    print(sayim)


if __name__ == "__main__":
    main()
