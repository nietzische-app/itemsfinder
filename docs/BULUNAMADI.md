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

**Kapsam ölçüye bağlandı** — `eval/coverageCases.ts`, sıradan ürün adları. Her
biri en az bir ürün döndürmeli. Şu an **56/56 (%100)**, taban %100. Kaçanlar her
çalıştırmada isimleriyle basılıyor.

**Arayüz dürüstleştirildi** — hiç ürün yokken artık olmayan bir listeyi işaret
etmiyor; ne tanındığını söylüyor ve kullanıcının kendi aratabileceği tarifi
gösteriyor. Mağaza arama bağlantısı **verilmiyor**, çünkü arama adresleri CTA
olarak yasaklı (`src/lib/productUrl.ts`) ve bu kural burada da geçerli.

## Sırada — etkiye göre

### 1. `dress` ailesine katalog satırları — ✅ kapandı

Elbise, tulum, mayo ve bikini boşluğu kapandı: `mockCatalog.ts` içinde elbise
senaryosu var ve kapsam %92'den %100'e çıktı.

### 2. Yeni aileler: oje, parfüm, iç giyim — ✅ kapandı

Üçü de `ItemFamily` olarak eklendi **ve** her birinin katalog satırı var; kelimeyi
boş bir aileye yönlendirmek olmadı. `eval/coverageCases.ts` içindeki `KNOWN_GAPS`
artık boş — sayılmadan kayıtta tutulan bir boşluk kalmadı.

### 3. Canlı yolu açmak → asıl çözüm

Katalog bir demo; kapsamı elle büyüttüğümüz sürece her yeni ürün türü yeni bir
boşluk. Canlı yol (`ENABLE_CONTEXT_DEV_LIVE`) açıldığında ürünler gerçek
mağazalardan geliyor ve kapsam sorusu katalogdan çıkıp aramaya geçiyor.

Kod hazır ve sahte bir sunucuya karşı baştan sona sürüldü
(`scripts/stubs/README.md`). Açmak için Context.dev anahtarı yeterli.

**Ama canlı yol da boş dönebilir**, ve o yüzden aşağıdaki iki madde onunla
birlikte anlam kazanıyor.

### 4. Canlı arama boş dönerse: sorguyu gevşetmek — ✅ yazıldı ve ölçüye bağlandı

Merdiven yazıldı (`relaxedQueries`): önce tam sorgu, sonra renk + ürün adı, sonra
yalnız ürün adı; ve her basamak iki mağaza katmanında deneniyor (önce Türkiye,
sonra global). Sıra kasıtlı — önce katman, sonra basamak.

**Ve harcadığı kredi artık görünüyor.** Bu belge «hangi kademede kaç sonuç geldiği
ve kaç kredi harcandığı ölçülmeden açılmamalı» diyordu; ölçüm yoktu, şimdi var:
her arama `ScanTrace.searches` içine «katman, basamak, kaç **yeni** aday» olarak
yazılıyor, teşhis panelinde «Canlı aramalar (n)» başlığı altında satır satır
görünüyor, ve `[scan]` log satırında `searchCount` + `searchYield` olarak
greplenebiliyor. `tr:0=0,tr:1=3` okunuşu şu: tam sorgu boş döndü, parayı gevşeme
kurtardı.

Sahte sunucuya karşı ilk sürüşün söylediği (yalnızca stub hakkında bir gözlem,
üretim hakkında değil): üç parçada sekiz arama harcandı, basamak 0 hiç aday
getirmedi, gelen her aday basamak 1 ve 2'den geldi.

**Bu sürüş bir kusur da buldu** ve kusur stub'a ait değildi: `buildSearchQuery`
ürün adına yer ayırıyordu ama ayırma `seen` kümesini paylaştığı için ad daha önce
geçmişse hiç ayrılmıyordu. Sonuç, kodun kendi yorumunun «engellendi» dediği şeydi:

```
etiket «Yüksek yakalı ince örgü pastel pembe triko ceket», ürün adı «Ceket»
→ «Pudra Pembe Yüksek yakalı ince örgü»        — içinde ürün yok
```

Böyle bir sorgunun döndürdüğü her satır zaten yanlış. Ad artık **yalnızca
kesilecekse** sona taşınıyor, ve `eval/searchQueryCases.ts` ile yeni bir eval
kapısı (**Sorguda ürün adı**, taban %100) bunu her basamakta ölçüyor.

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

`npm run eval` içinde iki satır:

- **Ürün kapsamı** — sıradan bir parça boş ekran görüyor mu. Taban %100, ölçülen
  %100 (56/56). Kaçan her parça adıyla basılıyor, yani bir sonraki kişi hangi ürün
  türünün boş döndüğünü okumak için kod okumak zorunda kalmıyor.
- **Sorguda ürün adı** — merdivenin her basamağında aranan ürün sorgunun içinde
  mi. Taban %100, ölçülen %100 (170/170). Kapsam «katalogda karşılığı var mı»yı
  ölçüyor; bu satır «doğru şeyi mi arıyoruz»u.

Vaka eklemek: `eval/coverageCases.ts` içine ürün adı yaz. Yeni bir ürün türü
desteklenmeye başladığında oraya bir satır eklemek, desteğin geri gitmemesini
sağlıyor.
