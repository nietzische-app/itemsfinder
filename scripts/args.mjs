/**
 * Ölçüm betiklerinin komut satırı bayrakları — **bilinmeyeni reddederek**.
 *
 * ## Neden ayrı bir dosya
 *
 * Üç betikte üç kopyası vardı ve üçü de bilmediği bayrağı sessizce yutuyordu.
 * Ölçülen kusur bir yazım hatası değil, ölçümün kendisi: `--magaza koton.com`
 * yazıldı (iş akışının girdi adı bu), betik bayrağı tanımadı, `--site` boş
 * kaldı ve **on dokuz mağazanın hepsi** ölçüldü. Çıktı düzgün, başlık düzgün,
 * cevap başka bir sorunun cevabı.
 *
 * Sessiz yutma ölçüm betiğinde sıradan bir kolaylıktan kötü: burada çıktı bir
 * karara dönüşüyor ve «hangi soruyu sorduğumuz» çıktının kendisinden okunamıyor.
 *
 * `--sorgu`/`--magaza`/`--adres` de kabul ediliyor: iş akışının açılır
 * menüsündeki adlar bunlar, ve orada gördüğü adı yazan kişi haklı.
 */

/**
 * @param {string[]} argv - `process.argv.slice(2)`
 * @param {Record<string, string[]>} spec - bayrak adı → eşanlamlıları
 * @returns {(name: string) => string | undefined}
 */
export function parseArgs(argv, spec) {
  const known = new Set(Object.entries(spec).flatMap(([name, aliases]) => [name, ...aliases]));

  /*
   * Değer konumundaki sözcük bayrak sanılmamalı: `--q --site` yazılırsa `--site`
   * hem `--q`'nun değeri hem de bayrak olurdu. Değer olarak tüketilenler
   * işaretleniyor, ve tanınmayan bayrak kontrolü yalnızca geriye kalana bakıyor.
   */
  const consumed = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const entry = argv[i];
    if (!entry.startsWith("--") || entry.includes("=")) continue;
    if (known.has(entry.slice(2)) && i + 1 < argv.length) consumed.add(i + 1);
  }

  const unknown = argv.filter((entry, index) => {
    if (consumed.has(index)) return false;
    if (!entry.startsWith("--")) return true;
    const name = entry.slice(2).split("=")[0];
    return !known.has(name);
  });

  if (unknown.length > 0) {
    const flags = Object.entries(spec)
      .map(([name, aliases]) => [`--${name}`, ...aliases.map((a) => `--${a}`)].join(" / "))
      .join("\n  ");
    console.error(`Tanınmayan argüman: ${unknown.join(" ")}\n\nKabul edilenler:\n  ${flags}`);
    process.exit(2);
  }

  return (name) => {
    for (const candidate of [name, ...(spec[name] ?? [])]) {
      const hit = argv.find((entry) => entry.startsWith(`--${candidate}=`));
      if (hit) return hit.slice(candidate.length + 3);

      const at = argv.indexOf(`--${candidate}`);
      if (at !== -1 && at + 1 < argv.length) return argv[at + 1];
    }
    return undefined;
  };
}
