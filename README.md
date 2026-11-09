# Orta Nokta

Arkadaş grubunun hepsine aşağı yukarı eşit uzaklıkta buluşma mekanı bulan prototip.

1. Her kişi için adres yaz (Enter), "Konumum" ile telefon konumunu al ya da haritaya tıkla.
2. Kategori seç: Hepsi, Kafe, Bar, Restoran, Etkinlik (sinema, tiyatro, bowling, kaçış oyunu…).
3. "Buluşma yeri bul" → en adil 15 mekan listelenir.
4. "Grup bağlantısını kopyala" ile konumlar bağlantıya gömülür; arkadaş açar, kendi konumunu ekler, geri gönderir.

## Nasıl hesaplıyor (gerçek yollar üzerinden)
1. Grubun ortasına halkalar halinde ~50 örnek nokta serpilir; her kişiden bu noktalara **yol ağı üzerinden** süre hesaplanır (araba, yürüyüş ya da bisiklet).
2. En uzun yolculuğu en kısa olan bölge seçilir. İkinci iyi bölge uzaktaysa (ör. boğazın öbür yakası) orası da aday olur.
3. Bu bölgelerdeki mekanlar çekilir, her mekana herkesten gerçek yol süresi ve mesafesi hesaplanır.
4. Puan = en uzun yolculuk + (en uzun − en kısa) / 2 + aktarma başına 5 dk. Düşük puan daha adil.
5. Seçilen mekana herkesin rotası haritada yol üzerinde çizilir.

Herkes kendi ulaşımını seçer, hesap buluşma saatine göre yapılır. Toplu taşımada adım adım tarif verilir. Sınırlar: araba süreleri trafiksizdir; raylı sistem ve vapur tarifeleri İBB'nin 2024 verisinden.

## Özellikler
- Herkes kendi ulaşımını seçer (toplu taşıma, araba, yürüyüş, bisiklet); toplu taşımada adım adım tarif, en yakın istasyon girişi
- Buluşma saati ve kalış süresi: o saatte kapalı mekanlar elenir, buluşma bitmeden kapananlar işaretlenir (OSM açılış saatleri, mekanların ~%12'sinde var)
- Dönüş yolu: buluşma bitince herkesin toplu taşımayla eve dönüşü; dönüşü olmayan kişi uyarılır, o mekan aşağı iner
- Sıralama: en adil / toplam süre / en az aktarma
- Yaklaşık ücret: İstanbulkart (Temmuz 2026 tarifesi), Marmaray mesafeye göre, araba yakıtı
- "Yayılmayı izle": herkesten aynı anda yayılan erişim animasyonu; koyu harita

## Altyapı
Site statik (HTML/CSS/JS), API anahtarı yok. Hesap için kendi MOTIS sunucumuz gerekiyor.
- Toplu taşıma, araba, yürüyüş, bisiklet: MOTIS + İBB Açık Veri (İETT GTFS ve Toplu Ulaşım GTFS) + İstanbul OSM
- Yedek yol servisi: OSRM (routing.openstreetmap.de, router.project-osrm.org)
- Mekanlar: kendi `mekanlar.json` dosyamız (OSM'den, 10.610 mekan), yedek Photon/Overpass
- Adres önerisi: Photon, yedek MOTIS · Harita: Leaflet + OpenStreetMap

## Yerelde çalıştırmak
İlk kurulum (bir kez):
1. `python veri/indir.py` — İBB toplu taşıma verisi ve İstanbul haritası.
2. `python veri/hazirla.py` — verideki bozuklukları düzeltir.
3. `pip install osmium` ve `python veri/mekanlar.py` — İstanbul haritasından mekanları çıkarır (`mekanlar.json`).
4. MOTIS v2.11.4 Windows sürümünü `motis/` klasörüne aç, `veri/motis-config.yml` dosyasını `motis/config.yml` olarak kopyala, `motis.exe import` çalıştır.

Sonra her seferinde: `baslat.bat` (MOTIS sunucusu + `sunucu.py`, http://localhost:5173).

**Telefondan (aynı Wi-Fi):** `sunucu.py` açılınca yazdığı `https://<bilgisayar-IP>:5443` adresini telefonda aç. Sertifika kendinden imzalı olduğu için bir kez "Gelişmiş → yine de devam et" de. Windows güvenlik duvarı Python için izin sorarsa "Özel ağ"a izin ver.

Testler: `node test/saatler.test.js`
