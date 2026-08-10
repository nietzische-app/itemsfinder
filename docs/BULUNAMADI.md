# «Bulunamadı» planı

Hedef: en sıradan parçada bile — düz beyaz bir tişörtte — kullanıcının boş ekran
görmemesi.

Bu belge tahminle değil ölçümle yazıldı. Aşağıdaki her sayı `npm run eval` ya da
`eval/coverageCases.ts` ile yeniden üretilebilir.

## Boşluk nerede — ölçülen hâli

«Bulunamadı» tek bir yerden gelmiyor. Zinciri sırayla ölçtüm:

| Aşama | Ne olabilir | Ölçülen |
| --- | --- | --- |
| 1. Tespit | Vision hiçbir nesne bulamaz | Ölçülmedi — Vision anahtarı gerekiyor (ROADMAP 1.2) |
| 2. Aile okuma | `familyOf` ürün türünü tanımaz → `unknown` | **Yaygın 77 Türkçe kelimenin 19'u (%25) tanınmıyordu** |
| 3. Katalog | O ailede hiç ürün yok | **`dress` ailesinde sıfır satır** |
| 4. Canlı arama | Mağazalarda sonuç çıkmaz | Bayrak kapalı; açıkken kataloğa düşüyor |
| 5. Arayüz | Ürün yokken ne yazıyor | **«en yakınları aşağıda» diyordu, altında hiçbir şey yoktu** |

İkinci aşama en büyüğüydü ve en ucuzu: bir tespitin ailesi okunamazsa
`findProductsForLabel` hiçbir ürün döndürmüyor. Bu bilinçli bir karar — yanlış
giysiyi göstermektense hiçbir şey göstermemek — ama sözlükteki her boşluk doğrudan
bir boş ekran demek.

Tanınmayan kelimeler egzotik değildi: **eşofman, kravat, atkı, mayo, rimel,
palazzo, kapri, kombinezon, papyon, cüzdan, pijama, sabahlık, bikini, anorak.**
Hepsi bir Türk mağazasının ana kategorilerinde duruyor.

## Yapıldı

**Sözlük genişletildi** — tanınmayan oran **%25 → %6**. Kalan beş kelime aşağıda,
"yeni aile gerekiyor" başlığında.

**Kapsam ölçüye bağlandı** — `eval/coverageCases.ts`, sıradan ürün adları. Her
biri en az bir ürün döndürmeli. Şu an **56/56 (%100)**, taban %100. Kaçanlar her
çalıştırmada isimleriyle basılıyor.

**Arayüz dürüstleştirildi** — hiç ürün yokken artık olmayan bir listeyi işaret
etmiyor; ne tanındığını söylüyor ve kullanıcının kendi aratabileceği tarifi
gösteriyor. Mağaza arama bağlantısı **verilmiyor**, çünkü arama adresleri CTA
olarak yasaklı (`src/lib/productUrl.ts`) ve bu kural burada da geçerli.

## Sırada — etkiye göre

### 1. `dress` ailesine katalog satırları — ✅ kapandı

Elbise, tulum, mayo ve bikini boşluğu kapandı: `mockCatalog.ts` içinde elbise
senaryosu var ve kapsam %92'den %100'e çıktı.

### 2. Yeni aileler: oje, parfüm, iç giyim — ✅ kapandı

Üçü de `ItemFamily` olarak eklendi **ve** her birinin katalog satırı var; kelimeyi
boş bir aileye yönlendirmek olmadı. `eval/coverageCases.ts` içindeki `KNOWN_GAPS`
artık boş — sayılmadan kayıtta tutulan bir boşluk kalmadı.

### 3. Canlı yolu açmak → asıl çözüm

Katalog bir demo; kapsamı elle büyüttüğümüz sürece her yeni ürün türü yeni bir
boşluk. Canlı yol (`ENABLE_CONTEXT_DEV_LIVE`) açıldığında ürünler gerçek
mağazalardan geliyor ve kapsam sorusu katalogdan çıkıp aramaya geçiyor.

Kod hazır ve sahte bir sunucuya karşı baştan sona sürüldü
(`scripts/stubs/README.md`). Açmak için Context.dev anahtarı yeterli.

**Ama canlı yol da boş dönebilir**, ve o yüzden aşağıdaki iki madde onunla
birlikte anlam kazanıyor.

### 4. Canlı arama boş dönerse: sorguyu gevşetmek — ✅ yazıldı ve ölçüye bağlandı

Merdiven yazıldı (`relaxedQueries`): önce tam sorgu, sonra renk + ürün adı, sonra
yalnız ürün adı; ve her basamak iki mağaza katmanında deneniyor (önce Türkiye,
sonra global). Sıra kasıtlı — önce katman, sonra basamak.

**Ve harcadığı kredi artık görünüyor.** Bu belge «hangi kademede kaç sonuç geldiği
ve kaç kredi harcandığı ölçülmeden açılmamalı» diyordu; ölçüm yoktu, şimdi var:
her arama `ScanTrace.searches` içine «katman, basamak, kaç **yeni** aday» olarak
yazılıyor, teşhis panelinde «Canlı aramalar (n)» başlığı altında satır satır
görünüyor, ve `[scan]` log satırında `searchCount` + `searchYield` olarak
greplenebiliyor. `tr:0=0,tr:1=3` okunuşu şu: tam sorgu boş döndü, parayı gevşeme
kurtardı.

Sahte sunucuya karşı ilk sürüşün söylediği (yalnızca stub hakkında bir gözlem,
üretim hakkında değil): üç parçada sekiz arama harcandı, basamak 0 hiç aday
getirmedi, gelen her aday basamak 1 ve 2'den geldi.

**Bu sürüş bir kusur da buldu** ve kusur stub'a ait değildi: `buildSearchQuery`
ürün adına yer ayırıyordu ama ayırma `seen` kümesini paylaştığı için ad daha önce
geçmişse hiç ayrılmıyordu. Sonuç, kodun kendi yorumunun «engellendi» dediği şeydi:

```
etiket «Yüksek yakalı ince örgü pastel pembe triko ceket», ürün adı «Ceket»
→ «Pudra Pembe Yüksek yakalı ince örgü»        — içinde ürün yok
```

Böyle bir sorgunun döndürdüğü her satır zaten yanlış. Ad artık **yalnızca
kesilecekse** sona taşınıyor, ve `eval/searchQueryCases.ts` ile yeni bir eval
kapısı (**Sorguda ürün adı**, taban %100) bunu her basamakta ölçüyor.

### 4b. Kelimeye çevirmeden aramak — ❌ ölçüldü ve reddedildi

Yukarıdaki merdivenin tamamı bir varsayıma dayanıyor: giysiyi doğru kelimelerle
tarif edebildiğimize. Ölçüm bunu tam olarak desteklemiyor — bölge rengi %81, ve
sorgu o renkten kuruluyor, yani her adlandırma hatası doğrudan yanlış bir aramaya
dönüşüyor. Merdiven bu kaybı **azaltıyor**, kaynağını ortadan kaldırmıyor.

`src/services/visualLookup.ts` kaynağı kaldırıyor: giysi kırpımını Vision'ın
`WEB_DETECTION`'ına soruyor ve dönen sayfalardan ürün adreslerini süzüyor. Metin
hiç devreye girmiyor.

**Yeni satıcı yok.** Google Shopping'in kamuya açık API'si yok (Content API kendi
ürününü yükleyen satıcılar için, Custom Search alışveriş indeksi değil). Ama
`WEB_DETECTION` **zaten her taramada çağrılıyor ve parası ödeniyor**; bugüne kadar
cevabın yalnızca `webEntities` kısmı isimlendirme için kullanılıyor,
`pagesWithMatchingImages` ve `visuallySimilarImages` çöpe gidiyordu.

**Neden kırpım, tüm fotoğraf değil:** tüm fotoğrafı sormak Instagram gönderisini
bulur, mağazayı değil — o görsel internette zaten o adreste duruyor. Tek bir
giysinin kırpımı ise internette bulunmayan bir görsel.

Mimaride değişen tek dikiş aday bulma; süzme (`productUrl.ts`), çıkarma
(`web.extract`), puanlama, aile kapısı ve tabanlar aynı kalıyor. Görsel yol aday
bulursa metin araması **hiç yapılmıyor**, yani `web.search` kredisi de harcanmıyor;
bulamazsa merdiven olduğu gibi devrede.

```bash
ENABLE_VISION_LENS=true    # varsayılan kapalı
```

**Ve ölçüm reddetti.** Üretimde açıldı; dört parça için 166 sonuç döndü ve
**ürün sayfası sayısı sıfırdı** — dört parçanın dördünde de:

```
youtube.com×17  facebook.com×10  tiktok.com×8  instagram.com×7
spotify.com×4   pinterest.com×3  aas.org  web.ua.es  bbci.co.uk  bcg.com
+ görsel CDN'leri: i.pinimg.com, m.media-amazon.com, cdn.dsmcdn.com,
  n.nordstrommedia.com, images.bloomingdalesassets.com
```

Sebebi bir hata değil, mekanizmanın kendisi. İki alan iki farklı soruyu
cevaplıyor ve ikisi de bizim sorumuz değil: `pagesWithMatchingImages` **bu
görselin nerede yayımlandığını** buluyor — kırpım bir influencer fotoğrafından
geldiği için cevap doğru, gönderinin kendisi ve onu paylaşan platformlar; kısmi
eşleşme çalıştığı için kırpmak da kurtarmıyor. `visuallySimilarImages` ise benzer
**görselleri** buluyor ve döndürdüğü şey bir görselin adresi, sayfanın değil.

Dikkat çeken ayrıntı: dönen CDN'lerin arasında Trendyol (`cdn.dsmcdn.com`),
Amazon ve Nordstrom var. Yani Vision doğru mağazaların ürün görsellerini
gerçekten buluyor — ama elimize geçen görselin adresi ve oradan ürün sayfasına
gitmenin genel bir yolu yok.

Kod duruyor, silinmedi: ölçülmüş bir ret, silinmiş bir denemeden değerli. Aynı
fikre gelen bir sonraki kişi ölçümü tekrarlamak zorunda kalmıyor.

**Çalışabileceği tek durum:** kullanıcı bir influencer fotoğrafı değil, doğrudan
bir **ürün fotoğrafı** taradığında. Ölçülmedi; bayrağı açan kişi önce bunu
ölçmeli.

Yol boyunca gerçek bir kusur da buldu: `instagram.com/p/AbCdEf/`, Mango ve H&M
için yazılmış `/p/<kimlik>` kalıbına uyuyor ve ürün sayfası sayılıyordu. Metin
yolunda «bu ana bilgisayar mağaza mı» sorusu `includeDomains` ile zaten
cevaplanıyordu; görsel yolun böyle bir kısıtı yoktu. Artık ikisi de aynı
perakendeci listesine bakıyor.

### 4c. Google Programmable Search — ❌ kapı kapalı (satıcı kararı)

`web.search`'ün ikinci sağlayıcısı olarak yazıldı (`src/services/googleSearch.ts`),
çünkü aday bulma zincirin ilk halkası ve tek satıcıya bağlıydı: context.dev
kredisi bitince (`401 USAGE_EXCEEDED`) çıkarılacak sayfa da kalmıyor, yani
işaretleme okuma yolu tek başına kurtarmıyor.

Mekanizma sağlamdı — görsel yoldan farkı buydu: bu, alan adına kısıtlanmış bir web
araması, yani `web.search`'ün birebir aynı şekli. **Ama satıcı kapıyı kapatmış.**

Üretimde üç tur denendi, üç farklı cevap geldi:

```
1) Requests to this API customsearch method … are blocked.      → anahtar kısıtlaması
2) (anahtar düzeltildi)
3) This project does not have the access to Custom Search JSON API.
```

Üçüncüsü kurulumla ilgili değil. Google, Custom Search JSON API'yi **yeni
müşterilere kapattı** ve **1 Ocak 2027'de tamamen kapatıyor**; API'yi
etkinleştirmek de, anahtar kısıtlamasını açmak da bu cevabı değiştirmiyor.
Konsolda basılacak bir düğme yok. Fiyatlandırma sayfasındaki ifade net: bu API
yeni müşteriler için kullanılabilir değil.

Yol boyunca kendi teşhisimizde üç kusur çıktı ve üçü de düzeltildi:

- Kapalı bir API'ye **parça başına bir kez** soruluyordu (tek taramada dört
  özdeş çağrı). Yönergeye çevrilebilen hata artık bir dakika susturuyor.
- `[scan]` özeti Google'ın hatasını `tr:` diye yazıyordu, yani context.dev'in
  Türkiye katmanını suçluyordu.
- Tek bir yönerge iki ayrı Google hatasını karşılıyordu ve **yanlış olanı**
  söylüyordu: gelen mesaj `API_KEY_SERVICE_BLOCKED` iken kullanıcı Library
  sayfasına yollandı, oysa çözüm Credentials'taydı.

Kod duruyor, silinmedi: API'ye erişimi olan **eski** bir Google Cloud projesi
bağlanırsa yol olduğu gibi çalışıyor, ve bayrak varsayılan olarak kapalı. Ölçülmüş
bir ret, silinmiş bir denemeden değerli.

**Açık kalan soru:** aday bulmayı hangi satıcı üstlenecek. Ölçülmesi gerekenler,
maliyet sırasıyla: bağımsız indeksi olan ücretsiz katmanlı arama API'leri, ya da
mağaza arama sayfalarından PDP adresi toplayıp `markupProducts` ile okumak
(bot duvarı riski ölçülmedi). Karar verilmeden kod yazılmamalı — bu bölümün
tamamı, ölçmeden önce yazılmış kodun hikâyesi.

### 4d. Ücretsiz keşif — ⏳ ölçülüyor, mekanizma bir mağazada doğrulandı

Google kapısı kapandıktan sonra (4c) aday bulmanın sağlayıcısı kalmadı. Ücretsiz
tek ihtimal: mağazanın **kendi arama sayfasından** ürün adresi toplayıp
`markupProducts` ile okumak. Ölçüm GitHub Actions'tan yapılıyor — bilerek, çünkü
üretimde istek Vercel'den, yani bir veri merkezi IP'sinden gidiyor ve ev
bağlantısından alınan cevap fazla iyimser olurdu.

**Birinci koşu (19 mağaza, «gri pantolon»):**

```
1/19  gerçek ürün satırı   koton.com — 38 aday, 3 sayfa, 3 satır, TL fiyatlı
5/19  ürün bağlantısı verdi
6/19  ana sayfada HTTP 403 trendyol, hepsiburada, defacto, hm, watsons, sephora
8/19  arama adresini ilan etmemiş
```

Zincirin tamamı **en az bir mağazada uçtan uca çalıştı**: ilan edilmiş arama
adresi → arama sayfası → adres süzme → indirme → schema.org'dan TL fiyatlı satır.
Hiçbir satıcıya ödeme yapılmadan. Mekanizmanın çalıştığı artık varsayım değil.

**İkinci koşu, ve asıl bulgu.** Dört mağaza (Boyner, LCW, Beymen, Gratis)
bağlantı veriyor ama «ürün işaretlemesi yok» diyordu. Sayfa teşhisi eklenince
sebep çıktı ve **kusur mağazalarda değildi**:

```
boyner.com.tr/pabucline-m-2003092903   0 ld+json, og:title var, istemci tarafı çatı
lcw.com/kadin-kolsuz-tisort-t-5112     1 ld+json, tipler: BreadcrumbList
beymen.com/tr/kadin-10006              1 ld+json, tipler: ItemList
gratis.com/isntree-b-61068             2 ld+json, tipler: ItemList/BreadcrumbList
```

Dördü de **liste sayfası** — satıcı, kategori, marka. `isDirectProductUrl` onları
ürün sayfası sayıyordu, yani okuduğumuz üç sayfa hiçbir zaman ürün sayfası
olmamıştı. Beymen'in tek arama sayfasından 1254 «aday» çıkarması bu yüzdendi.

Bu yalnızca ölçüm kusuru değil: aynı süzgeç canlı yolda **CTA** üretiyor, yani
«Ürüne git» düğmesi bir kategori sayfasına gidebilirdi.

Kaynağı, kalıpların en gevşeği (`[_-]\d{4,}` slug sonu) ve o kalıbın kendi yorumu
bunu öngörmüştü: *«öyle bir örnek görüldüğünde çözüm sınırı yükseltmek değil, o
şekli kategori listesine eklemek»*. Dördü de eklendi:

- `-m-`, `-t-`, `-b-` + rakam → liste yolu (rakam işaretin hemen ardından
  gelmeli; `beyaz-t-shirt-12345` bir ürün sayfası ve dokunulmuyor).
- Gevşek kalıp artık yalnızca **çıplak** adreste geçerli. Beymen'in şekli bir
  ürün sayfasından ayırt edilemiyor ama sorgu dizesi ayırt ediyor:
  `?indirimliurunler=evet` bir süzgeç. Ölçüldü — sorgu dizesi taşıyan on iki
  gerçek ürün sayfasının hiçbiri bu kurala muhtaç değil.

Dördü de `eval/productUrlCases.ts`'e girdi; bağlantı yasağı 67/67.

**Üçüncü koşu — süzgeç düzeldikten sonra:**

```
boyner.com.tr  54 → 25 aday, ve ilk gerçek satır:
               «Slim Fit Orta Bel Düz Paça Erkek Gri Pantolon» 699.99 TRY
lcw.com       124 →  9 aday, hepsi menüden: seyahat-urunleri-u-…, bebek-…-u-…
beymen.com   1254 → 1175 aday, hâlâ ItemList kategorileri
gratis.com     42 →  0 aday (hepsi marka sayfasıymış)
```

Yani süzgeç kusuru bir mağazayı kurtardı: **Boyner haksız yere eleniyormuş.**
Öteki üçü için cevap değişmedi ve artık sebebi biliniyor — LCW'nin dokuz adayının
hepsi gezinme menüsünden, Beymen'in 1175'i mega menüsünden geliyor. Bu üç mağaza
arama sonuçlarını **sunucuda çizmiyor**; okunacak bağlantı yok, daha fazla sayfa
okumak da bir şey değiştirmiyor.

`-u-` de liste işaretlerine katıldı (LCW ürün grubu). Bağlantı yasağı 69/69.

**Ölçülmüş durum: 2/19.** Koton (3 satır) ve Boyner (1 satır) — ikisi de TL
fiyatlı, gerçek, ücretsiz.

**Açık kalanlar:** sekiz mağaza arama adresini ilan etmiyor ve yedi yaygın şekil
de tutmadı (Zara, Mango, Bershka, Mavi, Flo, Vakko, Pull&Bear, Stradivarius);
altı mağaza veri merkezi IP'sine 403 veriyor (Trendyol ve Hepsiburada dahil, yani
Türkiye'nin en büyük ikisi). Ölçülmemiş bir kanal daha var: `sitemap.xml`.
Perakendecilerin çoğu ürün adreslerini orada yayımlıyor ve slug'lar arama
kelimelerini taşıyor — arama sayfasına hiç girmeden aday bulmanın yolu olabilir.

**Canlıya alındıktan sonra — «ürün adı hangi kelime» sorusu.** Aday süzgeci
sorgunun son iki kelimesini ürün adı sayıyordu. Üretim logu üç turda üç ayrı
kusur yazdırdı, ve üçü de aynı kökten: kural kelimenin **yerine** bakıp
kendisine bakmıyordu.

```
«Gri pantolon»               → «gri» ad sayıldı, gri bir elbise aday oldu
«Gümüş rengi ayakkabı»       → «rengi» ad sayıldı, iki şort aday oldu
                               …-gumus-rengi-386  /  …-gumus-rengi-
«Gümüş spor ayakkabı»        → «spor» ad sayıldı, aynı şortlar (renk listesi geçti)
```

İlkini kelime sayısı sınırı, ikincisini renk listesi kapattı; üçüncüsü ikisini
de aştı çünkü «spor» ne renk ne ad. İkinci ada gerçekten ihtiyaç var — «Bej
gömlek bluz»da mağaza «gömlek» yazıyor, bizim adımız «bluz» — ama yalnızca
**eşanlamlı ürün adları** için. Ayırt eden şey elde zaten vardı: aile sözlüğü
(`itemFamily.ts`). `gömlek` ve `bluz` orada, `spor` ve `rengi` değil. Yeni bir
kelime listesi uydurmak yerine sondan ikinci kelime o sözlüğe soruluyor; renk
listesi yalnızca kesişimi kapatıyor (`pudra` hem renk hem ürün).

Bu kusurun görünür olmasının sebebi ayrı bir değişiklik: eleme satırına elenen
adayın **adresi** eklenmişti. Başlık «neden elendi»yi söylüyor, adres «neden
aday oldu»yu — ve aday seçimi slug'a bakıyor.

### 4e. Sitemap kanalı — ⏳ ilk koşu: Beymen açıldı

Arama sayfası kanalı 2/19 mağazada çalışıyor. Sitemap ikinci bir yol: bot
duvarları genelde arama ve ürün sayfalarına konuyor, `sitemap.xml` arama
motorları için var ve engellenmesi mağazanın kendi çıkarına aykırı; üstelik düz
XML olduğu için «sonuçları tarayıcıda çiziyor» sorunu da geçersiz.

Eşleştirme için yeni kod yok: `rankByQuery` arama kanalında slug'a bakıp
sorguyla ilgisizleri zaten eliyor, sitemap adreslerine aynısı uygulanıyor.

**İlk koşu («gri pantolon», 19 mağaza):**

```
6/19  sitemap açıldı
3/19  sorguya uyan ürün adresi bulundu

koton.com   15000 adres → 14998 ürün sayfası → 1520 uyan
beymen.com  10000 adres → 10000 ürün sayfası →  266 uyan
            beymen.com/tr/p_alexander-wang-koyu-gri-kemerli-jean-pantolon_1954394
gratis.com  13233 adres → 13233 ürün sayfası →    6 uyan (pantolon çorabı — isabet değil)
```

**Beymen açıldı** — arama kanalının ulaşamadığı bir mağaza (sonuçları sunucuda
çizmiyordu) sitemap'ten geliyor, ve örnekler tam isabet. Kanalın ikinci bir yol
olduğu artık varsayım değil.

Koşu ölçümün kendisinde iki kusur buldu:

- **Gzip.** Altı mağaza «0 adres» dedi (Zara, Pull&Bear, Bershka, Stradivarius,
  Vakko, Flo). `robots.txt` sitemap ilan ediyordu ve dosya 200 dönüyordu; gövde
  gzip olduğu için çözücü çöp üretti ve içinde `<loc>` bulunamadı. Ölçüm «bu
  mağazada sitemap yok» diyordu, oysa vardı. `.xml.gz` taşıma sıkıştırması
  değil, gövdenin kendisi.
- **Dil.** Trendyol için seçilen dosya `/bg/sitemap_products1.xml` idi —
  Bulgarca. Adında «product» geçtiği için en üste çıkmıştı. Yabancı dil kodu
  taşıyan dosya artık ağır ceza alıyor: yerli bir kategori dosyasının bile
  arkasına düşüyor, ama elenmiyor.

**Dördüncü koşu — teşhis satırı her sıfırın sebebini verdikten sonra:**

```
10/19  sitemap açıldı
 6/19  sorguya uyan ürün adresi bulundu

koton.com        15000 adres → 1524 uyan
zara.com         10686 adres →  686 uyan   (tr-tr dosyası seçildikten sonra)
beymen.com       10000 adres →  266 uyan
bershka.com       2400 adres →  219 uyan   (adres şekli tanındıktan sonra)
pullandbear.com    224 adres →    9 uyan
gratis.com       13233 adres →    6 uyan   (pantolon çorabı — isabet değil)
```

Dört koşuda kanal 0'dan 6 mağazaya çıktı ve her adım bir ölçümle geldi:

| Koşu | Ne bulundu | Ne düzeltildi |
| --- | --- | --- |
| 1 | 6/19 açıldı, 3 kullanılabilir | — |
| 2 | Altı mağaza «0 adres», Trendyol Bulgarca | gzip gövde, yabancı dil cezası |
| 3 | Zara İngilizce, Bershka tanınmıyor, Boyner/LCW iç içe | `tr-tr` tercihi, Bershka kalıbı, uzantıya bakan dizin tespiti |
| 4 | Boyner üç kademe derin, Trendyol Sırpça | üç kademe iniş, eksik dil kodları |

**Açık kalanlar:** Hepsiburada, DeFacto, Mango ve Watsons sitemap'e de 403
veriyor. Mavi ve H&M sitemap ilan etmiyor. Stradivarius yalnızca `keyword.xml`
yayımlıyor (2982 kategori adresi, tek ürün yok). Sephora kozmetik satıyor, «gri
pantolon» için sıfır çıkması doğru.

**Üretime bağlanmadan önce cevaplanacak soru:** dosya başına 10–15 bin adres
görüldü ve bir mağazanın tamamı bunun katları. Tarama anında indirilemez, yani
dizinin nerede tutulacağı ayrı bir karar — muhtemelen periyodik bir Actions işi
slug dizinini çıkarıp saklayacak, tarama anında yalnızca yerel arama yapılacak.

### 4f. Dizin boru hattı — ⏳ toplama tarafı yazıldı, boyut ölçülecek

`npm run build:index` (Actions → «Ürün adres dizini») bir mağazanın sitemap
ağacını gezip ürün yollarını satır satır çıkarıyor. Depoya bir şey yazmıyor:
**önce boyut**. 4e'nin bıraktığı soru «dizin nerede saklanacak» ve o soru 2 MB
ile 200 MB arasında farklı cevaplar veriyor; boyutu bilmeden saklama yeri
seçmek, bu turda dört kez cezası ödenmiş hatanın aynısı olurdu.

Kararlar ikinci bir kopya değil: hangi adresin ürün sayfası olduğunu
`isDirectProductUrl`, hangi dosyanın ürün dosyası olduğunu `rankProductSitemaps`
söylüyor — ikisi de kanalın dört koşusunda oturmuş kod. İndirme mantığı
`check-sitemap.mjs` ile ortak (`scripts/sitemapFetch.mjs`).

**Çıktı düz metin**, satır başına bir yol. JSON değil: tek gereken işlem
satırlara bölmek, ve büyük bir JSON'u ayrıştırmak soğuk başlangıçta bedava
değil. Ayrıca düz metin git'te satır satır fark üretiyor — haftaya hangi
ürünlerin eklendiği okunabiliyor. Ana bilgisayar dosya adında, çünkü aynı bilgi
on beş bin kez yazılmamalı.

**Gezinme ağsız ölçülüyor** (`index-build-check`, `fetcher` dışarıdan veriliyor),
ve ölçüm daha ilk koşuda iki kusur buldu — ikisi de gerçek bir mağazaya gidilse
sayıdan okunamayacak cinsten:

- **Genişlik önceliği dal çeşitliliği vermiyor.** `kadın/` ve `erkek/` diye
  ayrılmış bir ağaçta bütçe 2 iken iki yaprağın ikisi de `kadın` dalından
  geliyordu — erkek sorgusuna hiçbir zaman cevap veremeyecek bir dizin. Artık
  en az yaprak vermiş dizinin çocuğu seçiliyor; eşitlikte kuyruk sırası
  korunuyor, yani `rankProductSitemaps`'in kararı bozulmuyor.
- **Derinlik tavanı yaprak üretiyordu.** Tavan yalnızca inişi kesiyordu ve
  kesilen dizin `<loc>` taşıdığı için yaprak listesine giriyordu. İçindekiler
  `.xml`, yani `productLinks` hepsini eliyor ve dizine kirli veri girmiyor —
  ama bütçe boşa gidiyor ve sayı «bir ürün dosyası bulundu» diyor. Sayının
  yalan söylemesi, verinin bozulmasından daha sinsi.

**Ölçüldü — dört koşu:**

```
151.976 ürün yolu   9,5 MB ham / 2,0 MB gzip   (mağaza başına 8 dosya tavanı)
kapsam 56/56 (%100) — eval/coverageCases.ts'in elli altı gerçek ürün adı
dağılım: beymen 55, zara 51, koton 47, bershka 43, gratis 33, pullandbear 22
yükleme 79 ms, sorgu başına 8 ms
```

Boyut korkulandan küçük: 2 MB gzip bir Vercel fonksiyonuna sığıyor, ayrı bir
veritabanı gerekmiyor. Dağılım altı mağazaya yayılmış, yani bu bir kanal — bir
mağazanın kataloğu değil.

Koşular üç kusur daha yazdırdı, üçü de ölçümün kendisinden:

- **Sorgu başına 239 ms.** Bir taramada on iki sorguya kadar çıkıyor, yani üç
  saniye — bağlanamazdı. Ölçünce işin neredeyse tamamı sorgudan bağımsız çıktı:
  her sorgu yüz elli iki bin adresi yeniden ayrıştırıp yeniden katlıyordu. Karar
  döngüden ayrıldı (`queryMatcher`), katlama yükleme anına taşındı, `new URL`
  tamamen düştü — yol dosyada zaten yol olarak duruyor. 239 → 8 ms.
- **Hızlandırma bir şey düşürdü.** Dosya bayt bayt aynıyken Bershka 43'ten 30'a
  indi. Sebep `decodeURIComponent`: sitemap'ler Türkçe harfi kaçışlı yazıyor ve
  `g%C3%B6mlek` çözülmeden katlanınca içinde «gomlek» geçmiyor. `foldUrlPath`
  tek yerde ve iki kanal da onu çağırıyor; sonraki koşuda 43'e döndü. Bu, tek
  başına «hızlandı» diyen bir ölçümün neden yetmediğinin ölçüsü.
- **Bir mağaza sessizce düştü.** Gratis bir koşuda 13.233 yol verdi, sonrakinde
  `7 dosya → 1258 adres → 0 ürün yolu` — ve **sıfır dosyaya yazıldı**. Dizin
  depoya konduğunda bu, geçici bir mağaza arızasının on üç bin çalışan adresi
  silmesi demek; periyodik bir iş bunu gece yarısı sessizce yapar. Artık boş
  sonuç dolu dosyanın üstüne yazılmıyor (`keepsPrevious`) ve sıfırın sebebi
  yazılıyor: kaç dosya açılmadı, kaç ham adres geldi, örnek adresler.

**Periyodik iş yazıldı** (`.github/workflows/dizin.yml`, her gece 03:00 UTC).
Dizin **depoya** yazılıyor — 2 MB gzip bir Vercel fonksiyonuna sığıyor, yani
Redis'e ya da ödemeye gerek yok, ve bu projede ücretsizlik bir tercih değil
kısıt. Düz metin olduğu için git satır satır fark üretiyor: «bu hafta hangi
ürünler eklendi» okunabiliyor.

Yayımlamadan önce iki kapı, ikisi de ölçülmüş bir arızadan doğdu:

1. **Mağaza başına** — sonuç sıfırsa ya da yarıdan fazla düştüyse önceki dosya
   korunuyor. Gözlenen arıza aslında **kısmi**ydi: Gratis'in bozuk koşusu 1258
   ham adres getirdi ve sıfıra süzüldü. Sıfır kontrolü onu yakalar, ama üç yüze
   süzülseydi geçerdi ve dizin sessizce onda birine inerdi. Eşik (yarı) bir
   yargı, ölçüm değil — ve öyle olduğu kodda yazılı. Koruma sessiz değil: hem
   mağaza satırında hem özette yazılıyor, çünkü eskimiş bir dizinin taze
   sanılması da sessiz silme kadar kötü.
2. **Dizin bütünü** — `check:index` kapsamı ölçüyor, taban elli (ölçülen elli
   altı, dört koşuda değişmedi). Altına düşerse iş kırmızıya dönüyor ve hiçbir
   şey yazılmıyor. «Yayımlamadan önce çıktıya bak» bir kural değil bir dilek;
   periyodik bir işin çıktısına kimse baştan sona bakmıyor.

**Dizin depoya girdi — ve gerçek veriyi ilk kez görünce bir kusur çıktı.**
Commit'lenen ilk dizinin ilk iki satırı `zara.com/mx/es/…` ve `beymen.com/en/…`
idi. Ölçüldü:

```
151.976 yolun 52.401'i (%34,5) yabancı vitrin
  beymen.com       40.000 /tr/ · 39.999 /en/      — her ürün iki kez, biri İngilizce
  bershka.com       8.111 /tr/ ·  9.086 /ee/      — çoğunluk Estonya
  zara.com         12.483 /tr/tr ·  2.576 yabancı (uk, us, mx, no, tw)
  pullandbear.com     224 /tr/ ·    740 /ie/, /gr/
```

Dosya seçimindeki yabancı dil cezası yetmiyormuş: **seçilen dosyanın içi**
karışık. Türkiye'den alışveriş yapan biri için `bershka.com/ee/…` yanlış dil,
yanlış para birimi ve çoğu zaman ulaşılamayan bir sepet; Beymen'de ise aynı
ürünün ikinci kopyası, yani dizinin yarısı kendi tekrarı.

Kural ret listesi değil **şekil** sınaması: ilk parça iki harfli bir dil kodu
şeklindeyse Türkçe olmak zorunda. Gerekçesi ölçülmüş — `ee`, `ie`, `gr`, `no`
`FOREIGN_LOCALES`'te yoktu ve dördü de bu ölçümde çıktı, yani ret listesi hep bir
adım geride. Şekil sınamasının yanlış pozitifi de ölçüldü: 151.976 yolda iki
harfli her ilk parça gerçekten bir dil kodu, ve dil parçası taşımayan 38.757 yol
(Koton, Gratis) dokunulmadan geçiyor.

Süzgeç saf kazanç çıktı:

```
151.976 → 99.575 yol    9,5 → 6,4 MB ham    2,0 → 1,3 MB gzip
kapsam  56/56 → 56/56   (yalnızca zara 51 → 50)
yükleme 181 → 93 ms     sorgu 19 → 12 ms
```

Küçülme koruması bunu arıza sanardı (Bershka %47 düşüyor), o yüzden bilerek
yapılan daralmalar için `--zorla` bayrağı var — karar operatörün ve bayrak onu
görünür kılıyor.

**Sırada:** üretimde aday kaynağı olarak bağlamak.

### 5. Kabul eşiği: yanlış ürün mü, boş ekran mı?

Şu an eşleşme filtreleri (`rejectProductTitle`, aile kapısı, renk çelişkisi)
bilerek katı — yanlış giysi göstermektense hiçbir şey göstermemeyi seçiyorlar.
"Hiç boş ekran olmasın" hedefi bu tercihi tersine çevirmek anlamına gelirse,
kullanıcı ayakkabı aradığında ceket görmeye başlar; bu, boş ekrandan kötüdür.

Doğru orta yol filtreleri gevşetmek değil, **elde kalanı dürüstçe etiketlemek**:
"birebir eşleşme" bulunamadıysa "benzer parçalar" başlığıyla göstermek, ve
güvenilirliği kullanıcıya söylemek. Arayüzde bu ayrım zaten var (birebir eşleşme /
muadiller); eksik olan, canlı yolda "yakın ama emin değiliz" kademesinin
oluşturulması.

## Bunu ölçen şey

`npm run eval` içinde iki satır:

- **Ürün kapsamı** — sıradan bir parça boş ekran görüyor mu. Taban %100, ölçülen
  %100 (56/56). Kaçan her parça adıyla basılıyor, yani bir sonraki kişi hangi ürün
  türünün boş döndüğünü okumak için kod okumak zorunda kalmıyor.
- **Sorguda ürün adı** — merdivenin her basamağında aranan ürün sorgunun içinde
  mi. Taban %100, ölçülen %100 (170/170). Kapsam «katalogda karşılığı var mı»yı
  ölçüyor; bu satır «doğru şeyi mi arıyoruz»u.

Vaka eklemek: `eval/coverageCases.ts` içine ürün adı yaz. Yeni bir ürün türü
desteklenmeye başladığında oraya bir satır eklemek, desteğin geri gitmemesini
sağlıyor.
