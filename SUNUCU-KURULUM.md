# Oracle Cloud ücretsiz sunucu: hesap açma rehberi

Tarih: 9 Kasım 2026. Kaynak: Oracle'ın resmi "Always Free Resources" sayfası.

## Yeterli mi?

| | Oracle ücretsiz (2026) | Bizim ihtiyacımız (ölçüldü) |
|---|---|---|
| İşlemci | 2 çekirdek (Ampere A1, ARM) | 1 çekirdek yeter |
| Bellek | toplam 12 GB | çalışırken ~255 MB, veri hazırlarken en fazla ~760 MB |
| Disk | 200 GB (sunucu diski en az 50 GB) | ~400 MB |
| Dışarı veri trafiği | ayda 10 TB | çok az |
| MOTIS | ARM sürümü var (`motis-linux-arm64`) | ✓ |

**Teknik olarak fazlasıyla yeterli.** Site GitHub Pages'te duracak, Oracle'da yalnız MOTIS sunucusu çalışacak.

## Bilmen gereken riskler

1. **2026'da ücretsiz katman küçültüldü.** 4 çekirdek / 24 GB'tan 2 çekirdek / 12 GB'a indi. Bazı kullanıcılar bu geçişte sunucularının kapatıldığını yazıyor. Oracle koşulları yine değiştirebilir.
2. **Boşta duran sunucuyu geri alabiliyor.** Oracle'ın kuralı şu: 7 gün boyunca aşağıdaki üçü birden %20'nin altındaysa sunucu "boşta" sayılır ve geri alınabilir.
   - işlemci kullanımı (95. yüzdelik),
   - ağ kullanımı,
   - bellek kullanımı (yalnız A1 sunucularda).

   Bizim sunucu çoğu zaman boşta olacak. Bu yüzden sunucuyu ihtiyacımız kadar küçük açacağız (1 çekirdek, 2 GB). Böylece belleğin %20'den fazlası gerçekten kullanılır. Kuralı aldatmaya çalışmayacağız, sadece gereğinden büyük sunucu açmayacağız.
3. **"Out of host capacity" (kapasite yok) hatası.** Popüler bölgelerde ücretsiz sunucu bazen bulunamıyor. Çözüm: biraz bekleyip yeniden denemek ya da hesabı "Pay As You Go"ya (kullandıkça öde) yükseltmek. Yükseltince ücretsiz sınırlar içindeki kullanım yine ücretsiz kalıyor, yalnız sınırı aşan kısım ücretleniyor. Resmi sayfa, bu yükseltmenin boşta geri alma kuralından muaf tutup tutmadığını söylemiyor.

**Sonuç:** Başlamak için iyi bir seçim. Ama "sonsuza kadar bedava ve garantili" değil. Her şeyi taşınabilir kurduğumuz için Oracle sorun çıkarırsa aynı kurulumu Hetzner gibi bir sunucuya bir saatte taşıyabiliriz.

---

## Adım adım: hesabı açmak (bu kısmı sen yapacaksın)

> Kart ve kimlik bilgilerini ben giremem, bu adımları senin yapman gerekiyor. Bana hiçbir zaman şifre ya da kart bilgisi gönderme.

1. **Kayıt sayfasını aç:** https://www.oracle.com/cloud/free/ → **Start for free**.
2. **Ülke:** Turkey. Adın, soyadın ve e-posta adresini yaz. E-postana gelen doğrulama bağlantısına tıkla.
3. **Şifre ve hesap adı:**
   - Güçlü bir şifre belirle.
   - **Cloud Account Name:** küçük harflerle bir ad yaz (ör. `ortanokta`). Giriş yaparken bu adı kullanacaksın.
4. **Home Region (ana bölge):** ⚠️ **Sonradan değiştirilemez.** Ücretsiz sunucu yalnızca bu bölgede açılabilir.
   - Türkiye'ye yakın olanlar: **Germany Central (Frankfurt)**, **Italy Northwest (Milan)**, **France South (Marseille)**.
   - Frankfurt en bilinen bölge ama en kalabalık olanı. Kapasite sorunu yaşamamak için **Milan** ya da **Marseille** seçmeni öneririm. Türkiye'den gecikme farkı birkaç milisaniye, kullanıcı fark etmez.
5. **Adres ve telefon:** Adresini yaz, telefonuna gelen SMS koduyla doğrula.
6. **Kart doğrulaması:** Banka ya da kredi kartı istenir. Oracle kartın gerçek olduğunu görmek için küçük bir provizyon çekip geri iade eder, ücret almaz. Sanal kart ya da ön ödemeli kart bazen reddediliyor.
7. **Sözleşmeyi onayla → Start my free trial.**
8. **Bekle:** Hesabın hazırlanması birkaç dakika ile bir saat arasında sürebilir. "Your account is ready" e-postası gelince devam et.
9. **Giriş:** https://cloud.oracle.com → hesap adın (3. adım) → e-posta ve şifre. İlk girişte iki adımlı doğrulama (Oracle Mobile Authenticator) kurmanı isteyebilir; kur.

### (İsteğe bağlı, sonra karar verebiliriz) Pay As You Go'ya yükseltme

Kapasite hatası alırsak gündeme gelir. Yaparsan:
- **Billing & Cost Management → Budgets** bölümünden 1 dolarlık bir **bütçe uyarısı** kur. Yanlışlıkla ücretli bir şey açılırsa hemen e-posta gelir.
- Ücretsiz sınırların dışına çıkmadığımız sürece fatura 0 TL olur.

---

## Hesap açıldıktan sonra (bunları birlikte yapacağız)

1. **SSH anahtarı:** Ben senin bilgisayarında oluşturacağım. Sunucuya şifresiz ve güvenli bağlanmak için kullanılıyor. Sana yalnızca "açık anahtar" metnini vereceğim, onu Oracle'a yapıştıracaksın.
2. **Sunucu oluşturma (Compute → Instances → Create instance):**
   - **Image:** Canonical Ubuntu 24.04 (aarch64)
   - **Shape:** Ampere → VM.Standard.A1.Flex → **1 OCPU, 2 GB bellek**
   - **Networking:** varsayılan sanal ağ, **public IPv4 address: açık**
   - **SSH keys:** "Paste public keys" → benim vereceğim metni yapıştır
   - **Boot volume:** varsayılan 50 GB
3. **Bana yalnızca sunucunun Public IP adresini gönder** (ör. `152.70.x.x`).
4. Gerisini ben yapacağım:
   - MOTIS'i ve veriyi kurmak,
   - haftalık otomatik veri güncellemesi,
   - HTTPS (bunun için ücretsiz bir alan adı gerekecek; o adımı birlikte seçeceğiz),
   - istek sınırı,
   - Oracle'ın ağ ayarlarında 443 numaralı portu açmak.

   Bu son adımı ekran ekran tarif edeceğim.
