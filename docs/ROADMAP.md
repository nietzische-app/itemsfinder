# Markas — sonraki aşama planı

Bu belge, tarama doğruluğu için yapılan B-6…B-9 turundan **sonra** ne yapılması
gerektiğini, neden bu sırayla yapılması gerektiğini ve her maddenin "bitti"
sayılması için hangi ölçümün yeşile dönmesi gerektiğini yazıyor.

Sıralama özellik heyecanına göre değil **risk ve kaldıraca** göre. En üstteki iki
madde özellik değil; onlar olmadan yayına çıkmak para ve itibar kaybettirir.
Üçüncü katmandaki "gerçek" çözümler (segmentasyon, öğrenilmiş embedding) ikinci
katmandan sonra geliyor, çünkü bu projede daha önce **ölçmeden ayarlamak** tam
olarak yanlış cevapların uzun süre ayakta kalmasına yol açtı: global baskın renk
siyah şortu aylarca "pudra" etiketledi ve bunu bir ekran görüntüsü yakalayamadı.

---

## Katman 0 — yayın engelleri

Bunlar yapılmadan canlıya çıkmak, faturayı bir yabancının eline vermek demek.

### 0.1 `/api/detect` için hız sınırı ve kötüye kullanım kontrolü — ✅ tamamlandı

**Durum: kapatıldı.** 39 kontrolle doğrulandı (31 birim + 8 gerçek HTTP).

İki kademe (dakika + gün) istemci başına, artı istemciden bağımsız günlük bütçe
tavanı. Sayaçlar bir arayüzün arkasında: geliştirme için bellek içi, üretim için
Upstash Redis (REST). Sağlayıcı seçimi kodun geri kalanını ilgilendirmiyor.

Bütçenin %80'inde **ücretli aşamalar kendiliğinden kapanıyor** — tarama gerçek
kalıyor (tespit + katalog), model öznitelik geçişi ve canlı ürün araması duruyor.
Tavan dolunca 503; sessizce demo veriye düşmek yok, çünkü o kullanıcıya yalan
söylemek olurdu.

Sayaç deposu erişilemezse **açık kalıyor**: bir Redis kesintisinin ürünü
durdurması, bir saat sınırsız trafikten kötü bir arıza olurdu — ve faturayı asıl
bağlayan şey günlük tavan. Kesinti loglanıyor.

Aşağıdaki kayıt tarihsel.

**Bulunduğu andaki hâli:** kimlik doğrulama yok, hız sınırı yok, `middleware.ts`
yok.

Endpoint tamamen açık ve her çağrı **para harcıyor**: 1 Cloud Vision çağrısı +
`VLM_MAX_ITEMS` kadar Claude çağrısı (varsayılan 4) + 1 Context.dev araması + 3
extract + 4 görsel indirme. Basit bir döngü tüm kredileri boşaltır ve bunu fark
etmenin bir yolu yok.

**Yapılacak**

- IP + (varsa) oturum başına kayan pencere sınırı. Sunucusuz ortamda bellek
  içi sayaç işe yaramaz — instance'lar paylaşılmıyor. Kalıcı bir sayaç gerekiyor
  (Upstash Redis, Vercel KV ya da eşdeğeri).
- İki kademe: dakikada kaç tarama, günde kaç tarama. Günlük olan bütçe tavanı.
- Aşıldığında `429` + `Retry-After`, ve arayüzde dürüst bir mesaj — sessizce
  mock'a düşmek değil, çünkü o kullanıcıya yalan söylemek olur.
- Ayrı bir **küresel** tavan: günlük toplam harcama sınırına yaklaşıldığında
  canlı aşamaları kapat, kataloğa düş, ve logla. Kredinin ortasında kesilmek
  yerine kontrollü degrade.

**Bitti ölçütü (karşılandı):** sınıra kadar `200`, sonra `429` + `Retry-After`;
başka IP etkilenmiyor; reddedilen istek sessizce sonuç döndürmüyor; sınırlı
istemcinin dev gövdesi **okunmadan** reddediliyor; bütçenin %80'inde degrade,
%100'ünde 503; depo çökerse açık kalıyor; TTL kendini ileri itmiyor; Upstash REST
şekli yerel bir stub'a karşı doğrulandı.

**Kalan tek şey senin kararın:** `UPSTASH_REDIS_REST_URL` / `_TOKEN`. Onlar
olmadan sayaçlar süreç-yerel kalıyor — sunucusuz ortamda instance başına, yani
gerçek bir sınır değil. Uygulama üretimde bunu açılışta hata olarak logluyor.

### 0.2 Görsel yükleme sertleştirmesi — ✅ tamamlandı

**Durum: kapatıldı.** Aşağıdaki üç açık da giderildi; 16 kontrolle doğrulandı
(`upload.mjs`, gerçek HTTP üzerinden üretim derlemesine karşı).

Özet: her decode tek bir kapıdan (`openImage`, 50 MP tavanı) geçiyor;
`inspectUpload` baytları kokluyor, beyanla karşılaştırıyor ve boyutu ölçüyor;
SVG kabul listesinden çıktı ve onu tek kullanan dört demo örneği JPG'ye
rasterleştirildi. Aşağıdaki kayıt tarihsel — neyin neden kırıldığını anlatıyor.

**Bulunduğu andaki hâli:**

**Piksel bombası.** Route 10 MB base64 sınırı koyuyor ama piksel sayısına
bakmıyor ve `sharp` çağrılarının hiçbirinde `limitInputPixels` yok. Ölçtüm:

```
9000×9000 PNG  =  248 KB sıkıştırılmış  (base64: 0.32 MB, sınırın çok altında)
sharp kabul etti: 81 megapiksel, 1 ms
```

81 MP'yi decode etmek kanal başına ~243 MB demek, ve boru hattı aynı görseli
**birden fazla kez** decode ediyor: her tespit için `regionDominantColor`, her
tespit için `cropRegion`, sonra `visualDescriptor`. Tek istekle fonksiyonu
OOM'a sokmak mümkün, ve 0.1 olmadığı için bedava.

**MIME güveni.** `parseDataUrl` beyan edilen MIME'ı okuyor, baytları
koklamıyor. İstemci `image/jpeg` diyip başka bir şey gönderebilir.

**SVG kabul ediliyor.** `ALLOWED_MIME_TYPES` içinde `image/svg+xml` var ve o
`sharp`'a gidiyor. Kullanıcıdan gelen SVG'yi librsvg'ye vermek bilinen bir
saldırı yüzeyi (XXE, harici kaynak çekme). Yorumda "paketlenmiş örnekler için"
yazıyor ama örnekler de aynı endpoint'ten data URL olarak geçiyor, yani ayrım
gerçekte yok.

**Yapılacak**

- Her `sharp()` çağrısına `limitInputPixels` (öneri: 50 MP) ve boyut tavanı.
  Tek bir yerden geçirmek en iyisi — şu an üç dosya ayrı ayrı `sharp()` çağırıyor.
- Baytlardan MIME koklama (magic number) ve beyan edilenle karşılaştırma;
  uyuşmuyorsa reddet.
- SVG'yi yükleme yolundan çıkar. Paketlenmiş örnekler zaten sunucuda, onları
  `exampleId` ile göndermek yeterli — baytlarını istemciden geri almaya gerek yok.
- Decode edilmiş piksel sayısını bir kez ölç, bir kez logla; boru hattı zaten
  `imageSize`'ı paylaşıyor, aynı şeyi tavan kontrolü için de kullan.

**Bitti ölçütü (karşılandı):** 81 MP bombası `413`; PNG diyip JPEG göndermek
`415`; SVG hem kendi MIME'ıyla hem PNG kılığında `415`; 13000×10 (yalnızca
0.13 MP) kenar sınırıyla `413`; GIF ve TIFF tanınıyor ama kabul edilmiyor.

### 0.3 Satın alınabilirlik: bağlantı + fotoğraf

**Durum: hiçbir katalog ürünü satın alınabilir değil.**
`VERIFIED_PDP_URLS` boş, `VERIFIED_PDP_IMAGES` boş. Yani site tarıyor,
eşleştiriyor, fiyat gösteriyor — ve "Ürüne git" hiçbir yere gitmiyor.

Bu bir tasarım kararının sonucu ve karar doğru: uydurma bağlantı, eksik
bağlantıdan kötü. Ama kalıcı bir hâl değil.

**Yapılacak** (araçlar hazır, kalan iş veri)

```bash
npm run check:pdp        # mağazaya göre gruplu çalışma listesi + yapıştırılacak blok
npm run fetch:images     # PDP'lerden og:image toplar (ağ erişimi olan makinede)
```

Sıra önemli: bağlantılar önce, çünkü `fetch:images` onlardan besleniyor.
Kısmi doldurma destekliyor — girdisi olmayan ürün silüetle ve CTA'sız kalıyor.

**Bitti ölçütü:** `check:pdp` en azından dört vitrin kombininin birebir
eşleşmeleri için %100; her bağlantı elle açılıp doğru ürüne gittiği görülmüş.

---

## Katman 1 — ölçüm temeli

Bu katman özellik üretmiyor. **Diğer her şeyin inandırıcılığı buna bağlı.**

### 1.1 Eval setini büyütmek

**Durum: 4 fotoğraf, 14 parça.** Bu bir kıyaslama seti değil, duman testi — ve
B-6…B-9'da verilen her karar bu 14 parçaya karşı ölçüldü. Renk metriğindeki
%71'in %64 mü %78 mi olduğunu 14 örnek söyleyemez; iki parçanın yönü değişse
skor 14 puan zıplıyor.

**Yapılacak**

- 30–50 fotoğraf. Çeşitlilik kasıtlı olmalı: stüdyo *ve* sokak, tam boy *ve*
  yarım boy kadraj, tek kişi *ve* kalabalık, açık *ve* koyu ten, gündüz *ve*
  yapay ışık, sade *ve* desenli. Şu anki dördü hepsi benzer: tek model, temiz
  arka plan, tam boy.
- Her fotoğraf için elle ölçülmüş kutular ve parça beklentileri
  (`eval/groundTruth.ts` → `EXPECTATIONS`).
- **Zorlu vakaları kasten dahil et:** parçanın kendi kutusunun azınlığı olduğu
  durumlar (ince bantlı sandalet, küçük bere), koyu-üstüne-koyu, örtüşen
  giysiler. Şu anki dört sapmanın hepsi bu sınıftan ve setin dörtte biri
  ediyor — gerçek dağılımı yansıtıyor mu bilmiyoruz.
- ~~Kutu ölçmeyi kolaylaştıracak küçük bir araç~~ — ✅ `tools/box-editor.html`.
  Tarayıcıda aç, fotoğrafı sürükle, kutuları çiz, `showcase.ts` ve
  `groundTruth.ts` girdilerini kopyala. Sunucu yok, derleme yok, uygulamaya
  eklenen rota yok; henüz `public/examples/`'a taşınmamış fotoğraflarda da
  çalışıyor. Ok tuşlarıyla 1px, Shift+ok ile 10px hassas kaydırma var, çünkü bir
  kutunun son iki pikseli işin bütünü. Çalışma localStorage'da saklanıyor.

**Bitti ölçütü:** `npm run eval` en az 30 kombin raporluyor ve tabanlar yeni,
daha geniş sete göre yeniden ayarlanmış.

### 1.2 Vision fixture'ları ve kutu doğruluğu — ✅ kod hazır, ölçüm anahtarı bekliyor

**Durum: ölçüm altyapısı yazıldı ve 28 kontrolle doğrulandı.** Metrikler fixture
gelir gelmez rapora düşüyor; anahtar olmadan sessiz kalıyorlar.

Yazılanlar:

- `eval/boxMatch.ts` — **bire-bir** eşleştirme (açgözlü, en yüksek örtüşmeden
  başlayarak), kaçan ve fazladan tespit muhasebesi, medyan ve eşik üstü oranı.
- `eval/replay.ts` — kaydedilmiş Vision yanıtını boru hattından geçiren ortak
  modül. Eval ve tarama **aynı** kodu kullanıyor.
- Yeni metrikler: kutu bulma, kutu isabeti, medyan IoU.
- `npm run eval:sweep` — 1080 kombinasyonluk ızgara taraması, mevcut değerlerin
  sıralamadaki yeriyle birlikte.

Anahtar olmadığı için doğrulama, referans verisinden üretilen **sentetik**
fixture'larla yapıldı: bu, ölçümün doğru çalıştığını kanıtlar; Vision'ın kutuları
ne kadar iyi çizdiği hakkında hiçbir şey söylemez. Sentetik fixture'lar
commit'lenmedi.

**Bulunduğu andaki hâli:** fixture yok, çünkü Vision anahtarı gerekiyor. "Hotspot sayısı"
metriği hiç çalışmadı, ve daha önemlisi **kutu doğruluğu hiç ölçülmedi.**

Şu an bilmediğimiz şey: Vision'ın çizdiği kutu gerçekten giysinin üzerinde mi?
Tüm renk, kırpma ve görsel karşılaştırma işi o kutunun doğru olduğunu varsayıyor.
Yanlışsa aşağıdaki her şey yanlış yerde ölçüm yapıyor.

**Yapılacak**

```bash
GOOGLE_CLOUD_VISION_API_KEY=... npm run eval:record
```

- Kaydedilen yanıtlara karşı **IoU** ölç: her referans kutu için en iyi Vision
  kutusunun örtüşmesi. Yeni metrik: "kutu IoU" (öneri: medyan ve %50 üstü oranı).
- NMS parametrelerini (`minScore`, `maxIou`, `maxContainment`, `mergeGap`)
  bu metriğe karşı tara. Hepsi şu an elle seçilmiş sabitler ve hiçbiri
  ölçülerek seçilmedi.
- Kaçırılan parça oranını ölç: referansta olup hiçbir tespitle örtüşmeyen.

**Bitti ölçütü (kod tarafı karşılandı):** metrikler raporlanıyor, tarama çalışıyor.
**Kalan:** `GOOGLE_CLOUD_VISION_API_KEY=... npm run eval:record`, sonra taban
değerlerini o çalıştırmanın bastığı sayıların biraz altına koymak.

### 1.3 VLM öznitelik kazancını kanıtlamak — ✅ kod hazır, ölçüm anahtarı bekliyor

**Durum: ölçüm altyapısı yazıldı, 102 kontrolle doğrulandı.** Metrikler fixture
gelir gelmez rapora düşüyor; anahtar olmadan sessiz kalıyorlar.

Aşama zaten yazılıydı (58 kontrol) — eksik olan onu **yargılayacak terazi**ydi.
Eldeki tek karşılaştırma "VLM rengi vs ölçülen renk"ti, ve o aşamanın bir
alanını ölçüyor; API çağrısının parası ise kullanıcıya giden **arama dizesi**
için ödeniyor.

Yazılanlar:

- `src/lib/searchQuery.ts` → `attributeSearchQuery` — öznitelikten sorgu kurma
  işi tek yere alındı, boru hattı ve eval **aynı** fonksiyonu çağırıyor. Sorgu
  metriğinin kendi yeniden-kurgusunu ölçmesi, kimsenin çalıştırmadığı kod için
  otoriter sayı üretmek olurdu (1.2'de `eval/replay.ts` ile aynı ders).
- **VLM sorgusu** metriği — tam sorgu, spesifik token'a karşı, tabanı aynı
  parçalarda Vision sınıfından kurulan sorgu. Renkleri kusursuz betimleyip daha
  kötü arama dizesi üreten bir aşamayı yalnızca bu yakalar.
- **Zor parçalar** satırı ve kapısı — `HARD_COLOR_ITEMS` (lc-beanie, lc-jeans,
  lc-sandals, bb-heels) parça parça raporlanıyor; dörtte üçün altı kırmızı.
  Aşamanın eklenme gerekçesi bu dört parça, o yüzden bu kapı bir tahmin değil.
- `eval/attributeScore.ts` — malzeme ve desen için **üç** sonuç: doğru,
  çekimser, uydurma. `scoreTitleAgreement` içinde çelişen malzeme eksi puan
  taşıdığı için, uydurulan bir "deri" doğru ürünleri aktif olarak aşağı itiyor;
  susan model ise sıralamayı olduğu gibi bırakıyor. İkisini tek orana toplamak,
  kullanıcıya sonuç kaybettiren tek hata türünü gizlerdi.
- Referansa elle ölçülmüş malzeme (5 parça) ve desen (9 parça) beklentileri.
  Kumaşı fotoğraftan söylenemeyen parçalar bilerek **derecelendirilmiyor** —
  söylenemeyen bir şeyi puanlamak sonuç uydurmak olur.
- `--repeat N` — model örneklenerek çalışıyor ve 14 parçada tek şanssız çekiliş
  manşeti yedi puan oynatıyor. Puan her zaman ilk örnekten (üretimde tek çağrı
  var); tekrarlar ayrı bir **kararlılık** satırı üretiyor.
- Betimlenmeyen parça artık sıfır değil **geri düşüş** olarak puanlanıyor, çünkü
  boru hattı reddi aldığında ölçülen renge ve Vision sınıfına dönüyor. Düz kayıp
  saymak, kodun yapmadığı bir şeyi ölçmek olurdu.

Yol boyunca bir ölçüm hatası da çıktı: token araması düz alt-dize karşılaştırması
yapıyordu, Türkçe'de son ünsüz yumuşadığı için "güneş gözlüğü" içinde "gözlük"
bulunamıyordu. Yani metrik, kusursuz bir cevabı kayıp sayıp çalışan kodun
değiştirilmesini savunacaktı — bir metriğin yanılabileceği en kötü yön.

Doğrulama **sentetik** kayıtlarla yapıldı ve commit edilmedi; ölçümün doğru
çalıştığını kanıtlar, gerçek modelin ne yaptığı hakkında hiçbir şey söylemez.

```bash
ANTHROPIC_API_KEY=... npm run eval:record-attrs           # ya da -- --repeat 3
npm run eval
```

**Bitti ölçütü (kod tarafı karşılandı):** metrikler raporlanıyor, kapılar
sentetik senaryolarda doğru yerlerde ateşliyor.
**Kalan:** anahtarlı kayıt. VLM rengi ve VLM sorgusu kendi tabanlarını geçmeli,
zor dört parçanın en az üçü kurtarılmalı. Kurtarılmazsa aşama kalmalı mı sorusu
yeniden açılır — bu bir olasılık, temenni değil, ve artık bir paragraf değil
kırmızı bir çalıştırma olarak geliyor. Uydurma oranı ilk gerçek kayıttan sonra
`FLOORS.vlmHallucination`'a yazılacak.

---

## Katman 2 — doğrulukta basamak atlamalar

Katman 1 bitmeden buraya girmek, ölçmeden ayarlamak demek.

### 2.1 Gerçek maske (segmentasyon)

Şu an "maske" diye kullandığımız şey bir **dikdörtgen**. Boru hattındaki üç ayrı
yama hep aynı temel problemi dolanıyor:

- `regionColor` örtüşen kutuların piksellerini atlıyor,
- `visualDescriptor` aynı şeyi histogram için yapıyor,
- `familyFitsBody` fiziksel olarak imkânsız yerleşimleri eliyor.

Üçü de kutunun giysi olmadığı gerçeğinin etrafından dolaşıyor. Ölçülmüş kanıt:
referans fotoğrafta hırka, şort kutusunun **%69'unu** kaplıyor; maskelemeden
önce şort pembeye hırkadan daha yakın ölçülüyordu (0.559 vs 0.353).

Piksel seviyesinde bir maske dört bilinen renk sapmasını da, betimleyicinin en
büyük zaafını da tek hamlede çözer.

**Seçenekler, maliyetle**

| Yol | Kazanç | Maliyet |
| --- | --- | --- |
| SAM / MobileSAM, kutu prompt'uyla | En iyi maske kalitesi | Model çalışma zamanı (ONNX), ~40 MB ağırlık, GPU olmadan yavaş |
| Kutu içinde GrabCut | Bağımlılık hafif | OpenCV gerekiyor; kalite pozla değişken |
| VLM'den poligon istemek | Yeni altyapı yok | Görsel modeller koordinatta güvenilmez — ölçmeden kabul edilemez |

Öneri: MobileSAM'i bir seçenek olarak ölç, ama **önce** 1.1'i bitir — maske
kalitesini 14 parçada değerlendirmek yine aynı hataya düşmek olur.

### 2.2 Modaya özel dedektör

Vision'ın sınıf sözlüğü moda için kaba: "Outerwear" hırkayı da parkayı da
kapsıyor, "Top" tişörtü de bodysuit'i de. B-6 bu boşluğu bir VLM çağrısıyla
kapatıyor, ama bu her parça için bir API çağrısı demek.

DeepFashion2 taksonomisiyle eğitilmiş bir dedektör 13 giysi kategorisini ve
landmark'ları doğrudan verir — yani hem sınıf hem kırpım kalitesi tek adımda
düzelir ve VLM çağrısı isteğe bağlı hâle gelir.

**Maliyet:** model çalışma zamanı + barındırma. Sunucusuz bir fonksiyonda soğuk
başlangıç ciddi bir problem; ayrı bir çıkarım servisi gerekebilir.

**Karar noktası:** VLM çağrısının maliyeti (tarama başına 4 çağrı) bir çıkarım
servisinin maliyetini geçtiğinde bu yol kendini finanse eder. Şu an trafik yok,
yani bu bir "sonra" maddesi — ama hangi eşikte açılacağı şimdiden yazılmalı.

### 2.3 Öğrenilmiş embedding ve vektör indeksi

`visualDescriptor` bir renk histogramı + 64 bit yapı. Ne yaptığını da, ne
yapamadığını da dosyada yazıyor: siyah deri ceketi siyah deri koltuktan ayırt
edemez. Eval'de kalan iki erişim sapması tam olarak bu sınır (siyah body, aynı
ışıktaki koyu denime yeniliyor).

Öğrenilmiş bir embedding anlam taşır. Gereken:

- bir görsel encoder (CLIP benzeri) ve onu koşturacak bir yer,
- **indekslenecek gerçek bir ürün beslemesi** — bu kritik parça ve bugün yok.
  Katalog görselleri çizim, canlı satırlar ise her taramada yeniden geliyor;
  indeks kurulacak kalıcı bir ürün havuzu yok.

Yani 2.3'ün önkoşulu ticari: bir ürün beslemesi anlaşması ya da kendi crawl'ımız.
Arayüz hazır — `describeImage` ve `visualSimilarity` değişir, üstündeki hiçbir
şey değişmez.

---

## Katman 3 — ürün ve işletme

### 3.1 Önbellek ve idempotanlık

Aynı fotoğraf iki kez taranırsa iki kez ödeniyor. Görselin hash'iyle
anahtarlanan bir sonuç önbelleği hem parayı hem gecikmeyi düşürür, hem de
"aynı fotoğraf aynı sonucu verir" garantisi getirir — şu an vermiyor.

Dikkat: kullanıcı fotoğrafını saklamak KVKK meselesi. Hash'i ve **sonucu**
saklamak, fotoğrafı saklamaktan farklı; bu ayrım yazılı olmalı ve gizlilik
politikasıyla tutarlı olmalı.

### 3.2 Gözlemlenebilirlik

Şu an elimizde `console.warn` var. Bir taramanın neden kötü sonuç verdiğini
üretimde anlamanın yolu yok.

- Aşama başına süre (Vision / VLM / Context.dev / görsel) yanıtta taşınsın,
  arayüzde geliştirici modunda görünsün.
- Yapılandırılmış log: hangi aşama degrade etti, kaç satır elendi ve neden.
  Eleme gerekçeleri zaten üretiliyor (`rejectProductTitle`, `scoreTitleAgreement`
  insan okuyabilir sebep döndürüyor) — sadece toplanmıyor.
- Bir "tarama teşhisi" görünümü: kutular, aileler, puanlar, elenen satırlar.
  Bu aynı zamanda 1.1'deki etiketleme işini hızlandırır.

### 3.3 Bozulma anında kullanıcı deneyimi

Vision düşerse route mock'a düşüyor ve arayüz bir rozet gösteriyor. Ama:
Context.dev süre aşımına düşerse kullanıcı ne görüyor? VLM reddederse? Hız
sınırına takılırsa? Bunların hiçbiri arayüzde denenmedi.

Her degrade yolu için ekranda ne yazdığını gösteren bir tarayıcı testi.

### 3.4 Erişilebilirlik ve performans denetimi

Hiç yapılmadı. Klavye gezinmesi, odak tuzakları, kontrast oranları, ekran
okuyucu etiketleri; Lighthouse / axe koşumu. Hotspot'lar `aria-label` taşıyor ve
`aria-pressed` kullanıyor — iyi başlangıç, ama denetlenmiş değil.

---

## Sıralama önerisi

1. ~~**0.2** (görsel sertleştirme)~~ — ✅ tamamlandı.
2. **0.1** (hız sınırı) — kalıcı depo seçimi gerektiriyor, o yüzden ikinci.
3. **1.1** (eval seti) — en yüksek kaldıraç, ve senin fotoğraf toplamana bağlı.
4. ~~**1.2 + 1.3** (fixture'lar)~~ — kod tarafı bitti; kalan iş anahtarları
   verip iki komutu çalıştırmak, tek oturum.
5. **0.3** (bağlantı + fotoğraf) — veri işi, paralel yürüyebilir.
6. **3.2** (gözlemlenebilirlik) — 1.1'i hızlandırdığı için buraya alındı.
7. **2.1** (segmentasyon) — ölçüm temeli oturduktan sonra.
8. Gerisi trafik ve ticari koşullara bağlı.

Bu sırada tek bir kural var: **Katman 1 bitmeden Katman 2'ye geçilmiyor.** Bu
projede ölçmeden ayarlamanın ne ürettiğini biliyoruz.
