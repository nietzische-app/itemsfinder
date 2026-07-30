# Tespit doğruluğu değerlendirmesi

```bash
npm run eval                 # renk, sorgu, aile — anahtar gerekmez
npm run eval -- --verbose    # parça parça detay
npm run eval:record          # gerçek Vision yanıtlarını kaydet (anahtar ister)
npm run eval:record-attrs    # gerçek VLM özniteliklerini kaydet (anahtar ister)
```

Çıkış kodu, metriklerden biri tabanın altına düştüğünde sıfırdan farklı olur —
yani bir değişikliği tip denetleyicisi gibi kapıda tutabilir.

## Neden var

Bundan önceki her "iyileştirme" tek bir ekran görüntüsüne bakılarak
değerlendirildi. Global baskın rengin siyah şortu "pudra" diye etiketlemesi
tam bu yüzden uzun süre ayakta kaldı. Buradaki sayıların değeri mutlak
büyüklükleri değil, boru hattı değiştiğinde **hangi yöne gittikleri**.

## Kapsam — dürüst hâli

**Dört fotoğraf, on dört parça.** Bu bir kıyaslama seti değil, duman testi.
Kutular `SHOWCASE_LOOKS`'tan, etiketler `MOCK_SCENARIOS`'tan geliyor; ikisi de
elle ölçülmüş referans. Burada gerçekten yeni olan etiketler her parçanın
beklenen **renk ailesi** ve üretilen sorguda görülmesi gereken **Türkçe
token**.

Vaka eklemek: fotoğrafı `public/examples/`'a koy, ölçülmüş kutularla bir
`SHOWCASE_LOOKS` kaydı ve eşleşen bir senaryo ekle, sonra `groundTruth.ts`
içindeki `EXPECTATIONS`'a parça beklentilerini yaz. `npm run eval` otomatik
alır.

## Metrikler

| Metrik | Ne ölçüyor | Taban |
| --- | --- | --- |
| Bölge rengi | Ölçülen baskın rengin, insanın adlandıracağı renk ailesiyle eşleşmesi | %70 |
| VLM rengi | Kırpıma bakan modelin verdiği rengin aynı eşleşmeyi tutması (fixture ister) | aynı parçalarda ölçülen renk |
| VLM ürün adı | Modelin verdiği Türkçe ürün adının beklenen token'ı taşıması (fixture ister) | — |
| Sorgu token'ı | Üretilen aramanın, parçayı bulmaya yetecek Türkçe kelimeyi taşıması | %90 |
| Vision sınıfı | **Yalnızca** Vision'ın İngilizce sınıfından üretilen sorgunun Türkçe terimi taşıması ve İngilizce kelime bırakmaması | %100 |
| Görsel erişim | Bir parçanın sıkı kırpımının, 14 gevşek kırpım arasından kendi eşini bulması | %70 (şans %7) |
| Aile tutarlılığı | Sınıflandırıcının kataloğu kendi içinde tutarlı etiketlemesi | %90 |
| Hotspot sayısı | Temizlenmiş tespit sayısının beklenene ±1 yakınlığı (fixture ister) | %75 |

VLM renginin tabanı **göreli**: hiç ölçülmemiş bir aşamaya mutlak bir sayı
koymak ya kalıcı kırmızı ya da bedava yeşil olurdu. Tartışılmaz olan yön:
boru hattı modelin rengini ölçülen renge **tercih ediyor**, dolayısıyla model
rengi aynı parçalarda ölçülenden kötüyse bu tercih yanlıştır ve eval kırmızıya
düşer. Karşılaştırma yalnızca fixture'ı olan parçalar üzerinde yapılıyor —
14 parçalık skoru 4 parçalık skorla kıyaslamak iki farklı soruyu kıyaslamak
olurdu.

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
  Bölge rengi      71%  (10/14)
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

**Doğruluk kazancı henüz ölçülmedi.** Bunun için gerçek bir model çağrısı
gerekiyor:

```bash
ANTHROPIC_API_KEY=... npm run eval:record-attrs
npm run eval
```

Bu, `eval/fixtures/attrs/` altına yanıtları yazar ve eval bundan sonra "VLM
rengi" ile "VLM ürün adı" satırlarını da raporlar. Yukarıdaki dört sapmanın
gerçekten kapandığını gösterecek olan o çalıştırma; o rakam gelene kadar bu
aşamanın kazandığı tek şey doğrulanmış bir boru hattıdır.
