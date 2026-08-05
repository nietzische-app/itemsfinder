/**
 * Ekran görüntüsü şeridi kırpma — `node scripts/stubs/chrome-check.mjs`.
 *
 * İki soru, ve ikincisi birincisinden önemli:
 *
 *  1. Sentezlenmiş bir ekran görüntüsünde şerit gerçekten kırpılıyor mu?
 *  2. **58 gerçek fotoğrafın hiçbiri yanlışlıkla kırpılıyor mu?**
 *
 * İkincisi önemli çünkü yanlış kırpılan bir fotoğrafta giysinin bir kısmı gider ve
 * bunu kimse fark etmez — sessiz kayıp, gürültülü kayıptan kötü. O yüzden burada
 * geçme ölçütü «bazı ekran görüntülerini yakalıyor» değil, «hiçbir fotoğrafı
 * bozmuyor».
 */
import { register } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

register(new URL("../alias-loader.mjs", import.meta.url).href);
const { measureChrome } = await import("@/services/screenshotChrome");
const sharp = (await import("sharp")).default;

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

const EXAMPLES = path.resolve("public/examples");
const photos = (await readdir(EXAMPLES)).filter((name) => /\.(jpe?g|png)$/i.test(name));

/* -------------------------------------------------------------------------- */
/*  1. Gerçek fotoğraflar — hiçbiri kırpılmamalı                              */
/* -------------------------------------------------------------------------- */

/*
 * İlk yazdığımda ölçüt «hiçbir gerçek fotoğraf kırpılmamalı»ydı ve ikisi kırpıldı.
 * Şeritlerine bakınca ölçütün yanlış olduğu çıktı, kodun değil: `iurii-melentsov`
 * fotoğrafının üstünde 900×78 tek renk bir bant var (1,91,107 — sapma 2'nin
 * altında), `showcase-fallback` ise altında düz bir şerit taşıyan üretilmiş bir
 * yer tutucu. Tek renk bir bandı kırpmak hiçbir giysi pikselini götürmüyor; asıl
 * korunması gereken şey «kırpma yok» değil, **kırpılanın gerçekten tek renk
 * olması**.
 *
 * Bu yüzden kontrol, kodun kendi eşiğini tekrarlamak yerine bağımsız bir
 * istatistiğe bakıyor: şeritte kaç ayrı renk var. Doku varsa kova sayısı patlar,
 * arayüz çubuğunda ise bir ya da iki kovada kalır.
 */
/*
 * Düz bir bandın bırakabileceği en fazla kova.
 *
 * İlk hâlinde 2 yazmıştım ve iki gerçek şerit 3 ve 4 verdi. Sebep eşiğin değil
 * anahtarın şekliydi: kova anahtarı üç kanalı birleştiriyor, yani JPEG gürültüsü
 * her kanalda bir kova sınırını yalarsa 2³ = 8 birleşim çıkıyor — hepsi hâlâ tek
 * renk. Doku ise bu sayıyı onlarca kovaya taşıyor, aşağıdaki karşı kontrol bunu
 * gösteriyor. Yani 8 «geçsin diye» seçilmiş bir sayı değil, üç kanallı bir
 * anahtarın gürültü altındaki üst sınırı.
 */
const FLAT_BUCKETS = 8;

function bucketCount(data, info) {
  const seen = new Set();
  for (let i = 0; i < info.width * info.height; i += 1) {
    const r = data[i * info.channels] >> 4;
    const g = data[i * info.channels + 1] >> 4;
    const b = data[i * info.channels + 2] >> 4;
    seen.add((r << 8) | (g << 4) | b);
  }
  return seen.size;
}

const trimmedPhotos = [];
const textured = [];

for (const name of photos) {
  const buffer = await readFile(path.join(EXAMPLES, name));
  const { box } = await measureChrome(buffer);
  if (!box) continue;

  const meta = await sharp(buffer).metadata();
  trimmedPhotos.push(name);

  const bands = [];
  if (box.top > 0) bands.push({ left: 0, top: 0, width: meta.width, height: box.top });
  const bottom = meta.height - (box.top + box.height);
  if (bottom > 0) {
    bands.push({ left: 0, top: box.top + box.height, width: meta.width, height: bottom });
  }
  if (box.left > 0) bands.push({ left: 0, top: 0, width: box.left, height: meta.height });
  const right = meta.width - (box.left + box.width);
  if (right > 0) {
    bands.push({ left: box.left + box.width, top: 0, width: right, height: meta.height });
  }

  for (const band of bands) {
    const { data, info } = await sharp(buffer).extract(band).raw().toBuffer({ resolveWithObject: true });
    const buckets = bucketCount(data, info);
    if (buckets > FLAT_BUCKETS) {
      textured.push(`${name}: ${band.width}×${band.height} bantta ${buckets} renk`);
    }
  }
}

t(
  textured.length === 0,
  `dokulu bant kırpıldı:\n      ` + textured.slice(0, 6).join("\n      "),
);
console.log(
  `  ${photos.length} gerçek fotoğraf, kırpılan ${trimmedPhotos.length} ` +
    `(${trimmedPhotos.join(", ") || "yok"}), dokulu bant ${textured.length}`,
);

/* -------------------------------------------------------------------------- */
/*  2. Sentezlenmiş ekran görüntüleri — şerit kırpılmalı                      */
/* -------------------------------------------------------------------------- */

/** Fotoğrafı telefon ekranı gibi çerçeveler: üstte durum çubuğu, altta sekme çubuğu. */
async function framed(buffer, { bar, top = 140, bottom = 190, side = 0 }) {
  /*
   * Ölçekli boyutu `toBuffer({ resolveWithObject: true })` veriyor; `metadata()`
   * bir `resize()` boru hattında **kaynağın** boyutunu döndürüyor ve ilk hâlinde
   * beklenen değeri oradan almıştım — test, kodun doğru bulduğu kutuyu yanlış
   * sanıyordu.
   */
  const { data: photo, info } = await sharp(buffer)
    .resize({ width: 1080, fit: "inside" })
    .png()
    .toBuffer({ resolveWithObject: true });

  const out = await sharp(photo)
    .extend({ top, bottom, left: side, right: side, background: bar })
    .png()
    .toBuffer();

  return { out, width: info.width, height: info.height, top, side };
}

// Instagram'ın iki uçtaki hâli: açık tema (beyaz çubuk) ve koyu tema (siyah çubuk).
const themes = [
  { name: "açık tema", bar: { r: 255, g: 255, b: 255 } },
  { name: "koyu tema", bar: { r: 0, g: 0, b: 0 } },
];

// İçeriğe göre üç farklı fotoğraf: koyu giysili, açık giysili, desenli.
const samples = photos.slice(0, 3);

for (const theme of themes) {
  for (const name of samples) {
    const source = await readFile(path.join(EXAMPLES, name));
    const { out, width, height, top, side } = await framed(source, { bar: theme.bar });
    const { box, reason } = await measureChrome(out);

    if (!box) {
      fails.push(`${theme.name} / ${name}: kırpılmadı (${reason})`);
      continue;
    }

    /*
     * İki ayrı iddia, ve simetrik değiller — bilerek.
     *
     * **Kapsama**, pazarlıksız: kırpılan kutu fotoğrafın tamamını içermeli. Bir
     * piksel bile eksikse giysinin kenarı gitmiş demektir ve bunu kimse fark
     * etmez. Kod zaten kasten eksik kırpıyor, yani bu testin geçmesi tesadüf
     * değil tasarım.
     *
     * **Verim** ise toleranslı: ölçüm 160 piksellik ızgarada yapılıyor (özgün
     * ölçekte bir örnek satırı ~7 piksel) ve üstüne bir o kadar da emniyet payı
     * bırakılıyor. Çubuğun son birkaç pikselinin kalması zararsız.
     */
    const contains =
      box.top <= top &&
      box.left <= side &&
      box.top + box.height >= top + height &&
      box.left + box.width >= side + width;

    const slack = Math.ceil((1080 + side * 2) / 160) * 3;
    const efficient = box.height - height <= slack * 2 && box.width - width <= slack * 2;

    t(contains, `${theme.name} / ${name}: kırpma fotoğrafı yedi — kutu ${JSON.stringify(box)}, foto üst ${top} ${width}×${height}`);
    t(efficient, `${theme.name} / ${name}: şerit yeterince alınmadı — ${box.width}×${box.height} vs ${width}×${height}`);
  }
}

/* -------------------------------------------------------------------------- */
/*  3. Çekimserlik bedava olmalı                                              */
/* -------------------------------------------------------------------------- */

// Düz bir kare: kırpılacak içerik yok, çökmemeli.
{
  const flat = await sharp({
    create: { width: 400, height: 400, channels: 3, background: { r: 12, g: 12, b: 12 } },
  })
    .png()
    .toBuffer();
  const { box } = await measureChrome(flat);
  t(box === null, "tamamı düz kare kırpılmıyor");
}

// Şerit çok kalınsa geri çekiliyor: fotoğrafın yarısından fazlasını yiyen kırpma yok.
{
  const source = await readFile(path.join(EXAMPLES, photos[0]));
  const tiny = await sharp(source)
    .resize({ width: 200, height: 120, fit: "cover" })
    .extend({ top: 500, bottom: 500, background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();
  const { box, reason } = await measureChrome(tiny);
  t(box === null, `aşırı kırpma reddediliyor (${reason})`);
}

/* -------------------------------------------------------------------------- */
/*  4. Kova eşiği gerçekten ısırıyor mu                                       */
/* -------------------------------------------------------------------------- */

/*
 * «Düz bant en fazla 8 kova» iddiası, ancak dokulu bir bandın bunu aştığı
 * gösterilirse bir şey söyler. Aynı fotoğrafın ortasından aynı boyda bir şerit
 * alınıyor — orası tanımı gereği içerik.
 */
{
  const buffer = await readFile(path.join(EXAMPLES, photos[0]));
  const meta = await sharp(buffer).metadata();
  const { data, info } = await sharp(buffer)
    .extract({
      left: 0,
      top: Math.round(meta.height / 2),
      width: meta.width,
      height: Math.min(78, meta.height - Math.round(meta.height / 2)),
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buckets = bucketCount(data, info);
  t(buckets > FLAT_BUCKETS * 3, `dokulu şerit eşiği aşıyor (${buckets} > ${FLAT_BUCKETS * 3})`);
  console.log(`  karşı kontrol: fotoğrafın ortasındaki şeritte ${buckets} renk`);
}

console.log(`\n${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
