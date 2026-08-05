import "server-only";

import { openImage } from "@/services/imageDecode";

/**
 * Ekran görüntüsündeki arayüz şeritlerini kırpar.
 *
 * ## Neden
 *
 * Kullanıcılar kombinleri Instagram'dan **ekran görüntüsü** olarak getiriyor. Böyle
 * bir görselin üstünde durum çubuğu, altında sekme çubuğu, arada beğeni satırı
 * var — ve bunların hiçbiri kombinin parçası değil. Boru hattının her aşaması
 * onları fotoğrafın parçası sayıyor:
 *
 *  - `foreground.ts` arka plan paletini «hiçbir tespitin ve kişinin dışında kalan»
 *    piksellerden öğreniyor. Bir ekran görüntüsünde orası **arayüzün kendisi**.
 *    Beyaz bir sekme çubuğundan öğrenilen palet, beyaz bir gömleği arka plan
 *    sanıp eliyor — `fd-dress`'te ölçülen kusurun (kumaş fonla aynı kovaya
 *    düşüyor) aynısı, ama bu sefer kaçınılabilir.
 *  - Kutu koordinatları tüm kareye göre normalleniyor, yani `bodyPosition`
 *    kişinin nerede durduğunu arayüz şeritleri dahil ölçüyor.
 *  - Model karenin küçük bir bölümünü kapladığı için tespit güveni düşüyor ve
 *    `minScore` eşiğinin altına inebiliyor.
 *
 * ## Ne yapmıyor
 *
 * Bu bir «ekran görüntüsü mü» sınıflandırıcısı **değil**. Yalnızca kenarlardaki
 * düz şeritleri buluyor; bulamazsa hiçbir şey yapmıyor. Sıradan bir fotoğrafta
 * kırpma yapmaması, ekran görüntüsünde kırpma yapmasından daha önemli: yanlış
 * kırpılan bir fotoğrafta giysinin bir kısmı gider ve bunu kimse fark etmez.
 *
 * ## Neden dokuya bakıyor, renge değil
 *
 * Bir arayüz şeridi **düz**: satır boyunca renk değişmiyor. Koyu bir pantolon da
 * karenin altını doldurabilir ama kumaşın dokusu, kıvrımı ve ışığı var — satır
 * boyunca sıfır olmayan bir yayılım bırakıyor. Ayrım rengin kendisinde değil,
 * yayılımda; o yüzden eşik parlaklığa değil **satır içi yayılıma** konuldu ve
 * ölçek, dokuyu ortalayıp yok etmeyecek kadar geniş tutuldu.
 */

/** Şeridin düz sayılması için satır içi kanal yayılımının kalacağı üst sınır (0..255). */
const FLAT_SPREAD = 6;

/**
 * Analizin yapıldığı genişlik.
 *
 * Küçültmek hızlı ama dokuyu ortalayarak yok ediyor — 32 pikselde koyu bir kumaş
 * da düz görünür ve kırpılırdı. 160, telefon ekran görüntüsünde şeridi hâlâ düz
 * bırakacak, kumaşta ise yayılımı ayakta tutacak aralıkta.
 */
const SAMPLE_WIDTH = 160;

/** Bu kadarından azı kırpılacaksa uğraşmaya değmez. */
const MIN_TRIM_FRACTION = 0.02;

/**
 * Kırpılacak şeridin özgün çözünürlükte kalabileceği en yüksek sapma.
 *
 * Gerçek bir durum ya da sekme çubuğu tek renk; JPEG'e sıkıştırılmış hâlinde bile
 * sapması birkaç birimde kalıyor. Yanlış kırpılan iki fotoğrafın şeritleri 57 ve
 * 8.6 ölçüldü, sentezlenmiş çubuklar ise 0 — üçü de bu eşiğin doğru tarafında.
 *
 * **Ölçülmemiş olan:** gerçek bir Instagram ekran görüntüsünün JPEG gürültüsü. Bu
 * ortamda öyle bir dosya yok, yani eşik gerçek girdiye karşı değil, gerçek
 * fotoğraflara ve sentezlenmiş çubuklara karşı doğrulandı. Kaçırılan bir ekran
 * görüntüsünün bedeli bugünkü davranış (kırpma yok), yanlış kırpmanın bedeli ise
 * sessizce kaybolan bir giysi — o yüzden eşik bilerek bu yöne yanlı.
 */
const BAND_STDEV = 3;

/**
 * Geriye kalması gereken en küçük pay.
 *
 * Bunun altına inen her aday reddediliyor. Amaç, düz bir stüdyo fonunun ya da
 * gökyüzünün fotoğrafın yarısını yedirmesini engellemek: kırpma bir kazanç
 * olmalı, kumar değil.
 */
const MIN_KEPT_FRACTION = 0.45;

export interface ChromeTrim {
  /** Kırpılacak alan; kırpılmayacaksa `null`. */
  box: { left: number; top: number; width: number; height: number } | null;
  /** İnsan okuyabilir gerekçe — teşhis paneline ve loga giriyor. */
  reason: string;
}

/** Bir satırın (ya da sütunun) rengi: düzse ortalama, değilse `null`. */
function flatColor(pixels: Buffer, indices: number[], channels: number): number[] | null {
  const min = [255, 255, 255];
  const max = [0, 0, 0];
  const sum = [0, 0, 0];

  for (const index of indices) {
    for (let c = 0; c < 3; c += 1) {
      const value = pixels[index * channels + c] ?? 0;
      if (value < min[c]!) min[c] = value;
      if (value > max[c]!) max[c] = value;
      sum[c]! += value;
    }
  }

  if (max.some((value, c) => value - min[c]! > FLAT_SPREAD)) return null;
  return sum.map((total) => total / indices.length);
}

/**
 * Baştan ve sondan kaç şerit, **tek ve aynı renkte** düz.
 *
 * Yalnızca satır içi düzlüğe bakmak yetmiyordu ve bunu ölçüm söyledi: 57
 * fotoğrafın ikisi yanlışlıkla kırpıldı, çünkü yumuşak bir gökyüzü ya da stüdyo
 * fonu **satır satır** düz — yayılım dikeyde, satırın içinde değil. Kırpılan
 * şeridin kendi içinde sapması 57'ydi, yani «düz» dediğim şey düz değildi.
 *
 * Bir durum çubuğu ise iki yönde de tek renk. O yüzden şeridin devam etmesi için
 * satırın hem düz olması hem de **ilk satırın rengiyle** aynı kalması gerekiyor;
 * bir gradyan ikinci satırda kopuyor.
 */
function flatRun(
  count: number,
  colorAt: (index: number) => number[] | null,
): [number, number] {
  const run = (from: number, step: number): number => {
    const seed = colorAt(from);
    if (!seed) return 0;

    let length = 1;
    for (let i = from + step; i >= 0 && i < count; i += step) {
      const color = colorAt(i);
      if (!color || color.some((value, c) => Math.abs(value - seed[c]!) > FLAT_SPREAD)) break;
      length += 1;
    }
    return length;
  };

  const start = run(0, 1);
  // Tamamı tek renkse bu bir fotoğraf değil; çağıran bunu zaten reddediyor.
  if (start >= count) return [count, 0];
  return [start, run(count - 1, -1)];
}

/**
 * Bir şeridin özgün çözünürlükteki en yüksek kanal sapması.
 *
 * Piksellerden elle hesaplanıyor, `sharp().stats()` ile değil — ve bu bir üslup
 * tercihi değil, ölçülmüş bir tuzak: **`stats()` boru hattındaki `extract()`'i
 * yok sayıyor** ve girdi görselinin tamamının istatistiğini döndürüyor. İlk
 * sürümde şeridin sapmasını `stats()` ile okumuştum; 900×84 üst şerit ile 900×3
 * alt şerit **birebir aynı** sayıyı verdi, ki imkânsız. O sayı şeridin değil
 * fotoğrafın tamamının sapmasıydı, yani doğrulama ölçtüğünü sandığı şeyi hiç
 * ölçmüyordu.
 */
async function bandSpread(
  buffer: Buffer,
  band: { left: number; top: number; width: number; height: number },
): Promise<number> {
  const { data, info } = await openImage(buffer)
    .extract(band)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const count = info.width * info.height;
  if (count === 0) return 0;

  let worst = 0;
  for (let c = 0; c < 3; c += 1) {
    let sum = 0;
    let squares = 0;
    for (let i = 0; i < count; i += 1) {
      const value = data[i * info.channels + c] ?? 0;
      sum += value;
      squares += value * value;
    }
    const mean = sum / count;
    worst = Math.max(worst, Math.sqrt(Math.max(0, squares / count - mean * mean)));
  }
  return worst;
}

/**
 * Kenarlardaki düz şeritleri ölçer.
 *
 * Karar veriyor, kırpmıyor: çağıran `box`'ı `extract`'e verip vermemekte serbest,
 * ve `reason` her iki durumda da neden öyle olduğunu söylüyor.
 */
export async function measureChrome(buffer: Buffer): Promise<ChromeTrim> {
  const { data, info } = await openImage(buffer)
    .resize({ width: SAMPLE_WIDTH, fit: "inside", withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (width < 8 || height < 8) return { box: null, reason: "görsel örneklemek için çok küçük" };

  const rowIndices = (y: number) => Array.from({ length: width }, (_, x) => y * width + x);
  const colIndices = (x: number) => Array.from({ length: height }, (_, y) => y * width + x);

  const [top, bottom] = flatRun(height, (y) => flatColor(data, rowIndices(y), channels));
  const [left, right] = flatRun(width, (x) => flatColor(data, colIndices(x), channels));

  const keptHeight = height - top - bottom;
  const keptWidth = width - left - right;

  if (keptHeight <= 0 || keptWidth <= 0) {
    return { box: null, reason: "görselin tamamı düz — kırpılacak içerik yok" };
  }

  const trimmed = 1 - (keptWidth * keptHeight) / (width * height);
  if (trimmed < MIN_TRIM_FRACTION) {
    return { box: null, reason: "kenarlarda düz şerit yok" };
  }

  if (
    keptHeight / height < MIN_KEPT_FRACTION ||
    keptWidth / width < MIN_KEPT_FRACTION
  ) {
    /*
     * Fazla iddialı bir kırpma, kırpmamaktan kötü. Bu eşiğe takılan tipik vaka
     * bir arayüz şeridi değil, düz bir stüdyo fonu ya da gökyüzü — yani içerik.
     */
    return { box: null, reason: "kırpma fazla büyük olurdu — geri çekildi" };
  }

  // Ölçüm küçültülmüş kopyada yapıldı; kutu özgün ölçeğe geri çevriliyor.
  const source = await openImage(buffer).metadata();
  const scale = source.width! / width;

  /*
   * Kenarı bir örnek satırı kadar **eksik** kırp.
   *
   * Ölçüm 160 piksellik ızgarada yapıldığı için kenarın yeri ancak bir örnek
   * satırı hassasiyetinde biliniyor; yuvarlama şeridi bir iki piksel fazla
   * götürebiliyor. İki yönden biri seçilecekse eksik kırpmak doğru olanı: geride
   * kalan birkaç piksellik çubuk zararsız, fazladan alınan birkaç piksel ise
   * giysinin kenarı.
   *
   * Aynı pay doğrulamayı da mümkün kılıyor — şeridin içerikle sınırdaki satırı
   * karışık örnek, onu «düz mü» diye sormak ölçümün çözünürlüğünü aşan bir soru.
   */
  const margin = Math.ceil(scale);
  const box = {
    left: Math.max(0, Math.round(left * scale) - margin),
    top: Math.max(0, Math.round(top * scale) - margin),
    width: 0,
    height: 0,
  };
  box.width = Math.min(source.width! - box.left, Math.round(keptWidth * scale) + margin * 2);
  box.height = Math.min(source.height! - box.top, Math.round(keptHeight * scale) + margin * 2);

  /*
   * Adayı **özgün çözünürlükte** doğrula.
   *
   * Küçültülmüş kopyada «düz» görünen şerit düz olmayabiliyor ve bu bir tahmin
   * değil, ölçüm: 57 fotoğrafın ikisi bu yüzden yanlış kırpıldı, kırpılan şeridin
   * kendi sapması 57'ydi. 160 piksele indirmek dokuyu ortalayıp yok ediyor, yani
   * ucuz geçiş bir **aday** üretebilir ama karar veremez.
   *
   * Doğrulama tek `stats()` çağrısı ve yalnızca dar şeritler üzerinde, yani ucuz.
   * Eşik sıkı: gerçek bir durum çubuğu tek renk, JPEG gürültüsüyle birlikte bile
   * sapması birkaç birim. Şüphede kalınca kırpmamak doğru taraf — yanlış kırpılan
   * bir fotoğrafta giysinin bir kısmı sessizce gider.
   */
  const bands: Array<{ left: number; top: number; width: number; height: number }> = [];
  if (box.top > 0) bands.push({ left: 0, top: 0, width: source.width!, height: box.top });
  const bottomHeight = source.height! - (box.top + box.height);
  if (bottomHeight > 0) {
    bands.push({ left: 0, top: box.top + box.height, width: source.width!, height: bottomHeight });
  }
  if (box.left > 0) bands.push({ left: 0, top: 0, width: box.left, height: source.height! });
  const rightWidth = source.width! - (box.left + box.width);
  if (rightWidth > 0) {
    bands.push({ left: box.left + box.width, top: 0, width: rightWidth, height: source.height! });
  }

  for (const band of bands) {
    const spread = await bandSpread(buffer, band);
    if (spread > BAND_STDEV) {
      return {
        box: null,
        reason: `kenar şeridi düz değil (sapma ${spread.toFixed(1)}) — kırpılmadı`,
      };
    }
  }

  return { box, reason: `arayüz şeridi kırpıldı — %${Math.round(trimmed * 100)}` };
}
