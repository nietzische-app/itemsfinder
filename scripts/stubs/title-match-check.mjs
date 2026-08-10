/**
 * Beklenti başlıkla aynı dilde mi? — `node scripts/stubs/title-match-check.mjs`
 *
 * ## Neden var
 *
 * Canlı yol ilk kez gerçek satır getirdiğinde ikisi de doğru aileden geldi ve
 * ikisi de tam olarak `BASE` puanı aldı — yani hiçbir kanıt bileşeni tutmadı,
 * ürün adı dahil:
 *
 *   «Jeans» ← "Regular Fit Pamuklu Normal Bel Tapered Jean Pantolon"  %35
 *   «Top»   ← "Uzun Kollu Volanlı Kareli Bağlama Detaylı V Yaka Bluz" %35
 *
 * Sebep: `itemType` detektörün sınıfı ve **İngilizce** (`Jeans`, `Top`), mağaza
 * başlıkları ise Türkçe. `hasStem` ön ek karşılaştırıyor ve «jean» kelimesi
 * «jeans» ile başlamıyor. Sorgu zaten Türkçeye çevriliyordu, yani Türkçe arayıp
 * İngilizce puanlıyorduk.
 *
 * `npm run eval` bunu yakalamadı ve yakalayamazdı: ölçüm kümesindeki parçaların
 * `itemType`'ı zaten Türkçe. Kusur yalnızca **Vision sınıfı taşıyan** parçalarda
 * çıkıyor, ve canlı yol açılana kadar hiç puanlanmamışlardı.
 */
import { register } from "node:module";

register(new URL("../alias-loader.mjs", import.meta.url).href);
const { EXACT_MATCH_FLOOR, expectedAttributesOf, scoreTitleAgreement } = await import(
  "@/lib/attributeMatch"
);

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

const score = (item, title) => scoreTitleAgreement(title, expectedAttributesOf(item));

/*
 * 1) Üretimden gelen iki gerçek vaka.
 *
 * Beklenen puan tam olarak taban: doğru ürün adı tutuyor, başlıkta renk yazmıyor
 * (yani çelişki de yok), başka kanıt yok. Bu, «doğru cinste ürün, çelişen bir
 * şey yok» durumunun puanı — ve birebir eşleşme yuvasını tutmaya yetiyor.
 */
{
  const jean = score(
    { itemType: "Jeans", label: "Antrasit jean", colorHex: "#3a3a3a" },
    "Regular Fit Pamuklu Normal Bel Tapered Jean Pantolon",
  );
  t(jean.nounOverlap === 1, `«Jeans» için ürün adı tutuyor (${jean.nounOverlap})`);
  t(
    jean.score >= EXACT_MATCH_FLOOR,
    `«Jeans» birebir eşleşme tabanını geçiyor (${jean.score.toFixed(2)} ≥ ${EXACT_MATCH_FLOOR})`,
  );

  const top = score(
    { itemType: "Top", label: "Bej bluz", colorHex: "#d8c8b0" },
    "Uzun Kollu Volanlı Kareli Bağlama Detaylı V Yaka Bluz",
  );
  t(top.nounOverlap === 1, `«Top» için ürün adı tutuyor (${top.nounOverlap})`);
  t(
    top.score >= EXACT_MATCH_FLOOR,
    `«Top» birebir eşleşme tabanını geçiyor (${top.score.toFixed(2)} ≥ ${EXACT_MATCH_FLOOR})`,
  );
}

/*
 * 2) Vision'ın sık gönderdiği sınıflar Türkçe başlıklarda tutuyor mu?
 *
 * Tek tek, çünkü hepsi ayrı bir sözlük girdisi ve biri eksikse o parça canlı
 * satır alamıyor — sessizce, yalnızca «%35» diye görünerek.
 */
{
  const cases = [
    ["Pants", "Yüksek Bel Bol Paça Kumaş Pantolon"],
    ["Shoe", "Deri Bağcıklı Kadın Ayakkabı"],
    ["Sunglasses", "UV Korumalı Metal Çerçeveli Güneş Gözlüğü"],
    ["Outerwear", "Kapüşonlu Şişme Mont Ceket"],
    ["Dress", "Askılı Midi Abiye Elbise"],
    ["Skirt", "Pileli Midi Etek"],
    ["Hat", "Yün Karışımlı Bere Şapka"],
    ["Boot", "Topuklu Deri Bot"],
  ];

  const missed = [];
  for (const [itemType, title] of cases) {
    const got = score({ itemType, label: "", colorHex: "#808080" }, title);
    if (got.nounOverlap < 1) missed.push(`${itemType} ← «${title}»`);
  }

  t(missed.length === 0, `Vision sınıfları Türkçe başlıkta tutuyor: eksik ${JSON.stringify(missed)}`);
  console.log(`  ${cases.length} Vision sınıfının hepsi Türkçe başlıkta eşleşiyor`);
}

/*
 * 3) Çeviri kapıyı gevşetmiyor.
 *
 * Asıl risk şu olurdu: ürün adını her başlıkta tutturan bir çeviri, yanlış
 * ürünü de geçirir. Aile kapısı ayrı bir katman ama bu puanlayıcı da yanlış
 * cinsi ödüllendirmemeli.
 */
{
  const yanlis = score(
    { itemType: "Shoe", label: "Siyah ayakkabı", colorHex: "#101010" },
    "Uzun Kollu Volanlı Kareli Bağlama Detaylı V Yaka Bluz",
  );
  t(yanlis.nounOverlap === 0, `bluz, ayakkabı beklentisini tutmuyor (${yanlis.nounOverlap})`);
  t(
    yanlis.score < EXACT_MATCH_FLOOR,
    `ve birebir eşleşme olamıyor (${yanlis.score.toFixed(2)})`,
  );

  // Renk çelişkisi hâlâ ağır basıyor: doğru cins, yanlış renk.
  const renk = score(
    { itemType: "Jeans", label: "Siyah jean", colorHex: "#101010" },
    "Beyaz Yüksek Bel Jean Pantolon",
  );
  t(renk.color === "conflict", `renk çelişkisi görülüyor (${renk.color})`);
  t(
    renk.score < EXACT_MATCH_FLOOR,
    `çelişen renk birebir eşleşmeyi engelliyor (${renk.score.toFixed(2)})`,
  );
}

console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
