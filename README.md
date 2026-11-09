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
4. Puan = en uzun yolculuk + (en uzun − en kısa) / 2. Düşük puan daha adil.
5. Seçilen mekana herkesin rotası haritada yol üzerinde çizilir.

Sınırlar: araba süreleri trafiksizdir, toplu taşıma yok.

## Altyapı
Sadece statik dosyalar (HTML/CSS/JS), sunucu ve API anahtarı yok.
- Harita: Leaflet + OpenStreetMap
- Adres arama: Nominatim
- Mekanlar: Photon (komoot), çalışmazsa Overpass
- Yol süresi ve rotalar: OSRM (routing.openstreetmap.de, yedek router.project-osrm.org)

Yerelde çalıştırmak: `python -m http.server 5173` → http://localhost:5173
