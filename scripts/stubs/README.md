# Kayıt betiklerini anahtarsız sürmek

`eval:record` ve `eval:record-attrs` gerçek API çağrısı yapıyor, yani ikisini de
denemenin tek yolu bir anahtar harcamaktı. Anahtar genelde tek bir oturumda
elinizde oluyor; o oturumda betiğin doksanıncı satırında çökmesini öğrenmek pahalı
bir öğrenme yolu.

Buradaki iki sunucu API'lerin **şeklini** taklit ediyor. Amaçları tek: betiğin
baştan sona çalıştığını, dosyayı yazdığını ve `npm run eval`'in yazılanı
oynatabildiğini göstermek.

```bash
node scripts/stubs/vision.mjs 4711 &
VISION_BASE_URL=http://127.0.0.1:4711 \
GOOGLE_CLOUD_VISION_API_KEY=stub npm run eval:record

node scripts/stubs/anthropic.mjs 4712 &
VLM_BASE_URL=http://127.0.0.1:4712 \
ANTHROPIC_API_KEY=stub npm run eval:record-attrs -- --repeat 2

npm run eval          # her metrik hesaplanıyor mu?
rm -rf eval/fixtures  # ve sonra mutlaka sil
```

## Canlı ürün yolu

Aynı sorun, aynı çözüm: canlı yol (`ENABLE_CONTEXT_DEV_LIVE`) bugüne kadar hiç
çalıştırılmadı, çünkü çalıştırmanın tek yolu Context.dev anahtarı harcamaktı.

```bash
node scripts/stubs/context.mjs 4731 &
CONTEXT_DEV_API_KEY=stub \
ENABLE_CONTEXT_DEV_LIVE=true \
CONTEXT_DEV_BASE_URL=http://127.0.0.1:4731 \
npm start
```

Bir kez sürüldü ve yol baştan sona çalışıyor:

- `web.search`, **Türkçe** sorgu ve Türkiye mağazalarıyla çağrılıyor (iki katmanlı
  aramanın birinci katmanı), ardından aday başına `web.extract`.
- Motor rozeti «Canlı Motor · 3 parçanın 2 tanesi canlı» oluyor.
- Canlı satırı olan ürünlerde gerçek fiyat görünüyor; olmayanlar kataloğa düşüyor
  ve `priceIsShowable` uydurma fiyatı gizli tutuyor. Yani canlı yol açıldığında
  «Fiyat mağazada» kendiliğinden kalkıyor, geri alınacak bir şey yok.
- Bayrak kapalıyken stub'a tek istek gitmiyor.

Bu sürüş bir hata da buldu: SDK cevabı `response.data.products` okuyor, sarmalayıcı
bir `results` alanı değil. Yanlış şekildeki bir cevap sessizce «canlı satır
bulunamadı» olarak kataloğa düşüyordu — gerçek anahtarla ilk denemede bunun
teşhisi çok daha pahalı olurdu.

## Sonuna kadar okunması gereken kısım

**Bunlarla üretilen fixture'lar ölçüm değildir ve commit edilmemelidir.** Vision
sunucusu her fotoğrafa aynı üç kutuyu, Anthropic sunucusu her kırpıma aynı
öznitelikleri döndürüyor. Ortaya çıkan yüzdeler bu dosyaların içeriğini ölçer,
boru hattını değil. Gerçek bir kayıtla karıştırılabilecek hiçbir dosya
`eval/fixtures/` altında kalmamalı — son satır bu yüzden var.

Anthropic sunucusu her yedinci çağrıda reddediyor, her on birinci çağrıda
`visible: false` diyor. İkisi de gerçek bir modelin verdiği ve okuyucuda yanlış
ele alınması kolay cevaplar: ikisi de "betimlenmedi" olarak dönmeli, içi çöp dolu
bir "betimlendi" olarak değil.
