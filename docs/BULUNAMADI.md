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
