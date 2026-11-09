"""İndirilen İBB verisini MOTIS'in okuyacağı temiz GTFS zip'lerine çevirir.

Kullanım: python veri/hazirla.py
Girdi : veri/indirilen/{iett,ibb}/  (veri/indir.py ile)
Çıktı : veri/hazir/iett.gtfs.zip, veri/hazir/ibb.gtfs.zip

Düzeltilen sorunlar (İBB dosyaları Excel'den geçmiş):
- Karışık kodlama (UTF-8 / Windows-1254) ve ayraç (, / ;)
- İETT durak koordinatları bozuk: "410.191.700.005.564" -> 41.0191700005564
- İETT stop_times.csv 1.048.576 satırda kesik: tam hali stop_times.zip'ten okunur
- Ara duraklarda boş saatler: duraklar arası mesafeye göre doldurulur
- Tarifelerin bitiş tarihi geçmiş: BITIS tarihine uzatılır
- Standart dışı hat türleri (9 minibüs, 10 dolmuş) -> 3 (otobüs)
"""
import csv
import io
import math
import pathlib
import zipfile

KOK = pathlib.Path(__file__).resolve().parent
GIRDI, CIKTI = KOK / "indirilen", KOK / "hazir"
BITIS = "20271231"
GECERLI_TUR = {"0", "1", "2", "3", "4", "5", "6", "7", "11", "12"}
TUR_DUZELT = {"9": "3", "10": "3"}
ISTANBUL = (40.7, 41.7, 27.9, 30.0)  # enlem min/maks, boylam min/maks


def metin(yol):
    ham = yol.read_bytes()
    try:
        return ham.decode("utf-8-sig")
    except UnicodeDecodeError:
        return ham.decode("cp1254")


def oku(yol):
    t = metin(yol)
    ayrac = ";" if t.split("\n", 1)[0].count(";") > t.split("\n", 1)[0].count(",") else ","
    satirlar = list(csv.DictReader(io.StringIO(t), delimiter=ayrac))
    return [{k.strip(): (v or "").strip() for k, v in s.items() if k and k.strip()} for s in satirlar]


def yaz(z, ad, satirlar, alanlar=None):
    alanlar = alanlar or list(satirlar[0].keys())
    tampon = io.StringIO()
    w = csv.DictWriter(tampon, fieldnames=alanlar, extrasaction="ignore", lineterminator="\n")
    w.writeheader()
    w.writerows(satirlar)
    z.writestr(ad, tampon.getvalue())
    print(f"    {ad}: {len(satirlar):,} satır")


def istanbulda(lat, lon):
    return ISTANBUL[0] <= lat <= ISTANBUL[1] and ISTANBUL[2] <= lon <= ISTANBUL[3]


def bozuk_koordinat(deger):
    """'410.191.700.005.564' -> 41.0191700005564 (Excel binlik ayracı bozmuş)."""
    rakam = "".join(c for c in deger if c.isdigit())
    if len(rakam) < 3:
        return None
    return float(rakam[:2] + "." + rakam[2:])


def sn(saat):
    s, d, n = saat.split(":")
    return int(s) * 3600 + int(d) * 60 + int(n)


def saat(sn_):
    return f"{sn_ // 3600:02d}:{sn_ % 3600 // 60:02d}:{sn_ % 60:02d}"


def mesafe(a, b):
    r = math.pi / 180
    x = (b[1] - a[1]) * r * math.cos((a[0] + b[0]) / 2 * r)
    y = (b[0] - a[0]) * r
    return 6371000 * math.hypot(x, y)


def ortak_duzelt(z, klasor, stops):
    """agency, routes, trips, calendar: iki veri setinde aynı düzeltmeler."""
    agency = oku(klasor / "agency.csv")
    for a in agency:
        a["agency_timezone"] = a.get("agency_timezone") or "Europe/Istanbul"
        a["agency_url"] = a.get("agency_url") or "https://www.ibb.istanbul"
    yaz(z, "agency.txt", agency)

    routes = oku(klasor / "routes.csv")
    for r in routes:
        r["route_type"] = TUR_DUZELT.get(r["route_type"], r["route_type"])
    routes = [r for r in routes if r["route_type"] in GECERLI_TUR]
    yaz(z, "routes.txt", routes, ["route_id", "agency_id", "route_short_name", "route_long_name", "route_type", "route_color", "route_text_color"])

    calendar = oku(klasor / "calendar.csv")
    for c in calendar:
        c["end_date"] = max(c["end_date"], BITIS)
    yaz(z, "calendar.txt", calendar, ["service_id", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "start_date", "end_date"])

    hat_idler = {r["route_id"] for r in routes}
    servisler = {c["service_id"] for c in calendar}
    return [t for t in oku(klasor / "trips.csv") if t["route_id"] in hat_idler and t["service_id"] in servisler]


TRIP_ALANLARI = ["route_id", "service_id", "trip_id", "trip_headsign", "direction_id", "shape_id"]


def sefer_duzelt(satirlar, konum):
    """Bir seferin duraklarını sıralar, boş saatleri mesafeye göre doldurur. Geçersizse None."""
    satirlar.sort(key=lambda s: int(s["stop_sequence"]))
    satirlar = [s for s in satirlar if s["stop_id"] in konum]
    if len(satirlar) < 2:
        return None
    zaman = [sn(s["arrival_time"] or s["departure_time"]) if (s["arrival_time"] or s["departure_time"]) else None for s in satirlar]
    if zaman[0] is None or zaman[-1] is None:
        return None
    yol = [0.0]
    for a, b in zip(satirlar, satirlar[1:]):
        yol.append(yol[-1] + mesafe(konum[a["stop_id"]], konum[b["stop_id"]]))
    i = 0
    while i < len(zaman) - 1:
        j = i + 1
        while zaman[j] is None:
            j += 1
        for k in range(i + 1, j):
            oran = (yol[k] - yol[i]) / (yol[j] - yol[i]) if yol[j] > yol[i] else (k - i) / (j - i)
            zaman[k] = round(zaman[i] + oran * (zaman[j] - zaman[i]))
        i = j
    for k in range(1, len(zaman)):  # saatler geri gitmesin
        zaman[k] = max(zaman[k], zaman[k - 1])
    for s, z_ in zip(satirlar, zaman):
        kalkis = sn(s["departure_time"]) if s["departure_time"] and s["arrival_time"] else z_
        s["arrival_time"], s["departure_time"] = saat(z_), saat(max(kalkis, z_))
    return satirlar


def stop_times_yaz(z, kaynak_satirlar, trips, konum, frekans=None):
    """Seferleri düzeltip yazar. frekans={trip_id: [(bas, bit, aralik)]} verilirse
    "her N dakikada bir" seferleri tek tek açar (MOTIS bunu kendisi çok yavaş yapıyor)."""
    frekans = frekans or {}
    trip_bilgi = {t["trip_id"]: t for t in trips}
    gecerli_trip = set(trip_bilgi)
    yeni_trips = []
    alanlar = ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"]
    tampon = io.StringIO()
    w = csv.DictWriter(tampon, fieldnames=alanlar, extrasaction="ignore", lineterminator="\n")
    w.writeheader()
    sefer, onceki, yazilan, atilan, gorulen = [], None, 0, 0, set()

    def bitir():
        nonlocal yazilan, atilan
        if not sefer:
            return
        tid = sefer[0]["trip_id"]
        if tid in gorulen:
            raise RuntimeError(f"stop_times sefer sırasına göre gruplu değil: {tid}")
        gorulen.add(tid)
        if tid not in gecerli_trip:
            return
        sonuc = sefer_duzelt(sefer, konum)
        if not sonuc:
            atilan += 1
            return
        if tid not in frekans:
            w.writerows(sonuc)
            yeni_trips.append(trip_bilgi[tid])
            yazilan += 1
            return
        ilk = sn(sonuc[0]["departure_time"])
        for bas, bit, aralik in frekans[tid]:
            for t0 in range(bas, bit, aralik):
                kayma, yeni_id = t0 - ilk, f"{tid}_{t0}"
                w.writerows({**s_, "trip_id": yeni_id, "arrival_time": saat(sn(s_["arrival_time"]) + kayma),
                             "departure_time": saat(sn(s_["departure_time"]) + kayma)} for s_ in sonuc)
                yeni_trips.append({**trip_bilgi[tid], "trip_id": yeni_id})
                yazilan += 1

    for s in kaynak_satirlar:
        if s["trip_id"] != onceki and sefer:
            bitir()
            sefer = []
        onceki = s["trip_id"]
        sefer.append(s)
    bitir()
    z.writestr("stop_times.txt", tampon.getvalue())
    print(f"    stop_times.txt: {yazilan:,} sefer yazıldı, {atilan:,} geçersiz sefer atıldı")
    yaz(z, "trips.txt", yeni_trips, TRIP_ALANLARI)


def iett():
    k = GIRDI / "iett"
    print("[İETT]")
    with zipfile.ZipFile(CIKTI / "iett.gtfs.zip", "w", zipfile.ZIP_DEFLATED) as z:
        stops, bozuk = [], 0
        for s in oku(k / "stops.csv"):
            lat, lon = bozuk_koordinat(s["stop_lat"]), bozuk_koordinat(s["stop_lon"])
            if lat is None or lon is None or not istanbulda(lat, lon):
                bozuk += 1
                continue
            s["stop_lat"], s["stop_lon"] = f"{lat:.7f}", f"{lon:.7f}"
            s["stop_name"] = s["stop_name"].replace("�", "?")
            stops.append(s)
        print(f"    koordinatı düzeltilemeyen durak: {bozuk}")
        yaz(z, "stops.txt", stops, ["stop_id", "stop_code", "stop_name", "stop_lat", "stop_lon"])
        konum = {s["stop_id"]: (float(s["stop_lat"]), float(s["stop_lon"])) for s in stops}
        trips = ortak_duzelt(z, k, stops)
        with zipfile.ZipFile(k / "stop_times.zip") as kz, kz.open(kz.namelist()[0]) as f:
            okuyucu = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            stop_times_yaz(z, okuyucu, trips, konum)


def ibb():
    k = GIRDI / "ibb"
    print("[İBB raylı sistem, vapur, minibüs, dolmuş]")
    with zipfile.ZipFile(CIKTI / "ibb.gtfs.zip", "w", zipfile.ZIP_DEFLATED) as z:
        stops = [s for s in oku(k / "stops.csv") if s["stop_lat"] and istanbulda(float(s["stop_lat"]), float(s["stop_lon"]))]
        yaz(z, "stops.txt", stops, ["stop_id", "stop_code", "stop_name", "stop_lat", "stop_lon", "location_type", "parent_station", "wheelchair_boarding"])
        konum = {s["stop_id"]: (float(s["stop_lat"]), float(s["stop_lon"])) for s in stops}
        trips = ortak_duzelt(z, k, stops)
        frekans = {}
        for f in oku(k / "frequencies.csv"):
            frekans.setdefault(f["trip_id"], []).append((sn(f["start_time"]), sn(f["end_time"]), max(60, int(f["headway_secs"]))))
        satirlar = sorted(oku(k / "stop_times.csv"), key=lambda s: s["trip_id"])
        stop_times_yaz(z, satirlar, trips, konum, frekans)
        shapes = oku(k / "shapes.csv")
        yaz(z, "shapes.txt", shapes, ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"])


if __name__ == "__main__":
    CIKTI.mkdir(exist_ok=True)
    ibb()
    iett()
    print("Bitti:", ", ".join(f"{p.name} ({p.stat().st_size / 1e6:.1f} MB)" for p in CIKTI.glob("*.zip")))
