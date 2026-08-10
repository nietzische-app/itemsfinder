/**
 * Dizin dosyasının yazılıp yazılmayacağı kararı.
 *
 * Ayrı bir dosyada, çünkü `build-index.mjs` ağa gidiyor ve tepesinde `await`
 * var: içe aktarmak koşuyu başlatırdı. Kural burada durunca ölçüm **kuralın
 * kendisini** ölçüyor, ikinci bir kopyasını değil.
 */

/**
 * Sıfır sonuç, dolu bir dizin dosyasının üstüne yazılmamalı.
 *
 * Koşu bu tehlikeyi gösterdi: Gratis bir koşuda 13.233 yol verdi, sonrakinde
 * sıfır — ve sıfır dosyaya yazıldı. Dizin depoya konduğunda bu, geçici bir
 * mağaza arızasının on üç bin çalışan adresi **silmesi** demek. Periyodik bir iş
 * bunu gece yarısı sessizce yapar ve ertesi gün kanal daralmış olur.
 *
 * Bir mağazada gerçekten sıfır ürün olması gerçek bir durum değil; ağ arızası,
 * bot duvarı ve değişen sitemap düzeni gerçek.
 *
 * Koruma **sessiz değil**: çağıran bunu yüksek sesle yazıyor. Sessiz koruma da
 * sessiz silme kadar kötü olurdu — eskimiş bir dizin taze sanılırdı.
 */
export function keepsPrevious(previous, keptCount) {
  return keptCount === 0 && previous.trim().length > 0;
}
