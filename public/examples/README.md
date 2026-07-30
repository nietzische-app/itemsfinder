# Demo görselleri

## `pink-outfit.jpg` — ana sahne görseli (eklenmesi gerekiyor)

Ana sayfadaki canlı tarama gösterimi (`src/components/LiveScanPreview.tsx`) bu
dosyayı arar:

```
public/examples/pink-outfit.jpg
```

Dosya burada olduğu anda gösterim onu kullanmaya başlar — **kod değişikliği
gerekmez.** Dosya yokken `showcase-fallback.svg` devreye girer, böylece hero
alanında hiçbir zaman kırık görsel çıkmaz.

### Gereksinimler

| Özellik | Değer | Neden |
| --- | --- | --- |
| En/boy oranı | **2:3 dikey** (örn. 1333×2000) | Kutu koordinatları görselin tamamına göre normalize edilmiştir; farklı oran kırpma yapar ve noktalar kıyafetten kayar. |
| Format | JPG | `.jpg` uzantısı `SHOWCASE_IMAGE.src` içinde sabit. |
| Boyut | ~300–600 KB | Hero görseli, ilk yükleme süresine doğrudan etki eder. |
| İçerik | Tek model, tam boy, üst + alt + ayakkabı görünür | Üç tespit bölgesi bu üç parçaya göre ayarlandı. |

### Tespit kutuları

Koordinatlar `src/lib/showcase.ts` içindeki `SHOWCASE_ITEMS[].box` alanında,
`0..1` aralığında ve sol-üst köşe referanslı:

| Parça | x | y | genişlik | yükseklik |
| --- | --- | --- | --- | --- |
| Pembe triko ceket | 0.355 | 0.300 | 0.250 | 0.270 |
| Siyah deri şort | 0.360 | 0.495 | 0.235 | 0.100 |
| Bilekli sneaker | 0.372 | 0.785 | 0.240 | 0.120 |

Bu değerler referans fotoğrafa **gözle** kalibre edildi; dosyayı ekledikten
sonra noktaların kıyafetlerin üzerine oturduğunu bir kez kontrol et ve gerekirse
±0.02 aralığında düzelt. Farklı bir fotoğraf kullanacaksan kutuları o
fotoğrafa göre yeniden ölçmek gerekir.

### Telif

Kullanılacak fotoğrafın yayın hakkına sahip olunmalı: kendi çekimi, satın
alınmış bir stok görsel ya da ticari kullanıma açık bir lisans (Unsplash /
Pexels lisansı gibi). Hakkı belirsiz bir görsel hero alanına konmamalı.

## `streetwear.svg`, `glam-makeup.svg`, `tailoring.svg`, `soft-minimal.svg`

`src/services/mockCatalog.ts` içindeki demo senaryolarının fikstürleri. Bunların
bounding box'ları bu dosyalara elle ayarlandı; birini değiştirirsen ilgili
senaryonun kutularını yeniden kontrol et. Ana sayfada artık gösterilmiyorlar —
`/analyze` akışına `exampleId` ile girildiğinde kullanılırlar.
