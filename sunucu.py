"""Orta Nokta yerel sunucusu: siteyi sunar, /motis/... isteklerini yerel MOTIS'e (localhost:8080) aktarır.

Kullanım: python sunucu.py
- Bilgisayardan:          http://localhost:5173
- Aynı Wi-Fi'deki telefon: https://<bilgisayarın-IP'si>:5443
  (Telefonun konum izni yalnız HTTPS'te çalışır. Sertifika kendinden imzalı olduğu için
   telefonda bir kez "Gelişmiş -> Yine de devam et" demen gerekir.)
Sertifika yoksa openssl ile yerel/ klasörüne üretilir (git'e girmez).
"""
import http.server
import os
import pathlib
import shutil
import socket
import ssl
import subprocess
import threading
import urllib.error
import urllib.request

KOK = pathlib.Path(__file__).resolve().parent
MOTIS = "http://127.0.0.1:8080"  # "localhost" Windows'ta önce IPv6 dener, her istek ~2 sn gecikir
HTTP_PORT = int(os.environ.get("PORT", 5173))
HTTPS_PORT = HTTP_PORT + 270  # 5173 -> 5443
YEREL = KOK / "yerel"


class Isleyici(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(KOK), **k)

    def do_GET(self):
        if self.path.startswith("/motis/"):
            return self.aktar()
        # Yalnız sitenin dosyaları sunulur; veri ve MOTIS klasörleri dışarı açılmaz
        if any(self.path.startswith(p) for p in ("/veri/", "/motis", "/yerel/", "/.git", "/test/")):
            return self.send_error(404)
        return super().do_GET()

    def aktar(self):
        hedef = MOTIS + self.path[len("/motis"):]
        try:
            with urllib.request.urlopen(hedef, timeout=60) as y:
                govde, kod, tur = y.read(), y.status, y.headers.get("Content-Type", "application/json")
        except urllib.error.HTTPError as e:
            govde, kod, tur = e.read(), e.code, e.headers.get("Content-Type", "application/json")
        except OSError:
            govde, kod, tur = b'{"error":"MOTIS sunucusu kapali"}', 502, "application/json"
        self.send_response(kod)
        self.send_header("Content-Type", tur)
        self.send_header("Content-Length", str(len(govde)))
        self.end_headers()
        self.wfile.write(govde)

    def log_message(self, *a):  # konsolu her istekle doldurma
        pass


def yerel_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def sertifika(ip):
    YEREL.mkdir(exist_ok=True)
    crt, key = YEREL / "sertifika.pem", YEREL / "anahtar.pem"
    if crt.exists() and key.exists():
        return crt, key
    openssl = shutil.which("openssl") or r"C:\Program Files\Git\usr\bin\openssl.exe"
    if not os.path.exists(openssl) and not shutil.which("openssl"):
        return None
    subprocess.run([openssl, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "825",
                    "-keyout", str(key), "-out", str(crt), "-subj", "/CN=Orta Nokta yerel",
                    "-addext", f"subjectAltName=IP:{ip},IP:127.0.0.1,DNS:localhost"],
                   check=True, capture_output=True)
    return crt, key


def main():
    ip = yerel_ip()
    http_s = http.server.ThreadingHTTPServer(("0.0.0.0", HTTP_PORT), Isleyici)
    threading.Thread(target=http_s.serve_forever, daemon=True).start()
    print(f"Bilgisayardan: http://localhost:{HTTP_PORT}")
    try:
        s = sertifika(ip)
    except subprocess.CalledProcessError:
        s = None
    if s:
        https_s = http.server.ThreadingHTTPServer(("0.0.0.0", HTTPS_PORT), Isleyici)
        bag = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        bag.load_cert_chain(*map(str, s))
        https_s.socket = bag.wrap_socket(https_s.socket, server_side=True)
        print(f"Telefondan (aynı Wi-Fi): https://{ip}:{HTTPS_PORT}  (uyarıda 'Gelişmiş -> devam et')")
        https_s.serve_forever()
    else:
        print("openssl bulunamadı: telefondan HTTPS yok, yalnız http://" + ip + f":{HTTP_PORT} (konum düğmesi çalışmaz)")
        threading.Event().wait()


if __name__ == "__main__":
    main()
