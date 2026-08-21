/**
 * Mağazaya giden dize — `node scripts/stubs/search-query-check.mjs`
 *
 * ## Neden var
 *
 * `buildSearchQuery` boru hattının en dar boğazı: her mağazanın gördüğü tek şey
 * onun ürettiği dize. Yine de doğrudan ölçen bir süit yoktu — `npm run eval`
 * onu kapsıyor ama fotoğraf ve canlı anahtar istiyor, yani her değişiklikten
 * sonra sürülmüyor.
 *
 * ## Ölçtüğü asıl iddia
 *
 * Üretimde şu sorgu 48 ürün sayfası buldu ve hiçbiri eşleşmedi:
 *
 *   «Gri ayakkabı bot»  → koton.com/sardonlu-cepli-…-esofman-alti-gri-…
 *
 * İki isim aramayı daraltmıyor. Mağazanın kendi arama motoru bunları VEYA
 * olarak okuyup kategorinin tamamını döndürüyor, ve dar olan isim gürültüde
 * kayboluyor. Türk mağazalarında kimse «ayakkabı bot» yazmıyor; «gri bot»
 * yazıyor.
 */
import { register } from "node:module";

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

register(new URL("../alias-loader.mjs", import.meta.url).href);
const { buildSearchQuery } = await import("@/lib/searchQuery");

/*
 * 1) **Şemsiye isim, özel isim varken düşüyor.**
 *
 * Vision'ın üç kategori sınıfı geniş birer terime çevriliyor (ayakkabı, ceket,
 * bluz) ve bu elde başka hiçbir şey yokken doğru. Kırpım etiketi ya da
 * betimleme aynı ailede daha dar bir isim verdiğinde geniş olanın işi bitiyor.
 */
{
  t(
    buildSearchQuery({ itemType: "Boot", label: "Footwear", colorName: "Gri" }) === "Gri bot",
    `üretimdeki durum: "${buildSearchQuery({ itemType: "Boot", label: "Footwear", colorName: "Gri" })}"`,
  );
  t(
    buildSearchQuery({ itemType: "Footwear", label: "boot", colorName: "Gri" }) === "Gri bot",
    "hangi tarafta durduğu fark etmiyor",
  );
  t(
    buildSearchQuery({ itemType: "Top", label: "polo shirt", colorName: "Krem" }) ===
      "Krem polo tişört",
    `«bluz» polo varken düşüyor: "${buildSearchQuery({ itemType: "Top", label: "polo shirt", colorName: "Krem" })}"`,
  );
}

/*
 * 2) Tek isim şemsiyeyse kalıyor.
 *
 * Düşürmek burada sorguyu isimsiz bırakırdı — ve isimsiz bir sorgu, geniş bir
 * isimden kötü: «Gri» tek başına bütün mağazayı döndürür.
 */
{
  t(buildSearchQuery({ itemType: "Footwear", colorName: "Gri" }) === "Gri ayakkabı", "tek isim kalıyor");
  t(buildSearchQuery({ itemType: "Top", colorName: "Krem" }) === "Krem bluz", "bluz tek başınayken kalıyor");
  t(
    buildSearchQuery({ itemType: "Outerwear", colorName: "Siyah" }) === "Siyah ceket",
    "ceket tek başınayken kalıyor",
  );
}

/*
 * 3) Başka ailenin ismi şemsiyeyi düşürmüyor.
 *
 * «Çanta» ile «ayakkabı» aynı sorguda olabilir — biri diğerinin daha dar hâli
 * değil. Aile kontrolü olmasaydı, herhangi bir isim herhangi bir şemsiyeyi
 * düşürürdü.
 */
{
  const query = buildSearchQuery({ itemType: "Footwear", label: "handbag", colorName: "Siyah" });
  t(/ayakkabı/.test(query), `başka aile şemsiyeyi düşürmüyor: "${query}"`);
}

/*
 * 4) **Kesme sınırı özel ismi yerse şemsiye geri geliyor.**
 *
 * Güvenlik ağı çıktının üzerinde çalışıyor, dizilerin üzerinde değil. İlk
 * yazdığımda «isim dizisi boş kaldıysa geri al» diye kurmuştum ve yanlış
 * ateşledi: özel isim sıfatlar tarafında durduğunda isim dizisi zaten boştu,
 * koruma tetikleniyor ve «Krem polo tişört bluz» hayatta kalıyordu.
 *
 * Burada tam tersi sınanıyor: sıfatlar özel ismi sınırın dışına itiyor, ve o
 * durumda sorgunun isimsiz kalmaması gerekiyor.
 */
{
  const query = buildSearchQuery({
    itemType: "Footwear",
    label: "boot",
    colorName: "Gri",
    descriptors: ["deri", "bağcıklı", "kalın tabanlı", "bilekte", "astarlı", "su geçirmez"],
  });

  t(
    /ayakkabı|bot/.test(query),
    `kesilse bile sorguda isim kalıyor: "${query}"`,
  );
}

/*
 * 5) Eskiden beri geçerli olan davranışlar korunuyor.
 *
 * Yeni bir kural eklerken eskisini düşürmek, ölçülmemiş bir gerileme demek.
 */
{
  // İsim, zengin sıfat kümesinde bile sorguda kalıyor.
  const rich = buildSearchQuery({
    itemType: "Ceket",
    colorName: "Pudra",
    descriptors: ["triko", "fermuarlı", "yüksek yaka", "oversize", "ince"],
  });
  t(/ceket/i.test(rich), `isim kesilmiyor: "${rich}"`);

  // Türkçe'de sıfat isimden önce gelir.
  t(rich.trim().endsWith("Ceket") || /ceket$/i.test(rich.trim()), `isim sonda: "${rich}"`);

  // Aynı sözcük iki kez yazılmıyor.
  const dupe = buildSearchQuery({ itemType: "Ceket", label: "deri ceket", colorName: "Siyah" });
  t((dupe.toLocaleLowerCase("tr").match(/ceket/g) ?? []).length === 1, `tekrar yok: "${dupe}"`);

  // Kategori adları gürültü listesinde — tek başına İngilizce sınıf gitmiyor.
  t(!/footwear|outerwear/i.test(buildSearchQuery({ itemType: "Footwear", colorName: "Gri" })), "İngilizce sınıf gitmiyor");
}

console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
