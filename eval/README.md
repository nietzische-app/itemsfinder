# Tespit doğruluğu değerlendirmesi

```bash
npm run eval                 # renk, sorgu, aile — anahtar gerekmez
npm run eval -- --verbose    # parça parça detay
npm run eval -- --floors     # ölçülene göre yapıştırılabilir FLOORS bloğu
npm run eval:record          # gerçek Vision yanıtlarını kaydet (anahtar ister)
npm run eval:record-attrs    # gerçek VLM özniteliklerini kaydet (anahtar ister)
npm run eval:sweep           # NMS sabitlerini ızgarada tara (fixture ister)
```

Çıkış kodu, metriklerden biri tabanın altına düştüğünde sıfırdan farklı olur —
yani bir değişikliği tip denetleyicisi gibi kapıda tutabilir.

Set büyüdüğünde (1.1) tabanların hepsi yanlış kalır: fazla yüksekse çalışma kalıcı
kırmızı, fazla düşükse hiçbir şey söylemez. `--floors` ölçülene 5 puan pay
bırakarak yapıştırılabilir bir blok basar. **Otomatik uygulanmıyor ve
uygulanmayacak** — kendi puanına taban koyan bir çalıştırma kapı değil, kaşedir.

## Neden var

Bundan önceki her "iyileştirme" tek bir ekran görüntüsüne bakılarak
değerlendirildi. Global baskın rengin siyah şortu "pudra" diye etiketlemesi
tam bu yüzden uzun süre ayakta kaldı. Buradaki sayıların değeri mutlak
büyüklükleri değil, boru hattı değiştiğinde **hangi yöne gittikleri**.

## Kapsam — dürüst hâli

**Otuz bir kombin, yetmiş dört parça.** Dördü vitrin görünümü (kutular
`SHOWCASE_LOOKS`'tan, etiketler `MOCK_SCENARIOS`'tan), yirmi yedisi
`eval/photoCases.ts` içinde duran ve demo kataloğuna hiç dokunmayan elle
etiketlenmiş fotoğraflar.

O ayrım kasıtlı: bir vaka eskiden `MOCK_SCENARIOS` girdisi de istiyordu, yani
fiyatlı-mağazalı tam ürün kartları. Otuz fotoğrafı öyle eklemek yüz tane sahte
ürün uydurmak olurdu. Bir eval vakasının ürüne ihtiyacı yok — fotoğraf, kutular,
ve bir insanın onlarda gördüğü şey yeterli.

Hâlâ bir kıyaslama seti sayılmaz ama artık duman testinden fazlası: stüdyo ve
sokak, tam boy ve yarım boy, açık ve koyu ten, gündüz ve yapay ışık, sade ve
desenli, kadın ve erkek.

Vaka eklemek: fotoğrafı `public/examples/`'a koy ve `eval/photoCases.ts`'e
kutularıyla birlikte bir kayıt ekle. `npm run eval` otomatik alır. Vitrin
görünümlerinin yolu (`SHOWCASE_LOOKS` + `MOCK_SCENARIOS` + `groundTruth.ts`
içindeki `EXPECTATIONS`) yalnızca demo kartı da olan dört kombin için duruyor;
yeni ölçüm vakaları o yoldan geçmiyor.

Kutuyu gözle kestirme: fotoğrafı 0..1 ızgara altında bas, kutuyu ızgaradan oku,
sonra kutuyu fotoğrafın üstüne geri çizip bak. Bir onda bir kayan kutu yanlış
pikselleri çok isabetli ölçer, ve bu adım atlandığında yakalanmıyor.

Kutuları elle ölçmek yerine `tools/box-editor.html`'i tarayıcıda aç: fotoğrafı
sürükle, kutuları çiz, ok tuşlarıyla piksel piksel düzelt, sonra **groundTruth.ts**
sekmesindeki bloğu kopyala. Editörün ürettiği satır `ItemExpectation` şemasına
birebir uyuyor ve bu bir testle korunuyor (`editor` süiti, 13 kontrol) — şema
değişip editör geride kaldığında, yapıştırılan kod derlenmediği için değil,
test kırmızıya döndüğü için haberimiz olur.

Malzeme ve desen alanlarını **boş bırakmak normaldir**: editör onları `null`
olarak yazar ve eval `null` olanı derecelendirmez. Fotoğraftan söyleyemediğin bir
kumaşı yazmak, ölçüme cevap uydurmaktır.

**Renk de `null` olabilir, ama yalnızca desenliler için.** Siyah-kiremit bir
kazayağı ceket #99948d ölçüyor — dokunduğu iki ipliğin hiçbirini adlandırmayan
sıcak bir gri — ve kimse "gri kazayağı" aramıyor. Böyle bir parçada renk
notlanmaz; sorgu token'ı, Vision sınıfı ve **desen** yine notlanır, yani vaka
fotoğrafın söylediği her şeyi ölçer ve söylemediği hiçbir şeyi ölçmez.

Bunu "boru hattının zorlandığı parçayı çıkarma" olarak kullanma. Koyu bordo,
koyu indigo, montun altından görünen bir pantolon şeridi — bunların insanın
söyleyebileceği bir cevabı var, ve boru hattı yanlış diye çıkarmak evali kimseye
bir şey söyleyemez hâle getirir. Kaç parçanın notlanmadığı özet satırında
yazıyor, çünkü sessizce küçülen bir payda, boru hattı değişmeden puanın
yükselmesinin yoludur.

## Kayıt betiklerini anahtarsız denemek

`eval:record` ve `eval:record-attrs` gerçek çağrı yapıyor, yani anahtar
harcamadan çalıştıklarını görmenin yolu yoktu — ve anahtar genelde tek bir
oturumda elde oluyor. `scripts/stubs/` altındaki iki sunucu API'lerin şeklini
taklit ediyor; ikisi de `VISION_BASE_URL` / `VLM_BASE_URL` ile devreye giriyor.
Kullanımı ve **üretilen fixture'ların neden silinmesi gerektiği**
`scripts/stubs/README.md` içinde.

Bir kez sürüldü: iki betik de 31 kombinin tamamını yazdı, `npm run eval` hotspot,
kutu bulma/isabet/IoU, VLM renk/ürün adı/sorgu, malzeme-desen ve kararlılık
metriklerinin hepsini hesapladı, ve göreli kapılar kırmızıya döndü — kasten kötü
bir stub'a karşı doğru davranış. Yani gerçek anahtar geldiğinde ölçülecek yol
baştan sona çalışıyor; kalan tek bilinmeyen sayıların kendisi.

## Metrikler

| Metrik | Ne ölçüyor | Taban |
| --- | --- | --- |
| Bölge rengi | Ölçülen baskın rengin, insanın adlandıracağı renk ailesiyle eşleşmesi (fon + ten elenerek) | %78 |
| VLM rengi | Kırpıma bakan modelin verdiği rengin aynı eşleşmeyi tutması (fixture ister) | aynı parçalarda ölçülen renk |
| VLM ürün adı | Modelin verdiği Türkçe ürün adının beklenen token'ı taşıması (fixture ister) | — |
| VLM sorgusu | Modelin gördüklerinden kurulan **tam sorgunun** spesifik token'ı taşıması (fixture ister) | aynı parçalarda Vision sınıfı |
| Zor parçalar | Kutusu ağırlıklı arka plan olan dört parçadan kaçının kurtarıldığı (fixture ister) | 4'te 3 |
| Malzeme / Desen | Modelin öne sürdüğü özniteliklerin fotoğrafla tutması — doğru / çekimser / **uydurma** (fixture ister) | henüz yok |
| Sorgu token'ı | Üretilen aramanın, parçayı bulmaya yetecek Türkçe kelimeyi taşıması | %90 |
| Vision sınıfı | **Yalnızca** Vision'ın İngilizce sınıfından üretilen sorgunun Türkçe terimi taşıması ve İngilizce kelime bırakmaması | %100 |
| Görsel erişim | Bir parçanın sıkı kırpımının, **tüm** gevşek kırpımlar arasından kendi eşini bulması | %45 (şans, set boyutundan hesaplanıyor) |
| Aile tutarlılığı | Sınıflandırıcının kataloğu kendi içinde tutarlı etiketlemesi | %90 |
| Hotspot sayısı | Temizlenmiş tespit sayısının beklenene ±1 yakınlığı (fixture ister) | %75 |
| Kutu bulma | Etiketli parçaların kaçının bir tespitçe IoU ≥ 0.5 ile sahiplenildiği, **bire-bir** (fixture ister) | henüz yok |
| Kutu isabeti | Tespitlerin kaçının gerçek bir parçaya oturduğu (fixture ister) | henüz yok |
| Kutu IoU | Eşleşen çiftlerin medyan örtüşmesi — "kaç tane" değil "ne kadar iyi çerçevelendi" (fixture ister) | henüz yok |

VLM renginin tabanı **göreli**: hiç ölçülmemiş bir aşamaya mutlak bir sayı
koymak ya kalıcı kırmızı ya da bedava yeşil olurdu. Tartışılmaz olan yön:
boru hattı modelin rengini ölçülen renge **tercih ediyor**, dolayısıyla model
rengi aynı parçalarda ölçülenden kötüyse bu tercih yanlıştır ve eval kırmızıya
düşer. Karşılaştırma yalnızca fixture'ı olan parçalar üzerinde yapılıyor —
14 parçalık skoru 4 parçalık skorla kıyaslamak iki farklı soruyu kıyaslamak
olurdu.

"VLM sorgusu" aynı mantığın bir üst katı. Renk metriği aşamanın bir alanını
ölçüyor; API çağrısının **parası** ise kullanıcıya giden arama dizesi için
ödeniyor. Bu yüzden sorgu, boru hattının kendi birleştiricisiyle
(`attributeSearchQuery`) kuruluyor ve kaba yolla — aynı parçalarda Vision'ın
sınıfından üretilen sorguyla — kıyaslanıyor. Renkleri kusursuz betimleyip daha
kötü bir arama dizesi üreten bir aşama, çağrısını hak etmemiştir; bunu yalnızca
sorgu metriği yakalar.

**Betimlenmeyen parça sıfır değil, geri düşüştür.** Model bir kırpımı
reddettiğinde boru hattı ölçülen rengi ve Vision'ın sınıfını kullanmaya devam
ediyor — yani aşama kapalıyken ne oluyorsa o. Reddi düz bir kayıp saymak,
kodun yapmadığı bir şeyi ölçmek olurdu. İki manşet sayı da bu yüzden
"kullanıcının eline ne geçiyor" sorusunun cevabı; reddin bedeli ayrıca
"kaç parça betimlendi" satırında duruyor.

**Malzeme ve desen iki değil üç sonuçlu.** `scoreTitleAgreement` içinde eşleşen
malzeme artı puan, çelişen malzeme **eksi** puan taşıyor. Yani hiçbir şey
söylemeyen model sıralamayı olduğu gibi bırakırken, keten cekete "deri" diyen
model doğru ürünleri aşağı itiyor. Bu ikisini tek bir "doğruluk" oranında
toplamak, kullanıcıya sonuç kaybettiren tek hata türünü gizlerdi. Referansta
malzeme yalnızca beş parçada var: kalanlarda kumaşı fotoğraftan kimse
söyleyemez, ve söylenemeyen bir şeyi puanlamak sonuç uydurmak olur.

`--repeat N` ile kaydedilen turlar **doğruluk değil kararlılık** ölçüyor. Puan
her zaman **ilk** örnekten geliyor, çünkü üretimde tek çağrı var; çoğunluk oyunu
puanlamak hiçbir kullanıcının almadığı bir doğruluğu raporlamak olurdu.
Kararlılık satırı ayrı bir soruya cevap veriyor: 14 parçada tek bir şanssız
çekiliş manşeti yedi puan oynatır, ve tek kayıt bunu göstermez.

"Vision sınıfı" metriği, "Sorgu token'ı" metriğinin kendini kandırdığı yeri
kapatıyor: o metrik elle yazılmış **Türkçe** etiketle besleniyor, dolayısıyla
her zaman %100 raporladı — oysa *varsayılan* yol (VLM anahtarı yok, web varlığı
yok) elinde yalnızca Vision'ın İngilizce sınıfı ve ölçülen renkle
`"Siyah Shorts"` üretiyordu; "Outerwear", "Footwear" ve "Top" için de gürültü
listesinde oldukları için yalnızca `"Siyah"`. Taban %100, çünkü buradaki her
sapma eksik bir sözlük girdisidir — düzeltilebilir bir şey, kaçınılmaz bir
sınır değil.

Bu metrik `visionToken`'a karşı puanlanıyor ve o kasten daha zayıf:
Vision "Footwear" diyor, "sneaker" demiyor. Hiçbir sözlük, dedektörün hiç
görmediği bir ayrıntıyı geri getiremez; kaba yolu spesifik cevaba göre
puanlamak, ona hiç sorulmamış bir soruyu sormak olurdu.

Aile metriği **doğruluk değil tutarlılık** ölçüyor: referans aileler de aynı
sınıflandırıcıdan türetiliyor. Bir kural değişikliğinin kataloğun yarısını
sessizce yeniden sınıflandırmasını yakalar; sınıflandırıcının doğru olduğunu
kanıtlamaz. Gerçek doğruluk, Vision çıktısına karşı ölçülür — fixture'lar bu
yüzden var.

## Mevcut taban (2026-07-30)

```
4 kombin / 14 parça
  Bölge rengi      86%  (12/14)
      pink-outfit    arka plan öğrenilmedi (sahne, fon değil) — yalnızca ten çıkarıldı
      biker-look     arka plan öğrenilmedi (sahne, fon değil) — yalnızca ten çıkarıldı
      long-coat      arka plan 6 renk, %80 kapsama 3 kovada
      black-blazer   arka plan 7 renk, %80 kapsama 5 kovada
  VLM rengi        —     (fixture yok)
  Sorgu token'ı   100%  (14/14)
  Vision sınıfı   100%  (14/14)
  Görsel erişim    86%  (12/14)
  Aile tutarlılığı 100%  (14/14)
  Hotspot sayısı   —     (fixture yok)
```

Renk %57'den %71'e çıktı: iki sapma renk **sınıflandırma** hatasıydı (doygun
koyu lacivert "koyu" sayılıyordu, metal çerçeve grisi eşiğin dışında
kalıyordu).

Kalan dört sapma (`lc-beanie`, `lc-jeans`, `lc-sandals`, `bb-heels`) aynı
sınıfa ait: **parça kendi kutusunun azınlığı.** İnce sandalet bantları gri
zemini çerçeveliyor, küçük bir bere stüdyo duvarına karşı, topuk beyaz fona
karşı — baskın renk arka plan oluyor.

Bu set üzerinde ölçülüp **reddedilen** üç çözüm:

1. **Daha büyük örnekleme payı** (0.26 / 0.32 / 0.38) — daha kötü; kısa
   kutularda örneklem tamamen kayıyor.
2. **Arka plan rengini reddetme** — daha kötü; parça ile fon ikisi de koyu
   olduğunda parçanın kendi rengini atıyor.
3. **Baskınlık eşiğiyle çekimserlik** — iki doğru cevabı kaybetti, hiçbirini
   kurtarmadı. Baskın bir *arka plan* kümesi, kutusunu gerçekten dolduran bir
   parçadan payına bakarak ayırt edilemiyor.

Bunları düzeltecek olan gerçek bir maske: segmentasyon ya da kırpıma bakan bir
görsel dil modeli. Yeni bir sabit değil. O iş girdiğinde taban yükseltilmeli.

### Eleme yoluyla ön plan (2.1a) — %71 → %86

O iş kısmen girdi. `src/services/foreground.ts` dikdörtgenin içinden iki şeyi
eliyor: her kutunun *ve* kişinin dışında kalan piksellerden **öğrenilen** fon, ve
standart kromatiklik kurallarıyla **ten**. Dört sapmanın dördünde de kutunun
içinde ten var; ikisi (`lc-beanie`, `lc-sandals`) böylece kurtarıldı ve **hiçbir
şey bozulmadı**, o yüzden taban %70'ten %80'e çıktı.

Bu, yukarıdaki 2. maddenin tekrarı değil: fon, arka planın *bilindiği* yerden
öğreniliyor. Ama aynı tuzağa başka yoldan düşüyor — ilk sürüm siyah deri ceketi
bozdu, çünkü biker fotoğrafının dışarısı bir cam cephe, fon değil. Bu yüzden model
yalnızca **dışarısı dar bir palet olduğunda** devreye giriyor (stüdyoda %80
kapsama 3–5 kova, sokakta 11). Devreye girmediğinde renk sonuçları kova bazında
birebir değişmeden kalıyor — çekimserlik gerçekten bedava, ve bu test edilerek
iddia ediliyor.

Kalan iki sapma (`lc-jeans`, `bb-heels`) için örnekleme çözünürlüğü × kova
genişliği ızgarası tarandı: **hiçbir kombinasyon 12/14'ü geçmiyor**, yalnızca
hangi ikisinin kaçtığı değişiyor. Bu iki sabitle ulaşılabilir değiller — hâlâ
gerçek bir maske ya da modelin kırpımı okuması gerekiyor.

## Kutu doğruluğu — hiç sorulmamış soru

Boru hattındaki her aşama Vision'ın dikdörtgeninin **giysinin üzerinde** olduğunu
varsayıyor: renk onun içinde ölçülüyor, modele giden kırpım ondan kesiliyor,
görsel betimleyici onu ürün fotoğrafıyla karşılaştırıyor. Kutu üçte bir kaymışsa
bunların hepsi yanlış pikselleri çok hassas biçimde ölçüyor — ve mevcut hiçbir
metrik bunu fark etmiyordu. "Hotspot sayısı" yalnızca *kaç tane* diye soruyordu.

Eşleştirme **bire-bir** (`eval/boxMatch.ts`). Her referans parçaya bağımsız olarak
"en çok örtüşen tespit hangisi" diye sormak, tek bir dev "Clothing" kutusunun
ceketi, üstü ve pantolonu aynı anda bulmuş sayılmasına izin verir — tek bir şey
bulmuş bir dedektör için kusursuz bulma oranı raporlar.

Medyan yanında **eşik üstü oranı** da raporlanıyor, çünkü 0.05 ile 0.95 aynı
ortalamayı iki 0.5 ile paylaşır ve bunlar aynı dedektör değildir.

Taban **henüz yok**: bu hiç ölçülmedi, o yüzden buraya konacak her sayı kapı
kılığında bir tahmin olurdu. İlk gerçek kayıttan sonra, o çalıştırmanın bastığı
değerin biraz altına konmalı.

## NMS sabitlerinin taranması

`dedupeDetections`'ın dört sayısı — güven tabanı, IoU eşiği, içerme eşiği, birleşme
boşluğu — hepsi bir ekran görüntüsüne bakılıp seçildi. `npm run eval:sweep` ızgarayı
kaydedilmiş yanıtlara karşı puanlıyor ve **mevcut değerlerin sıralamada nerede
durduğunu** söylüyor; yalnızca bir maksimum veren tablo, kıpırdamanın değip
değmeyeceğini söylemez.

Tarama `eval/replay.ts` üzerinden koşuyor — eval'in kullandığı modülün aynısı.
Yayına çıkandan biraz farklı bir filtreyi optimize eden bir tarama, hiç taramamaktan
kötüdür: kimsenin koşmadığı kod için otoriter sayılar üretir.

Küçük bir farkı kovalamak dört fotoğrafa aşırı uydurmaktır. Bu tablo, set büyüdükten
sonra anlam kazanır.

## Renk ailesi mantığı nerede yaşıyor

`colorBucketOf` artık burada değil: `src/lib/colorFamily.ts`'ye taşındı, çünkü
canlı ürün aşaması da aynı cevaba ihtiyaç duyuyor — bir mağaza başlığındaki renk
kelimesinin ölçülen renkle çelişip çelişmediğini bilmesi gerekiyor. Eval'in iki
kez düzelttiği bir kuralın iki kopyası zamanla ayrışırdı. `eval/colorBucket.ts`
artık yalnızca yeniden ihraç ediyor.

Çelişki kuralı **kasten cimri**: gerçek, stokta bir ürünü birebir eşleşme
yuvasından düşürüyor, o yüzden yanlış bir çelişki alışveriş yapana sayfadaki en
iyi satıra mal oluyor. Uyumlu çiftler tek tek sayılmış (lacivert/siyah,
krem/beyaz, camel/bej…) ve **gri tamamen muaf** — ölçüm hatasının düştüğü yer o:
bu sette yıkanmış indigo jean `#596564`, siyah sandalet `#4e5857` ölçülüyor,
ikisi de gri.

## Görsel betimleyici — ne ölçüyor, ne ölçmüyor

Erişim testi elimizdeki gerçek görsellerden kuruluyor: her etiketli bölge iki kez
kırpılıyor (sıkı ve gevşek pay), gevşek olan **aynalanıp pozlaması değiştiriliyor**,
sonra her sıkı kırpımın en yakın komşusunun 14 aday arasında kendi eşi olması
bekleniyor. Şans %7.

Aynalama ve pozlama şart: onlar olmadan iki kırpım piksellerinin çoğunu paylaşıyor
ve skor gereksiz yere %100 çıkıyor — bozuk bir betimleyicinin içinden yeşil
görünmeye devam edecek bir sayı. İkisi betimleyicinin iki yarısını farklı vuruyor:
histogram aynalamaya tam bağışık, fark hash'i değil; hash pozlamaya dayanıklı,
histogram daha az.

**Bu test işin kendisinden kolay.** İki kırpım da aynı fotoğraftan, aynı ışıkta.
Yani %86, gerçek stüdyo ürün fotoğraflarına karşı %86 anlamına gelmez. Değeri
regresyon yakalamak.

Kalan iki sapma betimleyicinin gerçek sınırı: `bk-body` (siyah body) aynı
fotoğraftaki `bk-jeans`'e (koyu denim) yeniliyor, `bk-sunglasses` — çoğu yüz olan
bir kırpım — `lc-coat`'a yeniliyor. Renk histogramı + 64 bit yapının bunları
ayıracak bilgisi yok; ayırmak için anlam gerekiyor, yani öğrenilmiş bir embedding.

Kırpımlar boru hattıyla aynı şekilde **maskeleniyor**: komşu parçaların kutuları
histogramdan çıkarılıyor. Bu ölçülmüş bir gerek, süs değil — maskesiz hâlde
referans fotoğraftaki şort kırpımı %69 pembe triko oluyor ve şort, pembe hırkaya
siyah sneaker'dan daha yakın ölçülüyor (0.559 vs 0.353). Maskelemeyle pembe çekimi
0.066'ya düşüyor ve sıralama düzeliyor.

## VLM öznitelik aşaması — durum

Aşamanın kendisi yazıldı (`src/services/attributeExtractor.ts`) ve boru hattına
bağlandı; yerel bir stub'a karşı 58 kontrolle doğrulandı: kırpma, şema
doğrulaması, etiket/renk/sorgu/aile birleştirmesi ve her başarısızlık modunun
(bozuk JSON, ret, HTTP 500, süre aşımı, şemaya uyan ama kullanılamaz içerik)
ölçülen renge geri düşmesi.

**Ölçüm altyapısı yazıldı; doğruluk kazancının kendisi hâlâ ölçülmedi.** Bunun
için gerçek bir model çağrısı gerekiyor:

```bash
ANTHROPIC_API_KEY=... npm run eval:record-attrs
ANTHROPIC_API_KEY=... npm run eval:record-attrs -- --repeat 3   # kararlılık da ölçülsün
npm run eval
```

Bu, `eval/fixtures/attrs/` altına yanıtları yazar ve eval bundan sonra dört
soruyu birden cevaplar:

- **renk** — model rengi, aynı parçalarda ölçülen rengi geçiyor mu,
- **sorgu** — modelin gördüklerinden kurulan tam arama dizesi, Vision'ın
  sınıfından kurulanı geçiyor mu (çağrının parası bunun için ödeniyor),
- **zor parçalar** — aşamanın eklenme gerekçesi olan dört parçanın kaçı
  kurtarıldı; dörtte üçün altı kırmızı,
- **öne sürülen öznitelikler** — malzeme ve desen, doğru / çekimser / uydurma.

Ölçümün kendisi 51 birim kontrolü ve `npm run eval`'e karşı 51 uçtan uca
kontrolle doğrulandı: kusursuz model, ölçümden kötü model, sorguyu bozan model,
uyduran model, çekimser model, reddeden model, kararsız model, kısmi kayıt ve
eski fixture biçimi. Bu kontroller **sentetik** kayıtlarla yapıldı — ölçümün
çalıştığını kanıtlar, gerçek modelin ne yaptığı hakkında hiçbir şey söylemez.
Gerçek kayıt sanılmasınlar diye commit edilmediler.

Yukarıdaki dört sapmanın gerçekten kapandığını gösterecek olan yalnızca
anahtarlı çalıştırma; o rakam gelene kadar bu aşamanın kazandığı tek şey
doğrulanmış bir boru hattı ve onu yargılayacak bir terazidir.
