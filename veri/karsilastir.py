"""5 örnek rotayı yerel MOTIS'e şimdiki saatle sorar (Google ile karşılaştırma için).
Kullanım: python veri/karsilastir.py"""
import datetime, json, urllib.parse, urllib.request
ROTALAR = [
    ("Balat -> Kadikoy",       "41.0290,28.9480", "40.9910,29.0270"),
    ("Suadiye -> Taksim",      "40.9600,29.0830", "41.0370,28.9850"),
    ("Kandilli -> Besiktas",   "41.0740,29.0580", "41.0430,29.0070"),
    ("Maslak -> Beylerbeyi",   "41.1120,29.0200", "41.0430,29.0410"),
    ("Bakirkoy -> Uskudar",    "40.9783,28.8745", "41.0260,29.0150"),
]
simdi = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
print("cikis (UTC):", simdi.isoformat())
for ad, a, b in ROTALAR:
    q = urllib.parse.urlencode({"fromPlace": a, "toPlace": b, "time": simdi.isoformat().replace("+00:00", "Z"), "numItineraries": 3})
    j = json.load(urllib.request.urlopen(f"http://localhost:8080/api/v1/plan?{q}", timeout=60))
    print(f"\n### {ad}")
    for it in j.get("itineraries", [])[:3]:
        hat = " > ".join(f"{l.get('routeShortName') or l['mode']}" for l in it["legs"] if l["mode"] != "WALK")
        bas = (datetime.datetime.fromisoformat(it["startTime"].replace("Z", "+00:00")) + datetime.timedelta(hours=3)).strftime("%H:%M")
        bit = (datetime.datetime.fromisoformat(it["endTime"].replace("Z", "+00:00")) + datetime.timedelta(hours=3)).strftime("%H:%M")
        print(f"  {round(it['duration']/60)} dk ({bas}-{bit}), {it['transfers']} aktarma: {hat}")
