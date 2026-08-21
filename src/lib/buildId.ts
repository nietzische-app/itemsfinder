/**
 * Bu kodun kimliği — **tek kaynak**.
 *
 * ## Neden var
 *
 * Bu turda aynı belirsizlik altı kez tekrarlandı: bir değişiklik gönderildi,
 * üretim logu geldi, ve log'a bakarak «bu, yeni kod mu?» sorusuna cevap
 * verilemedi. İki kez yanlış tahmin edildi — bir kez önbellekten dönen eski bir
 * cevap yeni kodun çıktısı sanıldı, bir kez de durum satırındaki eski model adı
 * yüzünden isteğin nereye gittiği yanlış okundu.
 *
 * Tahmini kaldırmanın maliyeti tarama başına bir satır.
 *
 * ## Neden ayrı bir dosya
 *
 * `scanCache` aynı değişkenleri zaten okuyor (önbellek anahtarı boru hattının
 * sürümüne bağlı). İkinci bir okuma yeri, ikisinin ayrışmasına açık davetiye
 * olurdu: log bir dağıtımı gösterirken önbellek başka birine göre anahtarlanır
 * ve fark ancak üretimde görünürdü. Bu ders bu depoda üç kez ödendi —
 * `visionKey.ts`, `attributeProvider`'daki model adı, ve `retailVocabulary`'nin
 * düzyazı kuralı.
 */

/**
 * Dağıtımın insan okuyabilir kimliği.
 *
 * Sıra dağıtım kimliği, commit, elle verilen sürüm — `scanCache` ile aynı sıra,
 * çünkü ikisi aynı soruyu soruyor: «bu, hangi kod?»
 *
 * Yerelde `yerel`: orada her `next dev` yeniden başlatması zaten yeni kod ve
 * uydurma bir kimlik yazmak, olmayan bir kesinlik iddia etmek olurdu.
 */
export function buildIdSource(): string | null {
  return (
    process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.SCAN_CACHE_VERSION?.trim() ||
    null
  );
}

/** Tarama başına tek satır — `[dizin]`, `[vlm]`, `[ratelimit]` ile aynı gerekçe. */
export function buildIdLabel(): string {
  const source = buildIdSource();
  if (!source) return "yerel — dağıtım kimliği yok";

  /*
   * Commit varsa ayrıca yazılıyor: dağıtım kimliği Vercel'in iç adı ve GitHub'da
   * aranamıyor. «Hangi commit çalışıyor» sorusunun cevabı commit'in kendisi.
   */
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.trim();

  // Kaynak zaten commit'in kendisiyse kısaltılıyor; ikisini yan yana yazmak
  // («50e9a46abc… (50e9a46)») aynı bilgiyi iki kez göstermek olurdu.
  if (commit && source === commit) return commit.slice(0, 7);

  return commit ? `${source} (${commit.slice(0, 7)})` : source;
}
