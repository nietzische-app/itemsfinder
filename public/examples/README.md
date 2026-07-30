# Demo görselleri

## Model fotoğrafları (`look-*.jpg`)

Ana sayfadaki canlı tarama gösterimi (`src/components/LiveScanPreview.tsx`) dört
kombin arasında geçiş yapar. Her biri `src/lib/showcase.ts` içindeki
`SHOWCASE_LOOKS` kaydına bağlıdır:

| Dosya | Kombin | Parça | Oran | Fotoğraf |
| --- | --- | --- | --- | --- |
| `look-pink-knit.jpg` | Pembe Triko | 3 | 1100×1649 | Vivek / Unsplash |
| `look-biker.jpg` | Deri Ceket | 4 | 1100×1656 | Maks Styazhkin / Unsplash |
| `look-longcoat.jpg` | Uzun Kaban | 4 | 1100×1375 | Behrooz / Unsplash |
| `look-blazer.jpg` | Oversize Blazer | 3 | 1100×1375 | Zaven Baghdasaryan / Unsplash |

Yüklenen orijinaller 2.9–10.2 MB arasındaydı; toplam 22 MB. Tarayıcı canvas'ı
ile en 1100 pikselde JPEG q0.82'ye indirildiler — toplam **638 KB**. Hero
görselinin ilk yükleme süresine doğrudan etkisi olduğu için orijinal boyutlarıyla
yayınlanmaları uygun değildi. Kaynak dosyalar git geçmişinde (commit `3aa26e8`)
duruyor.

### Fotoğraf değiştirirken

1. **Oranı bozma.** `SHOWCASE_LOOKS[].width/height` çerçevenin en-boy oranını
   birebir belirler. Farklı oranlı bir dosya koyup bu sayıları güncellemezsen
   `object-cover` kırpma yapar ve **her hotspot kıyafetinden kayar.**
2. **Kutuları yeniden ölç.** Koordinatlar `0..1` aralığında, sol-üst köşe
   referanslı ve **o fotoğrafa özeldir.** Ölçüm için dosyayı bilinen bir
   genişliğe (örn. 600 piksel) indirip piksel değerlerini genişliğe/yüksekliğe
   bölmek yeterli.
3. **Tek yerde düzelt.** `mockCatalog.ts` kutuları `showcaseBox()` ile buradan
   okur; senaryoya elle kopyalamak gerekmez, kopyalanmamalı da.
4. **Telif.** Unsplash lisansı ticari kullanıma izin verir ve atıf zorunlu
   değildir; yine de `credit` alanında fotoğrafçı adı tutuluyor ve gösterimde
   görünüyor. Farklı bir kaynak kullanacaksan yayın hakkının olduğundan emin ol.

## `showcase-fallback.svg`

Bir `look-*.jpg` dosyası eksik ya da bozuk olursa devreye giren yer tutucu
plaka. Hero alanında hiçbir zaman kırık görsel çıkmaması için var; normal
çalışmada görünmez.

## `streetwear.svg`, `glam-makeup.svg`, `tailoring.svg`, `soft-minimal.svg`

`src/services/mockCatalog.ts` içindeki eski demo senaryolarının fikstürleri.
Bunların bounding box'ları bu dosyalara elle ayarlandı; birini değiştirirsen
ilgili senaryonun kutularını yeniden kontrol et. Ana sayfada gösterilmiyorlar —
`/analyze` akışına `exampleId` ile girildiğinde kullanılırlar.
