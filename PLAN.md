# Orta Nokta — Toplu taşıma ve kişi başı ulaşım planı

Tarih: 9 Kasım 2026 · Durum: **onay bekliyor**

## 1. Hedef

- Her kişi **kendi ulaşım yolunu** seçer: toplu taşıma, araba, yürüyerek ya da bisiklet. Aynı grupta karışık olabilir.
- Toplu taşıma İstanbul'un tamamını kapsar: otobüs, metrobüs, metro, tramvay, Marmaray, füniküler, teleferik, vapur, minibüs ve dolmuş.
- Adalet ölçüsü **kapıdan kapıya süre (dakika)** olur, kilometre değil. Süre bütün ulaşım türlerinde karşılaştırılabilir.
- Toplu taşımayla gelen herkes için adım adım tarif gösterilir: nereye yürüyecek, hangi duraktan neye binecek, kaç durak gidecek, nerede inecek, aktarmayı nerede yapacak.
- Her kişinin güzergâhı haritada kendi gerçek yolu üzerinde çizilir: otobüs kendi hattında, vapur deniz rotasında, yürüme parçası kesik çizgiyle.

## 2. Araştırma bulguları (9 Kas 2026'da denendi)

| Kaynak | İstanbul'da ne var | Durum |
|---|---|---|
| **Transitous** (ücretsiz, anahtarsız, herkese açık toplu taşıma servisi) | Yalnızca İETT otobüsleri | Aynı yakada çalışıyor (Üsküdar→Kadıköy: 12 numaralı otobüs, 19 dk). Balat→Kadıköy sonuç vermedi: metro, Marmaray ve vapur verisi yok. **Tek başına yetmez.** |
| **İBB Açık Veri: "IETT GTFS Data"** | İETT otobüs ve metrobüs hatları, durakları, sefer saatleri | Güncel (Mart 2026). |
| **İBB Açık Veri: "Public Transport GTFS Data"** | Metro İstanbul (metro, tramvay, füniküler, teleferik), TCDD (Marmaray), Şehir Hatları, İDO, Turyol, Dentur vapurları, 317 minibüs ve 58 dolmuş hattı. Toplam 499 hat, güzergâh çizgileri dahil. | Tarifeler 2024'te kalmış, hat çizgileri 2023'ten. 2024 sonrası açılan hatlar eksik olabilir. |
| **OSRM** (şu an kullandığımız yol servisi) | Araba, yürüyüş ve bisiklet için yol ağı | Çalışıyor. Yürüyüş profili otoyolları zaten kullanmaz. |
| **Google Routes API** | En güncel ve en eksiksiz toplu taşıma verisi | API anahtarı ve faturalandırma gerekir. Toplu taşıma tablosunda istek başına en fazla 100 hücre var. Ücretsiz kotayı resmi fiyat sayfasından teyit etmek gerekiyor. |

**Sonuç:** İki İBB veri seti birleşince ağın neredeyse tamamı ücretsiz olarak elimizde. Bunları işleyecek bir motor lazım. Transitous'un altında çalışan açık kaynak motor **MOTIS**'in Windows sürümü var (v2.11.4, Ekim 2026). Bilgisayarın da yeterli (16 GB RAM, 83 GB boş disk).

## 3. Toplu taşıma için seçenekler

| | A) Kendi MOTIS sunucumuz + İBB verisi **(önerilen)** | B) Google Routes API | C) Yalnızca Transitous |
|---|---|---|---|
| Kapsam | Bütün türler (verinin tarihine bağlı) | Bütün türler, en güncel | Yalnız otobüs |
| Ücret | Prototip ücretsiz (senin bilgisayarında). Herkese açık olunca aylık birkaç dolarlık sunucu | Kota aşılınca ücretli, kart bağlamak şart | Ücretsiz |
| Kurulum | Orta: veri hazırlığı ve sunucu kurulumu | Kolay ama anahtarı gizlemek için ara sunucu (Cloudflare Worker) gerekir | Hazır |
| Hız | Çok hızlı. "Herkesten her yere" yayılma araması tek istekte yapılabilir, videodaki mantıkla aynı | İstek başına sınır var, aday sayısını kısmak gerekir | Orta |
| Risk | Eski tarife ve eksik yeni hatlar | Maliyet ve kota | İstanbul'da işe yaramaz |

**Öneri: A.** B ileride "doğrulama" ya da yedek olarak eklenebilir.

## 4. Kişi başı ulaşım modeli

Her kişinin kartında 4 düğme: 🚇 Toplu taşıma (varsayılan) · 🚗 Araba · 🚶 Yürüyerek · 🚲 Bisiklet.

| Tür | Motor | Kurallar |
|---|---|---|
| Toplu taşıma | MOTIS | Toplu taşıma, durağa yürüme ve aktarma yürüyüşü birlikte hesaplanır. Durağa en fazla 15 dk yürüme (ayarlanabilir). Aktarma başına 5 dk "zahmet cezası" eklenir: sırf 1 dakika kısa diye 3 aktarmalı rota seçilmez. |
| Araba | OSRM araba | Otoyol ve köprü kullanılabilir. Süre trafiksiz tahmindir. İsteğe bağlı park payı eklenebilir (ör. +10 dk). |
| Yürüyerek | OSRM yürüyüş (ya da MOTIS yürüyüş) | Otoyol, köprü yolu ve deniz yok. Yaya yolu, merdiven ve park içi yollar kullanılabilir. Tek yön kuralı yok. |
| Bisiklet | OSRM bisiklet | Otoyol yok. |

Karışık grup: Herkesin süresi kendi motorundan gelir ve aynı birimde (dakika) olduğu için doğrudan karşılaştırılır.

## 5. Yeni hesaplama akışı

0. **Buluşma zamanı** girilir ("Bugün 19:00"). Toplu taşıma süresi saate bağlıdır: gece seyrek, bazı hatlar hiç çalışmaz. Hesap "herkes 19:00'da orada olsun" mantığıyla geriye doğru yapılır.
1. **Yayılma (videodaki mantık):**
   - Toplu taşımacılar için MOTIS'in "tek noktadan her yere" araması kullanılır. Her kişi için tek istekle, o saatte belirli bir süre içinde ulaşabildiği bütün duraklar ve varış süreleri gelir.
   - Arabalı, yürüyen ve bisikletli kişiler için bugünkü örnek nokta yöntemi kullanılır (OSRM tablosu).
2. **Adil bölgeler:** Her durak ya da örnek nokta için "en uzun süre + farkın yarısı" puanı hesaplanır. En iyi 2-3 bölge seçilir. Birbirinden uzak bölgeler de aday olur (ör. iki yaka).
3. **Mekanlar:** Bu bölgelerden mekan adayları çekilir (Photon). Bugünkü kategoriler korunur.
4. **Kesin süre:** Her aday mekana her kişiden gerçek kapıdan kapıya süre hesaplanır:
   - Toplu taşıma: mekana yakın durakların varış süresi + duraktan mekana yürüme. Hızlı, ek istek gerekmez.
   - Diğer türler: OSRM tablosu.
5. **Sıralama:**
   - Puan = en uzun süre + ½ × (en uzun − en kısa) + aktarma cezaları.
   - İleride ayar: "en adil" / "toplam süre en kısa" / "en az aktarma".
6. **Ayrıntı:** Yalnızca ekranda gösterilen ilk 10 mekan için, toplu taşımacılara tam yol tarifi istenir. Kullanıcı mekana tıklayınca tarif açılır.

## 6. Yol tarifi ekranı (toplu taşıma)

Örnek (mekana tıklayınca kişinin altında açılır):

```
Elif · 41 dk · 1 aktarma · 18:19'da çık
  🚶 6 dk yürü → "Balat" durağı
  🚌 99A (Eminönü yönü) · 18:25 · 7 durak → "Eminönü"'nde in
  🚶 3 dk yürü → Eminönü İskelesi
  ⛴ Eminönü–Kadıköy vapuru · 18:40 · 20 dk → Kadıköy İskelesi
  🚶 5 dk yürü → mekan
```

- Her parça için hat numarası, yön, kalkış saati, durak sayısı, biniş ve iniş durağı adı yazılır.
- Haritada parça parça çizilir. Renkler türe göre: metro kırmızı, otobüs mavi, vapur lacivert, Marmaray gri, yürüme kesik çizgi.
- "Google Haritalar'da aç" bağlantısıyla doğrulama yapılabilir.

## 7. Hesaba katılacak değişkenler ve kararlar

| Değişken | Karar |
|---|---|
| Buluşma saati | Zorunlu alan, varsayılan "bugün, 1 saat sonra". Hesap "herkes o saatte orada" mantığıyla yapılır. |
| Gece ve seyrek sefer | Ulaşım yoksa o kişi için "o saatte toplu taşıma yok" uyarısı. O kişi hesaptan düşmez, öneri olarak araba/taksi süresi gösterilir. |
| Durağa en fazla yürüme | 15 dk (ayar) |
| Aktarma cezası | Aktarma başına 5 dk (ayar) |
| Vapur ve Marmaray | Normal toplu taşıma gibi işlenir. Vapur seyrek olduğu için bekleme süresi de hesaba girer. |
| Metrobüs | İETT verisinde otobüs olarak var, ayrı simgeyle gösterilir. |
| Minibüs ve dolmuş | Verde sabit sefer saati yok, sıklık bilgisi var. Dahil edilir, "tahmini" etiketiyle. |
| Araba trafiği | Şimdilik trafiksiz tahmin, ekranda yazar. İleride trafikli kaynak düşünülebilir. |
| Ücret (İstanbulkart) | 1. aşamada yok. Sonra kişi başı tahmini ücret eklenebilir. |
| Engelli erişimi | 1. aşamada yok. Veride varsa sonra "asansörlü duraklar" seçeneği eklenebilir. |
| Eski tarife | İBB raylı sistem ve vapur tarifeleri 2024 tarihli. Bunlar bugünün tarihine kaydırılır. Ekranda "tarife verisi: İBB, 2024" notu çıkar. Yeni açılan hatlar eksik olabilir. |

## 8. Mimari

```
Tarayıcı (bugünkü statik site)
  ├── OSRM (araba / yürüyüş / bisiklet)  ── herkese açık ücretsiz servis
  ├── Photon / Nominatim (mekan, adres)  ── herkese açık ücretsiz servis
  └── MOTIS sunucusu (toplu taşıma)      ── 1. aşama: senin bilgisayarında (localhost:8080)
                                             2. aşama: küçük bir bulut sunucusu
MOTIS'in verisi: İstanbul OSM haritası + İETT GTFS + İBB toplu taşıma GTFS (tarihleri düzeltilmiş)
```

Bir **veri hazırlama betiği** (`veri/hazirla.py`) yazılır:
- İki İBB veri setini indirir.
- Tarihleri düzeltir ve çakışmaları ayıklar.
- Türkiye OSM dosyasından İstanbul'u keser.
- MOTIS'i hazırlar.

Veri güncellemek için betiği yeniden çalıştırmak yeterli.

## 8b. Boyut, güç ve sunucuya taşıma (9 Kas, ölçüldü)

| Parça | Boyut |
|---|---|
| MOTIS Windows sürümü | 52 MB (zip). Kurulum yok: klasöre açılır, silince tamamen gider. Arka planda servis bırakmaz, yalnızca terminal açıkken çalışır. |
| İstanbul OSM haritası (BBBike kesiti) | 47 MB. Bütün Türkiye dosyası 653 MB, ona gerek yok. |
| İETT GTFS | yaklaşık 33 MB |
| İBB toplu taşıma GTFS | yaklaşık 21 MB |
| İşlenmiş veri (MOTIS'in ürettiği) | Tahmin 1–3 GB disk. 1. aşamada ölçülecek. |

- **Bilgisayar:** i3-12100F (4 çekirdek), 16 GB RAM, NVMe SSD. Şehir boyutu bir kurulum için yeterli.
- **Bellek:** Tahmin, veri hazırlarken birkaç dakika boyunca birkaç GB. Çalışırken bundan çok daha az. 1. aşamada ölçülecek.
- MOTIS'in harita karosu üretme özelliği kapatılacak, çünkü haritayı OSM'den alıyoruz. Asıl ağır olan kısım bu, kapatınca yük azalır.

**Taşınabilirlik:** Yerelde kullandığımız aynı MOTIS sürümü, aynı yapılandırma dosyası ve aynı veri hazırlama betiği Linux sunucuda da aynen çalışır. Taşıma işi sadece şunlardan oluşur:
1. Sunucuya kopyala.
2. Betiği çalıştır.
3. Sitedeki MOTIS adresini değiştir.

**Sunucu seçenekleri (herkese açık yayın için):**

| Seçenek | Ücret | Not |
|---|---|---|
| Oracle Cloud "Always Free" ARM | Ücretsiz | 4 çekirdek, 24 GB RAM'e kadar. Kayıtta kart doğrulaması istenir. Bazen bölgede kapasite bulunamıyor. MOTIS'in ARM sürümü var. |
| Hetzner gibi küçük bulut sunucu | Aylık birkaç € | 2 çekirdek, 4 GB RAM yeterli olmalı. En az uğraş. |
| Doğrudan sunucuda başlamak | — | Senin bilgisayarına hiçbir şey kurulmaz. Prototip baştan internette olur. |

## 8c. 1. aşama sonucu (9 Kas, ölçüldü)

- **İçe aktarma süresi:** 12 sn. İlk deneme 44 dk'da bitmemişti. Sebebi İBB'nin "her N dakikada bir" tanımlı minibüs ve dolmuş seferleriydi; MOTIS bunları yavaş açıyor. Artık `veri/hazirla.py` bu seferleri kendisi tek tek açıyor (İBB'de 152 bin sefer).
- **Bellek:** İçe aktarırken en fazla 760 MB. Sunucu çalışırken yaklaşık 255 MB.
- **Disk:** İşlenmiş veri 206 MB.
- **Örnek rotalar (Salı 18:00 çıkış):**

  | Rota | Sonuç |
  |---|---|
  | Balat → Kadıköy | 49 dk: 55T otobüs → M2 → Marmaray → M4 |
  | Suadiye → Taksim | 42 dk: Marmaray → M2 |
  | Kandilli → Beşiktaş | 39 dk: 15M otobüs → Üsküdar–Beşiktaş vapuru |

- **"Tek noktadan her yere" sorgusu:** 0,3 sn'de 60 dk içinde ulaşılabilen 6.997 durak.
- **Çalıştırma:**
  1. `python veri/indir.py`
  2. `python veri/hazirla.py`
  3. `motis/` klasöründe `motis.exe import`, ardından `motis.exe server` (localhost:8080).
- **Bilinen kusurlar:**
  - Marmaray ve metrobüs "metro" ya da "otobüs" olarak etiketleniyor. Arayüzde hat adına göre düzeltilecek.
  - Bazı İETT durak adlarında Türkçe harf kaybı var (kaynak veride bozuk).
  - Gereksiz kısa aktarmalar öneriliyor (ör. 0 dk'lık otobüs). Aktarma cezası bunu çözecek.

## 8d. 2–4. aşama sonucu (9 Kas)

- **Kişi başı ulaşım:** Her kişinin kartında Toplu taşıma, Araba, Yürüyerek ve Bisiklet seçenekleri var. Seçim grup bağlantısına da yazılıyor.
- **Araba, yürüyüş ve bisiklet de artık kendi MOTIS sunucumuzda hesaplanıyor** (`one-to-many`, aynı İstanbul haritası). Dışarıdaki OSRM yalnız yedek. Sebebi: routing.openstreetmap.de art arda isteklerde 429 (çok fazla istek) verdi, herkese açık sitede bu kabul edilemez.
- **Buluşma saati:** Bütün hesap "o saatte orada ol" mantığıyla yapılıyor (`arriveBy`). Toplu taşıma rotası seçilirken bakılanlar: süre, aktarma başına 5 dk ceza ve 10 dk'dan fazla erken varmanın yarısı.
- **Akış:**
  1. Toplu taşımacılar için "tek noktadan her yere" sorgusu.
  2. 49 örnek noktayla adil bölge.
  3. Mekanlar.
  4. Ön sıralama.
  5. İlk 12 mekan için kesin plan.
  6. Kesin süreye göre yeniden sıralama.

  Videodaki 4 kişi (2 toplu taşıma, 1 araba, 1 yürüyüş) 3–7 sn'de sonuç veriyor.
- **Tarif:** Her parça için hat türü (Marmaray, metrobüs, minibüs ve dolmuş ayrı ayrı tanınıyor), hat numarası, biniş durağı ve saati, yön, iniş durağı ve saati, durak sayısı yazıyor. Haritada parça parça çiziliyor: yürüme kesik çizgi, araçlar türün renginde.
- **MOTIS ayarı:** `limits.onetoall_max_travel_minutes: 150`. Sunucu ayarı `motis/data/config.yml` dosyasından okuyor, değişiklik oraya da kopyalanmalı.
- **Başlatma:** `baslat.bat`

## 8e. 5. aşama: Google Haritalar karşılaştırması (9 Kas, Pazartesi ~17:30 çıkış)

| Rota | Google | Bizim motor | Fark | Not |
|---|---|---|---|---|
| Balat → Kadıköy | 52 dk: 99A → Eminönü–Kadıköy vapuru → 19F | 46–54 dk: 99A → vapur ya da Marmaray | ±3 dk | Uyumlu |
| Suadiye → Taksim | 50 dk: Marmaray → M2, 18 dk yürüme | 41 dk: Marmaray → M2, 8 dk yürüme | **−9 dk** | Aktarma ve istasyon içi yürüme kısa sayılıyor |
| Kandilli → Beşiktaş | 31 dk: 40T → 22 | 37 dk: 15KÇ → Anadoluhisarı–Aşiyan vapuru → 22 | +6 dk | Farklı güzergâh seçiyor |
| Maslak → Beylerbeyi | 55 dk: otobüs → metrobüs → 15F/14M | 43–48 dk: minibüs → 34Z → 14M | **−7…−12 dk** | Minibüs saatleri gerçek tarife değil, sıklıktan türetildi; iyimser |
| Bakırköy → Üsküdar | 26 dk: Marmaray direkt, 8 dk yürüme | 32 dk: Marmaray direkt, 13 dk yürüme | +6 dk | İstasyona tek giriş noktasından yürütüyoruz |

Ortalama mutlak fark yaklaşık 6–7 dk. 5 rotanın 4'ü ±10 dk hedefinin içinde. Rota mantığı doğru: aynı hatlar, aynı aktarma noktaları seçiliyor.

**Tespit edilen sorunlar ve çözüm önerileri:**
1. **Derin istasyonlarda aktarma ve iniş-çıkış süresi az sayılıyor.** Örnek: Yenikapı'da Marmaray'dan M2'ye 380 m yürüme 2 dk sayılıyor. Çözüm: `hazirla.py` büyük aktarma merkezleri için (Yenikapı, Üsküdar, Ayrılık Çeşmesi, Sirkeci, Zincirlikuyu, Mecidiyeköy, Söğütlüçeşme) `transfers.txt` dosyasına 5–7 dk asgari aktarma süresi yazsın. Ayrıca MOTIS `default_transfer_time` 2 → 3 dk.
2. **Minibüs ve dolmuş iyimser.** Saatler veride yok, sıklıktan türetiliyor, bu yüzden bekleme süresi gerçekte daha uzun olabilir. Çözüm: bu hatlara biniş başına ek bekleme payı (ör. +5 dk), ya da "minibüs/dolmuş kullanma" seçeneği.
3. **İstasyon girişleri.** Raylı istasyonların veride tek bir noktası var, bu yüzden bazı yürümeler uzun çıkıyor. Çözüm: OSM'deki istasyon girişlerini (`railway=subway_entrance`) durağa bağlamak. Daha büyük bir iş, sonraya bırakılabilir.
4. **Ücret:** Google ₺ cinsinden ücret gösteriyor (ör. 157,40). Bizde yok, sonraya bırakılabilir.

## 9. Aşamalar

| # | İş | Bitti sayılır |
|---|---|---|
| 1 | MOTIS'i kur, İBB verisini hazırla, yerelde çalıştır | Balat→Kadıköy için metro/tramvay + vapur içeren bir rota dönüyor. Rota Google Haritalar ile kabaca tutarlı (±10 dk). |
| 2 | Kişi başı ulaşım seçimi ve buluşma saati | Karışık grup (1 toplu taşıma, 1 araba, 1 yürüyüş) sonuç veriyor. Yürüyen kişinin rotası otoyola girmiyor. |
| 3 | Yayılma tabanlı adil bölge ve mekan sıralaması | Videodaki 4 kişilik örnekte sonuç 30 sn'den kısa sürede geliyor. |
| 4 | Adım adım yol tarifi ve haritada parça parça çizim | Her toplu taşıma parçası için hat, yön, saat, biniş/iniş durağı ve durak sayısı yazıyor. |
| 5 | Kontrol | Bilinen 5 rota Google Haritalar ile karşılaştırılıyor, farklar not ediliyor. |
| 6 | (Sonra) Herkese açık yayın | Sunucu seçimi, GitHub Pages. Ayrıca karar gerekiyor. |

## 10. Riskler ve açık sorular

- **Veri tazeliği:** 2024 sonrası açılan metro hatları ve tarife değişiklikleri eksik olabilir. 5. aşamadaki karşılaştırma bunu ortaya çıkarır. Fark büyükse Google'ı yedek olarak eklemek gündeme gelir.
- **Herkese açık yayın:** MOTIS bir sunucu ister, GitHub Pages tek başına yetmez. Prototip aşamasında yalnızca senin bilgisayarında tam çalışır. Diğer türler (araba, yürüyüş) her yerde çalışmaya devam eder.
- **MOTIS ayrıntıları:** "Tek noktadan her yere" araması ve Windows sürümünün bu veriyle çalışması 1. aşamada doğrulanacak. Olmazsa yedek yol: her aday mekana tek tek rota sorgusu. Daha yavaş ama çalışır.
