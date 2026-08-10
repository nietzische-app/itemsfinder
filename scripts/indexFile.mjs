/**
 * Dizin dosyasının yazılıp yazılmayacağı kararı.
 *
 * Ayrı bir dosyada, çünkü `build-index.mjs` ağa gidiyor ve tepesinde `await`
 * var: içe aktarmak koşuyu başlatırdı. Kural burada durunca ölçüm **kuralın
 * kendisini** ölçüyor, ikinci bir kopyasını değil.
 */

/**
 * Yeni sonuç eskisinin bu oranının altına düşerse dosya korunuyor.
 *
 * **Bu bir yargı, ölçüm değil** — ve öyle olduğu için burada yazılı. Ölçülen
 * şey arızanın kendisi: Gratis bir koşuda 13.233 yol verdi, sonrakinde 1258 ham
 * adres getirip sıfır yol üretti, bir sonrakinde yine 13.233'e döndü. Yani
 * arıza gerçek ve geçici.
 *
 * Eşiğin gerekçesi o koşunun **az kalsın** olduğu şey: 1258 ham adres sıfıra
 * süzüldü, ama pekâlâ üç yüze de süzülebilirdi. Sıfır kontrolü onu geçirir ve
 * dizin sessizce onda birine inerdi. Bir mağazanın gece boyunca kataloğunun
 * yarısını kaldırması gerçekçi değil; indirmenin yarısını kaçırması gerçekçi.
 *
 * Yanılma tarafı da bilinçli: eşik fazla yüksek olursa gerçekten küçülen bir
 * mağaza sonsuza kadar eski dosyayla kalır — ama bu durum çıktıda yüksek sesle
 * yazıldığı için görülebiliyor, sessizce silinen on üç bin adres görülemiyordu.
 */
const SHRINK_FLOOR = 0.5;

/** Bir dizin dosyasındaki yol sayısı. */
export function countPaths(body) {
  return body.split("\n").filter((line) => line.trim().length > 0).length;
}

/**
 * Yeni sonuç, eldeki dosyanın üstüne yazılmalı mı?
 *
 * Koruma **sessiz değil**: çağıran bunu yüksek sesle yazıyor. Sessiz koruma da
 * sessiz silme kadar kötü olurdu — eskimiş bir dizin taze sanılırdı.
 */
export function keepsPrevious(previous, keptCount) {
  const before = countPaths(previous);
  if (before === 0) return false;

  return keptCount === 0 || keptCount < before * SHRINK_FLOOR;
}

/** Korumanın sebebi, insan okuyabilir hâlde. */
export function shrinkReason(previous, keptCount) {
  const before = countPaths(previous);
  if (keptCount === 0) return `sıfır geldi, önceki ${before} yol korundu`;
  return `${before} → ${keptCount} (yarıdan fazla düştü), önceki korundu`;
}
