# Orta Nokta

Arkadaş grubunun hepsine aşağı yukarı eşit uzaklıkta buluşma mekanı bulan prototip.

1. Her kişi için adres yaz (Enter), "Konumum" ile telefon konumunu al ya da haritaya tıkla.
2. Kategori seç: Hepsi, Kafe, Bar, Restoran, Etkinlik (sinema, tiyatro, bowling, kaçış oyunu…).
3. "Buluşma yeri bul" → en adil 15 mekan listelenir.
4. "Grup bağlantısını kopyala" ile konumlar bağlantıya gömülür; arkadaş açar, kendi konumunu ekler, geri gönderir.

## Nasıl hesaplıyor
- Herkesi kapsayan en küçük çemberin merkezi bulunur (en uzaktaki kişinin yolunu en kısaltan nokta).
- O noktanın çevresindeki mekanlar çekilir.
- Her mekan için puan = en uzak kişinin mesafesi + (en uzak − en yakın) / 2. Düşük puan daha adil.
- Mesafeler kuş uçuşu. Deniz, köprü, trafik hesaba katılmıyor (sıradaki iş: gerçek yol süresi).

## Altyapı
Sadece statik dosyalar (HTML/CSS/JS), sunucu ve API anahtarı yok.
- Harita: Leaflet + OpenStreetMap
- Adres arama: Nominatim
- Mekanlar: Photon (komoot), çalışmazsa Overpass

Yerelde çalıştırmak: `python -m http.server 5173` → http://localhost:5173
