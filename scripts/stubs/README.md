# Anahtarsız sürülen yollar

```bash
npm run check:stubs   # beş süitin hepsi, saniyeler sürer
```

Buradaki süitler `npm run eval`'in ölçemediğini ölçüyor: eval **veriye** bakıyor
(renk doğru mu, kapsam tam mı), bunlar **karara** bakıyor — canlı yol kataloğu
ezerse, tükenmiş ürün başrole geçerse, bir puan ölçeksiz gelirse ne oluyor.

## Kayıt betiklerini anahtarsız sürmek

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

## Dedektör kesintisi

Vision çöktüğünde uygulamanın **hata vermek yerine kataloğa düşmesi** tasarımın en
kritik davranışlarından biri, ve sürmenin tek yolu gerçek bir kesinti beklemekti.

```bash
FAIL=1 node scripts/stubs/vision.mjs 4751 &
GOOGLE_CLOUD_VISION_API_KEY=stub \
VISION_BASE_URL=http://127.0.0.1:4751 npm start
```

Ölçüldü: Vision her isteğe 500 dönerken tarama tamamlanıyor, kullanıcı **hata
ekranı değil üç ürün** görüyor, motor rozeti dürüstçe «Demo Modu (Örnek Veri)»
diyor, ve iz kaydı `source: mock-fallback` ile birlikte düşme sebebini yazıyor.

Yani bir Google kesintisi kullanıcı için «bulunamadı» değil, «canlı yerine örnek
veri» anlamına geliyor.

## Mağaza puanı

```bash
node scripts/stubs/rating-check.mjs
```

Puan sayfadan çıkarılan bir sayı ve mağazalar aynı ölçeği kullanmıyor — bazıları
on üzerinden yazıyor. 8,4'ü beşe kırpmak «çok beğenilmiş» bir ürünü «mükemmel»
gibi gösterirdi, o yüzden ölçeği bilinmeyen bir puan düzeltilmiyor, **atılıyor**.

Dokuz sınır vakası: normal puan, ondalık yuvarlama, puan yok, on üzerinden, sıfır,
negatif, tam sınır 5, adetsiz puan, puansız adet. Bu dosya bir kez gerçek bir hata
yakaladı — puan atıldığında değerlendirme adedi hayatta kalıyordu, yani kart
puansız bir «1.240 değerlendirme» gösterebiliyordu.

## Arama merdiveni

```bash
node scripts/stubs/search-ladder-check.mjs
```

Canlı arama tek bir sorgu deniyordu: renk + malzeme + desen + ürün adı. Bir
mağazada o kombinasyonun tam karşılığı yoksa sonuç sıfır oluyordu — «beyaz keten
oversize gömlek» boş ekran veriyordu, oysa aynı mağazada onlarca gömlek var.

Sekiz vaka: tam sorgu doluysa tek arama yapılıyor, boşsa gevşek basamak
deneniyor, Türkiye hiç bulamazsa global katmana geçiliyor, arama sınırı (3)
korunuyor, ve **Türkiye'deki gevşek sonuç globaldeki tam sonucu yeniyor** —
gümrük ve kargo farkı ürün farkından büyük.

`scripts/stubs/context.mjs` de bunu sürülebilir kılıyor: ikiden fazla kelimeli
sorgulara hiç sonuç dönmüyor, yani uygulamayı çalıştırdığında gevşemenin
gerçekten devreye girdiğini stub loglarından görebiliyorsun.

## Ölü bağlantılar (404)

```bash
node scripts/stubs/store.mjs 4741 &
LINK_CHECK_BASE_URL=http://127.0.0.1:4741 npm run check:links

node scripts/stubs/link-check.mjs   # karar sınırları
```

`check:pdp` adresin **şeklini** doğruluyor; şekli doğru bir adres 404 dönebilir ve
zamanla döner de — mağazalar ürünü kaldırıyor, koleksiyon değiştiriyor, URL
döndürüyor. `check:links` sayfayı gerçekten açmaya çalışıyor.

404'ü yakalamak kolay olanı. Zor olan, mağazaların ölü bağlantı verme
biçimlerinin hepsinin 404 olmaması:

- **Ana sayfaya yönlendirme** — istek 200 dönüyor, kullanıcı ürünü göremiyor.
  Sessiz olduğu için en tehlikelisi; yolun kısalmasından anlaşılıyor.
- **HEAD'e 405** — sayfa duruyor, sadece HEAD desteklenmiyor. Ölü sanılmamalı.
- **Bot duvarı (403)** — yine ölü değil, sadece bize kapalı.

Altı vaka bunları ölçüyor, ulaşılamayan sunucu dahil.

Betik hiçbir şeyi otomatik silmiyor: ölü bir bağlantıyı dosyadan çıkarmak bir
karar, ve geçici bir stok kesintisi adresin yanlış olduğu anlamına gelmiyor.

## Canlı yol kataloğu kötüleştirebiliyor mu

```bash
node scripts/stubs/no-downgrade-check.mjs
```

Kural: canlı veri açıldığında hiçbir kullanıcı, kapalıyken sahip olduğu bir şeyi
kaybetmemeli. En somut hâli bağlantı.

Bir kez gerçek bir kusur yakaladı: çıkarım ürün sayfası adresi bulamadığında
canlı satır `productUrl: ""` ile geliyordu, yine de "en iyi" seçilebiliyordu ve
katalogdaki **doğrulanmış bağlantılı** satırın yerine geçiyordu. Yani canlı yolu
açtığın anda çalışan bir «Ürüne git» kaybolabiliyordu — canlı verinin katalogdan
kötü bir sonuç üretebildiği tek yer. Bağlantısız canlı satırlar artık yarışmaya
hiç girmiyor.

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
