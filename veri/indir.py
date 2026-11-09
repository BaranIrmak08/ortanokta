"""İBB toplu taşıma verisini ve İstanbul haritasını indirir.

Kullanım: python veri/indir.py
Çıktı: veri/indirilen/{iett,ibb}/*.csv ve veri/indirilen/Istanbul.osm.pbf
"""
import json
import pathlib
import urllib.request

KOK = pathlib.Path(__file__).resolve().parent / "indirilen"
CKAN = "https://data.ibb.gov.tr/api/3/action/package_show?id="
VERI_SETLERI = {
    "iett": "8540e256-6df5-4719-85bc-e64e91508ede",  # IETT GTFS Data (otobüs, metrobüs)
    "ibb": "121a9892-7945-419a-9b89-49f6083926df",   # Public Transport GTFS Data (raylı, vapur, minibüs, dolmuş)
}
OSM = "https://download.bbbike.org/osm/bbbike/Istanbul/Istanbul.osm.pbf"


def indir(url, hedef):
    hedef.parent.mkdir(parents=True, exist_ok=True)
    print(f"  indiriliyor: {hedef.name}")
    istek = urllib.request.Request(url, headers={"User-Agent": "ortanokta-veri/1.0"})
    with urllib.request.urlopen(istek, timeout=600) as yanit, open(hedef, "wb") as f:
        while parca := yanit.read(1 << 20):
            f.write(parca)


def main():
    for ad, kimlik in VERI_SETLERI.items():
        print(f"[{ad}]")
        with urllib.request.urlopen(CKAN + kimlik, timeout=60) as y:
            paket = json.load(y)["result"]
        for kaynak in paket["resources"]:
            if kaynak["format"].upper() != "CSV":
                continue  # aynı dosyanın ZIP kopyasını atla
            indir(kaynak["url"], KOK / ad / f"{kaynak['name']}.csv")
    print("[osm]")
    indir(OSM, KOK / "Istanbul.osm.pbf")
    print("Bitti.")


if __name__ == "__main__":
    main()
