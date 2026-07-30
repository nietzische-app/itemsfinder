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
| Aile tutarlılığı | Sınıflandırıcının kataloğu kendi içinde tutarlı etiketlemesi | %90 |
| Hotspot sayısı | Temizlenmiş tespit sayısının beklenene ±1 yakınlığı (fixture ister) | %75 |

VLM renginin tabanı **göreli**: hiç ölçülmemiş bir aşamaya mutlak bir sayı
koymak ya kalıcı kırmızı ya da bedava yeşil olurdu. Tartışılmaz olan yön:
boru hattı modelin rengini ölçülen renge **tercih ediyor**, dolayısıyla model
rengi aynı parçalarda ölçülenden kötüyse bu tercih yanlıştır ve eval kırmızıya
düşer. Karşılaştırma yalnızca fixture'ı olan parçalar üzerinde yapılıyor —
14 parçalık skoru 4 parçalık skorla kıyaslamak iki farklı soruyu kıyaslamak
olurdu.

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
