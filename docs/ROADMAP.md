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

**Neden eldeki dört ek örnek bunu karşılamıyor.** `public/examples/` altında dört
görsel daha var (`streetwear`, `glam-makeup`, `tailoring`, `soft-minimal`) ve
`MOCK_SCENARIOS` içinde karşılıkları duruyor. Eval setine eklemek cazip görünüyor
ama **yanlış olurdu**: dördü de düz vektör çizim — ışık yok, doku yok, giysi
başına tek dolgu. Böyle bir görselde renk ölçmek neredeyse tanım gereği doğru
çıkar, yani her metrik yükselir ve bu yükseliş fotoğraflar hakkında hiçbir şey
söylemez. Bu belgenin başındaki uyarının ta kendisi.

Onun yerine ayrı bir koruma yazıldı (`demos` süiti, 72 kontrol): sekiz demo
görünümünün kutuları kadraj içinde mi, birbirinin üstüne binmiyor mu, her bölgeden
renk ölçülebiliyor mu, ve **etikette yazan renk ölçülenle uyuşuyor mu**. Bu bir
doğruluk metriği değil; kullanıcının ilk tıkladığı yüzeyin bozulmadığını
gösteren bir regresyon koruması.

O koruma bir kusur da buldu: `sw-top` ("Fitilli **Beyaz** Crop Üst") kutusu o
kadar cömertti ki piksellerinin ~%60'ı üstteki ceketti — yani beyaz bir giysinin
renk örneği siyah ölçülüyordu. Kutu, beyaz dolgunun gerçek sınırlarına
(x 0.444–0.554, y 0.378–0.435) çekildi.

Yani bu madde hâlâ **fotoğraf bekliyor** ve bu, bu ortamda kapatılamayacak tek
teknik madde: stok fotoğraf sağlayıcıları ağ politikasınca kapalı (403), ve
referans veriyi uydurmak bu projenin tam olarak reddettiği şey.

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
| **Eleme: fon + ten** | Model yok, ek gecikme ~yok | Kaba; ince yapılarda ve solmuş kumaşta yetersiz |

#### 2.1a Eleme yoluyla ön plan — ✅ tamamlandı, %71 → %86

**Durum: yazıldı, 54 kontrolle doğrulandı, ölçülen kazanç 10/14 → 12/14, bozulan
yok.** Öğrenilmiş bir segmentasyon modeli **değil**; onun yerini almıyor, ona
gerek kalmadan alınabilecek kısmı alıyor.

`src/services/foreground.ts` iki şeyi eliyor — ikisi de kanıtla, tahminle değil:

- **Fon**, her tespit kutusunun *ve* kişinin dışında kalan piksellerden
  öğreniliyor. O pikseller varsayımla değil **tanımı gereği** arka plan.
- **Ten**, standart kromatiklik kurallarıyla (Kovač RGB + YCbCr aralığı).
  Ölçümün kaçırdığı dört parçanın **dördünde de** kutunun içinde ten var:
  sandaleti çerçeveleyen bacaklar, eşarbın altındaki yüz, yırtıktan görünen diz.

Eleme, "kutunun baskın rengini reddet" fikrinin yeniden denenmesi değil — o
ölçülüp reddedilmişti. Fark bilgi kaynağında: fon, arka planın **bilindiği**
yerden öğreniliyor.

**Kritik güvenlik: fon bir palet, sahne değil.** İlk sürüm siyah deri ceketi
bozdu — biker fotoğrafının "dışarısı" bir cam ofis cephesi ve koyu bantları
ceketle aynı kovaya düşüyor. Yani reddedilmiş yaklaşımın hatası, başka bir yoldan
geri geldi. Çözüm: dışarıdaki alanın %80'ini kaç rengin kapladığına bak.

```
stüdyo:  long-coat 3 kova,  black-blazer 5
sokak:   pink-outfit 11,    biker-look 11
```

Sekiz bu boşlukta. Dürüst olmak gerekirse dört fotoğrafta altı ile on arası her
sayı aynı çizgiyi çizerdi; keyfi olmaktan çıkaran şey bir anlam taşıması —
512 renkli ızgaranın %1.5'i, bir duvarın gradyanıyla ve gölgesiyle sığdığı, bir
sokağın sığmadığı yer. **1.1 geldiğinde ilk yeniden ölçülecek sabit bu.**

Çekimserlik bedava: fon öğrenilemediğinde iki sokak fotoğrafının **renk
sonuçları hiç değişmiyor** (kova bazında birebir, hex birkaç birim kayıyor,
çünkü ten çıkarma orada da çalışıyor). Kutu içi kırpma payı da yalnızca fon
modeli varken kaldırılıyor — yalnız tene güvenip payı kaldırmak `po-shorts`'a
mal oldu, ölçüldü, geri alındı.

**Kalan iki sapma ve neden burada durulduğu.** `lc-jeans` ve `bb-heels` hâlâ
yanlış. Maskeleri render edip bakıldı: `bb-heels`'in maskesi **doğru** — bantlar
ve topuk korunuyor — ama 48×48 örneklemede iki piksel genişliğindeki bir bandın
her pikseli kenar karışımı. `lc-jeans`'te ise solmuş denim gerçekten fonla aynı
kovaya düşüyor ve kumaşın bir kısmı eleniyor.

Örnekleme çözünürlüğü (48/64/96/128) × kova genişliği (16/32) ızgarası tarandı:
**hiçbir kombinasyon 12/14'ü geçmiyor**, yalnızca hangi ikisinin kaçtığı
değişiyor (`lc-beanie` ile `bb-heels` yer değiştiriyor). Yani bu iki sapma bu iki
sabitle ulaşılabilir değil — tam olarak yol haritasının baştan söylediği şey.
Sabitler olduğu gibi bırakıldı; bir maddeyi kurtarmak için sayı oynatmak, dört
fotoğrafa uydurmak olurdu.

#### 2.1b Gerçek maske — açık

Yukarıdakinin kapatmadığı yer: ince yapılar ve fonla aynı renkteki kumaş. Onun
için hâlâ piksel seviyesinde bir maske gerekiyor.

Bu ortamda ağırlık indirilemiyor (Hugging Face ve npm CDN'leri erişime kapalı),
yani MobileSAM'i **ölçmek** bile burada mümkün değil. Ağı açık bir makinede
yapılacak iş.

Öneri değişmedi: MobileSAM'i bir seçenek olarak ölç, ama **önce** 1.1'i bitir —
maske kalitesini 14 parçada değerlendirmek yine aynı hataya düşmek olur. 2.1a bu
sırayı bozmuyor, çünkü kazancı zaten var olan bir metrikte ve bozulan yok.

**Betimleyiciye bağlamak ölçüldü ve reddedildi.** Bu belge "piksel seviyesinde bir
maske … betimleyicinin en büyük zaafını da tek hamlede çözer" diyordu; ölçüm
tersini söyledi:

```
görsel erişim   filtresiz 12/14   filtreli 10/14
```

Piksel atmak iki histogramı da seyreltiyor ve bunu **asimetrik** yapıyor — sıkı
kırpım ile gevşek kırpım farklı oranlarda kaybediyor, yani aynı giysinin iki
görüntüsü birbirinden uzaklaşıyor. `describeImage` seçeneği duruyor ama boru
hattı kullanmıyor.

Dürüstlük payı: bu test aynı fotoğrafın iki kırpımını karşılaştırıyor, yani ortak
fon aslında **ortak sinyal** — bir mağazanın beyaz stüdyo çekimine karşı olmazdı.
Yani ölçüm filtrenin aleyhine yanlı. 0.3 gerçek ürün fotoğraflarını getirdiğinde
ya da 1.1 seti büyüttüğünde tekrar ölçülmeli. O zamana kadar ölçülmüş cevap
"kapalı".

### 2.2 Modaya özel dedektör

Vision'ın sınıf sözlüğü moda için kaba: "Outerwear" hırkayı da parkayı da
kapsıyor, "Top" tişörtü de bodysuit'i de. B-6 bu boşluğu bir VLM çağrısıyla
kapatıyor, ama bu her parça için bir API çağrısı demek.

DeepFashion2 taksonomisiyle eğitilmiş bir dedektör 13 giysi kategorisini ve
landmark'ları doğrudan verir — yani hem sınıf hem kırpım kalitesi tek adımda
düzelir ve VLM çağrısı isteğe bağlı hâle gelir.

**Maliyet:** model çalışma zamanı + barındırma. Sunucusuz bir fonksiyonda soğuk
başlangıç ciddi bir problem; ayrı bir çıkarım servisi gerekebilir.

**Karar noktası — eşik, sonra hatırlamak yerine şimdi yazıldı.**

Değişken maliyet: tarama başına `VLM_MAX_ITEMS` (varsayılan 4) model çağrısı.
Her çağrı bir kırpım (~640px kenar, birkaç yüz token görsel) artı kısa bir JSON
yanıtı. Kaba hesapla parça başına ~1500 girdi + ~150 çıktı token'ı, yani
`claude-opus-5` fiyatlarıyla (girdi $5/M, çıktı $25/M) parça başına ~$0.011,
**tarama başına ~$0.045**.

Sabit maliyet: kendi çıkarım servisi. Bir DeepFashion2 dedektörünü sıcak tutan
en küçük GPU'suz örnek aylık **~$25–40** bandında (küçük bir konteyner + sürekli
çalışma); CPU'da soğuk başlangıç sunucusuz için kabul edilemez olduğu için
"sıcak tutmak" bu kalemin tamamı.

Başabaş: `$30 / $0.045 ≈ 670 tarama/ay` — günde ~22 tarama.

Yani eşik şu: **aylık tarama sayısı istikrarlı biçimde 1000'i geçtiğinde** (bir
miktar pay bırakarak) kendi dedektörü kendini finanse etmeye başlar. Bunun
altında VLM çağrısı hem daha ucuz hem de bakımı yok.

Bu sayı 3.2 ile ölçülebilir hâle geldi: `[scan]` logu tarama başına bir satır
yazıyor, saymak için ayrı bir iş gerekmiyor.

İki uyarı, sayının kendisinden önemli:

1. **Doğruluk eşitliği varsayılmamalı.** Yukarıdaki hesap iki yolun aynı sonucu
   verdiğini varsayıyor. VLM aşamasının doğruluk kazancı 1.3 ile ölçülecek; bir
   dedektörünki ölçülmedi. Ucuz olan yol daha kötüyse başabaş noktası anlamsız.
2. **Ölçek, kararı tersine de çevirebilir.** Trafik yeterince büyürse dedektör
   sabit maliyetli, VLM doğrusal maliyetli kalır — yani makas açılmaya devam
   eder. Ama o noktada 2.3'ün (öğrenilmiş embedding) önkoşulu olan ürün beslemesi
   de muhtemelen vardır, ve ikisi aynı çıkarım altyapısını paylaşır. O yüzden bu
   madde 2.3'ten **önce** değil, onunla **birlikte** değerlendirilmeli.

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

### 3.1 Önbellek ve idempotanlık — ✅ tamamlandı

Aynı fotoğraf iki kez taranırsa iki kez ödeniyor. Görselin hash'iyle
anahtarlanan bir sonuç önbelleği hem parayı hem gecikmeyi düşürür, hem de
"aynı fotoğraf aynı sonucu verir" garantisi getirir — şu an vermiyor.

Dikkat: kullanıcı fotoğrafını saklamak KVKK meselesi. Hash'i ve **sonucu**
saklamak, fotoğrafı saklamaktan farklı; bu ayrım yazılı olmalı ve gizlilik
politikasıyla tutarlı olmalı.

### 3.2 Gözlemlenebilirlik — ✅ tamamlandı

Şu an elimizde `console.warn` var. Bir taramanın neden kötü sonuç verdiğini
üretimde anlamanın yolu yok.

- Aşama başına süre (Vision / VLM / Context.dev / görsel) yanıtta taşınsın,
  arayüzde geliştirici modunda görünsün.
- Yapılandırılmış log: hangi aşama degrade etti, kaç satır elendi ve neden.
  Eleme gerekçeleri zaten üretiliyor (`rejectProductTitle`, `scoreTitleAgreement`
  insan okuyabilir sebep döndürüyor) — sadece toplanmıyor.
- Bir "tarama teşhisi" görünümü: kutular, aileler, puanlar, elenen satırlar.
  Bu aynı zamanda 1.1'deki etiketleme işini hızlandırır.

### 3.3 Bozulma anında kullanıcı deneyimi — ✅ tamamlandı

Vision düşerse route mock'a düşüyor ve arayüz bir rozet gösteriyor. Ama:
Context.dev süre aşımına düşerse kullanıcı ne görüyor? VLM reddederse? Hız
sınırına takılırsa? Bunların hiçbiri arayüzde denenmedi.

Her degrade yolu için ekranda ne yazdığını gösteren bir tarayıcı testi.

### 3.4 Erişilebilirlik ve performans denetimi — ✅ tamamlandı

Hiç yapılmadı. Klavye gezinmesi, odak tuzakları, kontrast oranları, ekran
okuyucu etiketleri; Lighthouse / axe koşumu. Hotspot'lar `aria-label` taşıyor ve
`aria-pressed` kullanıyor — iyi başlangıç, ama denetlenmiş değil.

---

---

## Şu an nerede duruyoruz

```bash
npm run doctor    # neyin eksik olduğunu ve tam olarak ne çalıştırılacağını yazar
```

Bu tablo elle güncellenen bir liste; `npm run doctor` aynı soruyu **ortamın
gerçek hâline bakarak** cevaplıyor (ortam değişkenleri, kayıtlı fixture'lar,
doğrulanmış bağlantılar). Bir madde dolduğunda kendiliğinden yeşile döner, yani
belgenin bayatlaması bir şeyi gizlemez.

Kodla kapatılabilecek her madde kapandı. Kalanların hepsi **senin
sağlayabileceğin bir girdiyi** bekliyor — anahtar, fotoğraf, veri ya da bir hesap:

| Madde | Bekleyen |
| --- | --- |
| 0.1 | `UPSTASH_REDIS_REST_URL` / `_TOKEN` — onlarsız sayaçlar süreç-yerel |
| 0.3 | `VERIFIED_PDP_URLS` (elle doğrulanmış bağlantılar), sonra `npm run fetch:images` |
| 1.1 | 30–50 çeşitli fotoğraf + elle ölçülmüş kutular (`tools/box-editor.html` hazır) |
| 1.2 | `GOOGLE_CLOUD_VISION_API_KEY=... npm run eval:record` |
| 1.3 | `ANTHROPIC_API_KEY=... npm run eval:record-attrs` |
| 2.1b | Ağı açık bir makine — model ağırlıkları buradan indirilemiyor |
| 2.2 | Aylık 1000+ tarama (bkz. yukarıdaki eşik hesabı) |
| 2.3 | Bir ürün beslemesi anlaşması ya da kendi crawl'ımız |
| Yasal | `/yasal-bildirim` içindeki veri sorumlusu kimliği; `iletisim@` ve `destek@` kutularının izlendiğinin teyidi |

Ölçülen durum:

```
Bölge rengi      86%  (12/14)   taban 80%
Sorgu token'ı   100%  (14/14)   taban 90%
Vision sınıfı   100%  (14/14)   taban 100%
Görsel erişim    86%  (12/14)   taban 70%, şans %7
Aile tutarlılığı 100%  (14/14)   taban 90%
Erişilebilirlik  61/61 kontrol, altı sayfa
Bozulma yolları  20/20 kontrol
```

Ve bu tablonun en önemli satırı **14**: her yüzde bu kadar küçük bir sete karşı
ölçülüyor. 1.1 olmadan bu sayılar yön gösterir, büyüklük göstermez.

## Sıralama önerisi

1. ~~**0.2** (görsel sertleştirme)~~ — ✅
2. ~~**0.1** (hız sınırı)~~ — ✅ kod; yalnızca Upstash kimlikleri kaldı.
3. **1.1** (eval seti) — **sıradaki en yüksek kaldıraç ve tek gerçek engel.**
   Diğer her ölçüm 14 parçaya bakıyor; bu sayı büyümeden ne 1.2/1.3'ün tabanları
   ne de 2.1'in sabitleri güvenilir biçimde ayarlanabilir.
4. ~~**1.2 + 1.3** (fixture'lar)~~ — ✅ kod; anahtarlar verilince tek oturum.
5. **0.3** (bağlantı + fotoğraf) — veri işi, paralel yürüyebilir; ürünü
   "satın alınabilir" yapan tek madde.
6. ~~**3.2** (gözlemlenebilirlik)~~ — ✅, ve 1.1'i hızlandırıyor: canlı bir
   taramanın kutularını teşhis panelinden okumak elle geçirmekten hızlı.
7. ~~**2.1a** (eleme yoluyla ön plan)~~ — ✅ %71 → %86.
8. **2.1b / 2.2 / 2.3** — trafik ve ticari koşullara bağlı; eşikleri yukarıda
   yazılı, tahmin gerektirmiyorlar.

Bu sırada tek bir kural var: **Katman 1 bitmeden Katman 2'ye geçilmiyor.** Bu
projede ölçmeden ayarlamanın ne ürettiğini biliyoruz.
