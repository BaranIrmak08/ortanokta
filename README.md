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

## Altyapı
Site statik (HTML/CSS/JS), API anahtarı yok. Hesap için kendi MOTIS sunucumuz gerekiyor.
- Toplu taşıma, araba, yürüyüş, bisiklet: MOTIS + İBB Açık Veri (İETT GTFS ve Toplu Ulaşım GTFS) + İstanbul OSM
- Yedek yol servisi: OSRM (routing.openstreetmap.de, router.project-osrm.org)
- Harita: Leaflet + OpenStreetMap · Adres: Nominatim · Mekanlar: Photon (yedek Overpass)

## Yerelde çalıştırmak
İlk kurulum (bir kez):
1. `python veri/indir.py` — İBB toplu taşıma verisi ve İstanbul haritası.
2. `python veri/hazirla.py` — verideki bozuklukları düzeltir.
3. MOTIS v2.11.4 Windows sürümünü `motis/` klasörüne aç, `veri/motis-config.yml` dosyasını `motis/config.yml` olarak kopyala, `motis.exe import` çalıştır.

Sonra her seferinde: `baslat.bat` (MOTIS sunucusu + site, http://localhost:5173).
