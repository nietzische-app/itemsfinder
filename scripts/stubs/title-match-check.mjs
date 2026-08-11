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
const { contradictsShopper } = await import("@/lib/shopperGender");

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

/*
 * 4) Kitle kapısı — **üretimden gelen gerçek vaka**.
 *
 * Kadın kombini tarandı ve Boyner'in arama sayfası «Slim Fit Orta Bel Düz Paça
 * Erkek Gri Pantolon» döndürdü. Satır bütün kapıları geçti: doğru aile, doğru
 * renk, doğru cins ürün. Teknik olarak kusursuz, kullanıcı için yanlış ürün.
 *
 * Bu bir KAPI, kanıt değil — ölçüm bunu düzeltti. Önce puanlayıcıya -0.3'lük
 * bir ceza yazıldı ve yetmedi: ad, renk ve niteleyici uyduğu için satır 0.60 ile
 * birebir eşleşme tabanını yine geçti. İki mekanizma tek kural için, ve ikisi de
 * yarım.
 *
 * Cinsiyet fotoğraftan çıkarılmıyor — görünüşten tahmin etmek hem güvenilmez
 * hem de yapılmaması gereken bir şey. Değer yalnızca kullanıcının seçiminden
 * geliyor, ve seçim yoksa hiçbir satır elenmiyor.
 */
{
  const erkekPantolon = "Slim Fit Orta Bel Düz Paça Erkek Gri Pantolon";

  t(!contradictsShopper(erkekPantolon), "seçim yokken hiçbir şey elenmiyor");
  t(contradictsShopper(erkekPantolon, "kadın"), "«kadın» seçiliyken erkek ürünü eleniyor");
  t(!contradictsShopper(erkekPantolon, "erkek"), "«erkek» seçiliyken aynı ürün geçiyor");

  /*
   * Yokluk cezalandırılmıyor: mağazaların çoğu başlığa cinsiyet yazıyor ama
   * hepsi yazmıyor, ve yazmayanı elemek yalnızca uzun başlık yazanı öne
   * çıkarırdı.
   */
  t(
    !contradictsShopper("Yüksek Bel Bol Paça Kumaş Pantolon", "kadın"),
    "cinsiyet yazmayan başlık elenmiyor",
  );

  // Koton'un gerçek satırı: «Kadın» yazan başlık, kadın seçimiyle geçmeli.
  t(
    !contradictsShopper("Kadın Oversize Viskon Cep Detaylı Pileli Kumaş Pantolon", "kadın"),
    "uyan kitle geçiyor",
  );

  /*
   * «Erkek Çocuk» bir çocuk ürünü, erkek ürünü değil — ve ikisiyle de çelişiyor.
   * Kelime sırasına bakan bir kural bunu erkek sayardı ve bir çocuk pantolonunu
   * yetişkine gösterirdi.
   */
  t(contradictsShopper("Erkek Çocuk Rahat Kesim Kumaş Pantolon", "erkek"), "çocuk ürünü yetişkine verilmiyor");
  t(contradictsShopper("Kız Çocuk Kot Pantolon", "kadın"), "kız çocuk ürünü de yetişkine verilmiyor");

  // «Unisex» hiçbir seçimle çelişmiyor: zaten ikisi için de satılıyor.
  t(!contradictsShopper("Unisex Rahat Kesim Kumaş Pantolon", "kadın"), "unisex çelişmiyor");

  /*
   * Kelime sınırı şart: «erkekçe» ya da «kadinlar» gibi bir kelimenin içinde
   * geçen harf dizisi kitle bildirmiyor. Alt dize araması bir markayı ya da bir
   * desen adını cinsiyet sanabilirdi.
   */
  t(!contradictsShopper("Mango Kadife Pantolon", "kadın"), "kelime içindeki dizi kitle sayılmıyor");
}

/*
 * Ürün adı tek başına birebir eşleşme ilan ettirmiyor.
 *
 * **Üretimde görülen kusur.** `BASE + NOUN_WEIGHT` tam olarak
 * `EXACT_MATCH_FLOOR` ediyor (0,35 + 0,20 = 0,55), yani yalnızca ürün adı tutan
 * bir satır tabanı **tam** olarak geçiyor ve birebir eşleşme oluyordu. Bir erkek
 * kombininin sonuçlarında üç satır yan yana durdu:
 *
 *   «Tabanex Ayakkabı ve Çanta Koku Topu»   %60   beyaz sneaker için
 *   «Uzun Kollu Volanlı … V Yaka Bluz»      %57   bej ribana polo için
 *   «Normal Bel … Skinny Fit Jean Pantolon» %56   geniş bej pantolon için
 *
 * Üçünde de tutan tek şey ürün adı. Öznitelik betimlemesi kapalıyken elde
 * niteleyici de kalmıyor, yani neredeyse her aday tam tabana oturuyor —
 * sonuçların «tutarsız» görünmesinin sebebi puanların dalgalanması değil,
 * hepsinin aynı yere yığılması.
 *
 * Adın tutması «doğru raftayız» demek; aile kapısı onu zaten geçirdi. «Bu, o
 * parça» demek için adın **dışında** bir kanıt gerekiyor.
 *
 * Başlıklar üretimden, uydurma değil.
 */
{
  const sneaker = { itemType: "Ayakkabı", label: "", colorHex: "#f2f2f0", attributes: "" };
  const koku = score(sneaker, "Tabanex Ayakkabı ve Çanta Koku Topu");

  t(koku.score >= EXACT_MATCH_FLOOR, `taban geçiliyor (%${Math.round(koku.score * 100)})`);
  t(!koku.corroborated, `ama ad dışında kanıt yok: ${koku.reason}`);

  /*
   * Kanıtın **her biri** tek başına yetiyor: renk, malzeme ya da niteleyici.
   * Üçünü birden şart koşmak, betimleme kapalıyken hiçbir satırı geçirmezdi.
   */
  const bejPantolon = { itemType: "Pantolon", label: "", colorHex: "#e8e0cd", attributes: "" };
  const renkli = score(bejPantolon, "Bej Geniş Paça Pantolon");
  t(renkli.corroborated, `renk tek başına kanıt sayılıyor: ${renkli.reason}`);

  /*
   * **«Krem» de renk sayılıyor** — ve bu, sıkılaştırmayla birlikte gelmek
   * zorundaydı.
   *
   * Palet iki iş yapıyor: ölçülen rengi adlandırmak ve başlıktaki rengi tanımak.
   * İkincisinin sözlüğü daha geniş olmalı — biz «Kırık Beyaz» diye ararız,
   * mağaza «Krem» yazar. Üretimde krem bir polo ve bej bir pantolon tarandı ve
   * hiçbir satırda renk uyuşmadı, çünkü o kelime sözlükte yoktu.
   *
   * Renk, ek kanıtın en sık bulunanı: sözlük boşluğu, sıkılaştırılmış kuralla
   * birleşince doğru satırları da düşürürdü.
   */
  const krem = score(bejPantolon, "Krem Keten Geniş Paça Pantolon");
  t(krem.corroborated, `«krem» renk sayılıyor: ${krem.reason}`);

  const ekru = score(bejPantolon, "Ekru Kumaş Pantolon");
  t(ekru.corroborated, `«ekru» renk sayılıyor: ${ekru.reason}`);

  /*
   * **«Kumaş» renk sayılmıyor** — eş anlamlı listesinin ilk hâlinin ürettiği
   * kusur.
   *
   * `hasStem` ön ek arıyor ve «kum» (renk) Türkçe giysi başlıklarının en sık
   * kelimesini yedi. Her «Kumaş Pantolon» sahte bir bej uyumu kazanıyordu, yani
   * sıkılaştırılmış kural tam da yanlış satırları geçirmeye başlıyordu — bir
   * düzeltmenin kendi kusurunu üretmesi.
   *
   * Bu depoda aynı hata sınıfı iki kez kayıtlı: «Chair» içindeki «hair»,
   * «sitemap» içindeki «item».
   */
  const kumas = score(bejPantolon, "Kumaş Pantolon");
  t(!kumas.corroborated, `«kumaş» renk sanılmıyor: ${kumas.reason}`);

  /*
   * Renk **çelişkisi** kanıt değil — zaten ayrı bir kapı, ama `corroborated`ın
   * onu doğru sayması sessiz bir kusur olurdu.
   */
  const celisen = score(bejPantolon, "Siyah Kumaş Pantolon");
  t(!celisen.corroborated, `renk çelişkisi kanıt sayılmıyor: ${celisen.reason}`);
}

console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
