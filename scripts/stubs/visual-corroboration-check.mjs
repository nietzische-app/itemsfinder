/**
 * Fotoğraf ne zaman kanıt sayılır? — `node scripts/stubs/visual-corroboration-check.mjs`
 *
 * ## Neden var
 *
 * Bir satırın «birebir eşleşme» olması için ürün adının dışında kanıt gerekiyor.
 * Betimleme kapalıyken metinden kanıt gelmiyor, ama görsel benzerlik zaten
 * ölçülüyordu ve bu kapıda sayılmıyordu — üretimde doğru ürünler bulunup
 * «muadil» olarak gösteriliyordu:
 *
 *   «Örgü Detaylı Hasır Tabanlı Espadril Sandalet Ayakkabı» %55, görsel %67
 *   «… Slim Fit Pantolon»                                    %55, görsel %57
 *
 * ## Ölçtüğü asıl tehlike
 *
 * `visualDescriptor` kendi başında uyarıyor: «iki alakasız bej ürünü memnuniyetle
 * benzer olarak puanlar». Renk ağırlığı 0,7 — yani yapı **sıfırken bile**
 * yalnızca renkle 0,65'e ulaşılabiliyor. Beyaz bir koku topu ile beyaz bir
 * sneaker tam olarak bu, ve o satır `docs/BULUNAMADI.md`'de kayıtlı:
 *
 *   «Tabanex Ayakkabı ve Çanta Koku Topu» %60 — beyaz sneaker için birebir
 *
 * Yani harmanlanmış tek sayıyı yükseltmek yetmiyor; kanıt, rengin yanında
 * **yapının** da uyduğunu istemek zorunda. Bu süit onu gerçek görsellerle
 * sürüyor: aynı renkte ama farklı biçimde iki görsel üretiliyor ve kanıt
 * sayılmadıkları ölçülüyor.
 */
import { register } from "node:module";

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

register(new URL("../alias-loader.mjs", import.meta.url).href);
const { describeImage, visualAgreement } = await import("@/services/visualDescriptor");
const { visuallyCorroborated, VISUAL_CORROBORATION_FLOOR, VISUAL_STRUCTURE_FLOOR } = await import(
  "@/lib/attributeMatch"
);
const sharp = (await import("sharp")).default;

const EDGE = 256;

/** Düz zemin üstüne verilen şekilleri çizip JPEG döndürüyor. */
async function draw(background, shapes) {
  const svg = `<svg width="${EDGE}" height="${EDGE}">${shapes}</svg>`;
  return sharp({
    create: { width: EDGE, height: EDGE, channels: 3, background },
  })
    .composite([{ input: Buffer.from(svg) }])
    .jpeg()
    .toBuffer();
}

const white = { r: 246, g: 245, b: 242 };

/*
 * Aynı beyaz zemin, üç farklı biçim.
 *
 * «Top» ile «ayakkabı» arasındaki fark tam olarak bu: renk aynı, kaba yapı
 * değil. Gerçek ürün fotoğrafları da böyle — ikisi de stüdyoda beyaz fon
 * üstünde çekiliyor.
 */
const ball = await draw(white, `<circle cx="128" cy="128" r="78" fill="#eceae4"/>`);
const shoe = await draw(
  white,
  `<rect x="26" y="150" width="204" height="58" rx="26" fill="#eceae4"/>` +
    `<rect x="26" y="118" width="96" height="52" rx="18" fill="#eceae4"/>`,
);
const shoeAgain = await draw(
  white,
  `<rect x="30" y="152" width="200" height="56" rx="26" fill="#e8e6e0"/>` +
    `<rect x="30" y="120" width="94" height="50" rx="18" fill="#e8e6e0"/>`,
);

const of = async (bytes) => {
  const descriptor = await describeImage(bytes);
  if (!descriptor) throw new Error("betimleyici üretilemedi");
  return descriptor;
};

const [dBall, dShoe, dShoeAgain] = await Promise.all([of(ball), of(shoe), of(shoeAgain)]);

/*
 * 1) **Aynı renk, farklı biçim → kanıt değil.**
 *
 * Asıl iddia. Renk uyumunun yüksek çıkması bekleniyor ve sorun değil; kanıt
 * sayılmaması gerekiyor. Bu kontrol olmasaydı «görsel eşiği yükselttik» demek
 * yalnızca sayıyı büyütmek olurdu ve koku topu yine geçerdi.
 */
{
  const a = visualAgreement(dBall, dShoe);

  console.log(`  [ölçüm] top↔ayakkabı: puan=${a.score} renk=${a.color} yapı=${a.structure}`);
  t(a.color > 0.8, `renk yüksek uyuyor (${a.color}) — tehlike buradan geliyor`);
  t(
    a.structure < VISUAL_STRUCTURE_FLOOR,
    `yapı tesadüf seviyesinde (${a.structure} < ${VISUAL_STRUCTURE_FLOOR})`,
  );
  t(!visuallyCorroborated(a), `kanıt sayılmıyor (puan ${a.score}, yapı ${a.structure})`);
}

/*
 * 2) Aynı şey, biraz farklı çekilmiş → kanıt.
 *
 * Kural yalnızca reddetmiyorsa işe yaramaz: doğru satırı da geçirmeli. İki
 * görsel aynı biçimde ve neredeyse aynı renkte — gerçek hayatta aynı ürünün iki
 * fotoğrafı.
 */
{
  const a = visualAgreement(dShoe, dShoeAgain);

  console.log(`  [ölçüm] ayakkabı↔ayakkabı: puan=${a.score} renk=${a.color} yapı=${a.structure}`);
  t(a.structure >= VISUAL_STRUCTURE_FLOOR, `yapı uyuyor (${a.structure})`);
  t(a.score >= VISUAL_CORROBORATION_FLOOR, `puan eşiği geçiyor (${a.score})`);
  t(visuallyCorroborated(a), "aynı ürünün iki fotoğrafı kanıt sayılıyor");
}

/*
 * 3) Kapı iki koşulu da istiyor — biri tek başına yetmiyor.
 *
 * Doğrudan sınanıyor çünkü asıl karar bu ve gerçek görsellerle her iki köşeyi
 * birden üretmek zor. Uydurma sayı değil, **kuralın kendisi** ölçülüyor.
 */
{
  t(!visuallyCorroborated({ score: 0.95, structure: 0.1 }), "yüksek puan, düşük yapı → hayır");
  t(!visuallyCorroborated({ score: 0.4, structure: 0.9 }), "düşük puan, yüksek yapı → hayır");
  t(visuallyCorroborated({ score: 0.7, structure: 0.5 }), "ikisi de yeterli → evet");
  t(!visuallyCorroborated(null), "ölçüm yoksa kanıt da yok");
  t(!visuallyCorroborated(undefined), "eksik ölçüm sessizce geçmiyor");
}

/*
 * 4) Sınırlar tam eşikte kapalı değil.
 *
 * `>=` mi `>` mü, tek başına önemsiz görünen ama eşiği yorumlayan bir karar:
 * eşik «bu değer yeterli» demek, «bu değeri aş» demek değil.
 */
{
  t(
    visuallyCorroborated({
      score: VISUAL_CORROBORATION_FLOOR,
      structure: VISUAL_STRUCTURE_FLOOR,
    }),
    "tam eşik yeterli sayılıyor",
  );
  t(
    !visuallyCorroborated({
      score: VISUAL_CORROBORATION_FLOOR - 0.01,
      structure: VISUAL_STRUCTURE_FLOOR,
    }),
    "eşiğin altı yeterli değil",
  );
}

console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
