"""Yerel MOTIS'e örnek rotalar sorar ve adım adım yazdırır. Kullanım: python veri/rota_test.py"""
import json, sys, urllib.parse, urllib.request
SUNUCU = "http://localhost:8080/api/v1/plan"
ORNEKLER = [
    ("Balat -> Kadikoy", "41.0290,28.9480", "40.9910,29.0270"),
    ("Maslak -> Beylerbeyi", "41.1120,29.0200", "41.0430,29.0410"),
    ("Suadiye -> Taksim", "40.9600,29.0830", "41.0370,28.9850"),
    ("Kandilli -> Besiktas", "41.0740,29.0580", "41.0430,29.0070"),
]
ZAMAN = sys.argv[1] if len(sys.argv) > 1 else "2026-11-10T18:00:00+03:00"
TUR = {"WALK": "yuru", "BUS": "otobus", "SUBWAY": "metro", "TRAM": "tramvay", "FERRY": "vapur",
       "RAIL": "tren", "REGIONAL_RAIL": "Marmaray", "SUBURBAN": "Marmaray", "FUNICULAR": "funikuler", "AERIAL_LIFT": "teleferik"}
for ad, a, b in ORNEKLER:
    q = urllib.parse.urlencode({"fromPlace": a, "toPlace": b, "time": ZAMAN, "numItineraries": 2})
    j = json.load(urllib.request.urlopen(f"{SUNUCU}?{q}", timeout=60))
    print(f"\n### {ad}")
    for it in j.get("itineraries", [])[:2]:
        print(f"  {round(it['duration']/60)} dk, {it['transfers']} aktarma, {it['startTime'][11:16]}Z cikis")
        for l in it["legs"]:
            hat = l.get("routeShortName") or ""
            print(f"    - {TUR.get(l['mode'], l['mode'])} {hat} | {l['from']['name']} -> {l['to']['name']} | {round(l['duration']/60)} dk"
                  + (f" | {len(l.get('intermediateStops') or [])+1} durak, yon: {l.get('headsign','')}" if l['mode'] != 'WALK' else ""))
    if not j.get("itineraries"):
        print("  SONUC YOK")
