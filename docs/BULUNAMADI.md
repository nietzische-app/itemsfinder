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

**Kapsam ölçüye bağlandı** — `eval/coverageCases.ts`, 51 sıradan ürün adı. Her
biri en az bir ürün döndürmeli. Şu an **47/51 (%92)**, taban %90. Kaçanlar her
çalıştırmada isimleriyle basılıyor.

**Arayüz dürüstleştirildi** — hiç ürün yokken artık olmayan bir listeyi işaret
etmiyor; ne tanındığını söylüyor ve kullanıcının kendi aratabileceği tarifi
gösteriyor. Mağaza arama bağlantısı **verilmiyor**, çünkü arama adresleri CTA
olarak yasaklı (`src/lib/productUrl.ts`) ve bu kural burada da geçerli.

## Sırada — etkiye göre

### 1. `dress` ailesine katalog satırları  → kapsam %92'den %100'e

Kalan dört boşluğun tamamı bu: elbise, tulum, mayo, bikini. Katalogda bu ailede
tek satır yok, yani tespit doğru çalışsa bile gösterilecek ürün bulunmuyor.

Elbise, görsel moda aramasının en sık parçalarından biri — bu boşluk kapanmadan
"her parça bir şey bulur" denemez. İş: `mockCatalog.ts`'e bir elbise senaryosu,
ve tercihen `VERIFIED_PDP_URLS`'e birer gerçek bağlantı.

### 2. Yeni aileler: oje, parfüm, iç giyim

Bunlar sözlüğe kelime eklemekle çözülmüyor — her biri yeni bir `ItemFamily`
**ve** o ailede katalog satırı istiyor. Kelimeyi eklemek, boş bir aileye
yönlendirmekten başka bir şey yapmaz. `eval/coverageCases.ts` içindeki
`KNOWN_GAPS` bunları sayılmadan kayıtta tutuyor.

### 3. Canlı yolu açmak → asıl çözüm

Katalog bir demo; kapsamı elle büyüttüğümüz sürece her yeni ürün türü yeni bir
boşluk. Canlı yol (`ENABLE_CONTEXT_DEV_LIVE`) açıldığında ürünler gerçek
mağazalardan geliyor ve kapsam sorusu katalogdan çıkıp aramaya geçiyor.

Kod hazır ve sahte bir sunucuya karşı baştan sona sürüldü
(`scripts/stubs/README.md`). Açmak için Context.dev anahtarı yeterli.

**Ama canlı yol da boş dönebilir**, ve o yüzden aşağıdaki iki madde onunla
birlikte anlam kazanıyor.

### 4. Canlı arama boş dönerse: sorguyu gevşetmek

Bugün canlı arama tek bir sorgu deniyor: renk + malzeme + desen + ürün adı. Bir
mağaza o kombinasyonu bulamazsa sonuç sıfır. Kademeli gevşetme — önce tam sorgu,
sonra renk + ürün adı, sonra yalnız ürün adı — bir «beyaz keten oversize gömlek»
bulunamadığında hiç değilse «gömlek» bulur.

Bu, ürün başına ekstra arama demek, yani ölçülmeden açılmamalı: hangi kademede
kaç sonuç geldiği ve kaç kredi harcandığı, anahtar takıldıktan sonraki ilk işlerden
biri olmalı.

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

`npm run eval` içinde **Ürün kapsamı** satırı. Taban 0.9, hedef 1.0. Kaçan her
parça adıyla basılıyor, yani bir sonraki kişi hangi ürün türünün boş döndüğünü
okumak için kod okumak zorunda kalmıyor.

Vaka eklemek: `eval/coverageCases.ts` içine ürün adı yaz. Yeni bir ürün türü
desteklenmeye başladığında oraya bir satır eklemek, desteğin geri gitmemesini
sağlıyor.
