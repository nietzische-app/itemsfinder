/**
 * Arayüz gerçekten çalışıyor mu? — `npm run check:ui`
 *
 *   npm run build && npm start          # başka bir kabukta
 *   npm run check:ui
 *   npm run check:ui -- --url http://127.0.0.1:3111
 *
 * ## Neden var
 *
 * Kimin için arandığını soran seçici eklendi, `tsc`, ESLint, 15 süit ve eval
 * yeşil geçti — ve seçici **çalışmıyordu**. Düğme doluyordu, `localStorage`
 * yazılıyordu, ama hiçbir istek gitmiyordu: tarama nöbetçisi yalnızca görsele
 * bakıyor, cinsiyet değişince tetiklenmiyordu. Seçim ancak sayfa yenilenince
 * devreye giriyordu.
 *
 * Hiçbir mevcut kapı bunu yakalayamazdı, çünkü hepsi tarayıcının dışında
 * çalışıyor. Bu betik o boşluk için var: **tıklama gerçekten bir istek üretiyor
 * mu**, ve yatay taşma var mı.
 *
 * ## Neden ayrı bir betik
 *
 * Playwright bu projenin bağımlılığı değil ve olmasını da istemiyoruz: tek bir
 * arayüz kontrolü için kurulum ağırlığı. Ortamda varsa çalışıyor, yoksa ne
 * yapılacağını söyleyip çıkıyor.
 */
import { parseArgs } from "./args.mjs";

const arg = parseArgs(process.argv.slice(2), { url: ["adres"] });

const base = (arg("url") ?? "http://127.0.0.1:3000").replace(/\/$/, "");

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  try {
    ({ chromium } = await import(
      process.env.PLAYWRIGHT_MODULE ?? "/opt/node22/lib/node_modules/playwright/index.mjs"
    ));
  } catch {
    console.log("\n✗ Playwright bulunamadı.\n");
    console.log("  Bu kontrol tarayıcı gerektiriyor ve Playwright bu projenin");
    console.log("  bağımlılığı değil — tek bir arayüz kontrolü için kurulum ağırlığı.\n");
    console.log("  Kurmak için:  npm i -D playwright && npx playwright install chromium");
    console.log("  Ya da var olan bir kurulumu göstermek için:");
    console.log("    PLAYWRIGHT_MODULE=/yol/playwright/index.mjs npm run check:ui\n");
    process.exit(1);
  }
}

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

const health = await fetch(base).catch(() => null);
if (!health?.ok) {
  console.log(`\n✗ ${base} cevap vermiyor.\n`);
  console.log("  Başka bir kabukta sunucuyu başlat:  npm run build && npm start\n");
  process.exit(1);
}

console.log(`\nArayüz kontrolü — ${base}\n`);

/** Analiz sayfası, oturumda bir görsel olmadan boş durum gösteriyor. */
const { readFileSync, readdirSync } = await import("node:fs");
const examples = readdirSync("public/examples").filter((name) => /\.(jpe?g|png|webp)$/i.test(name));
if (examples.length === 0) {
  console.log("✗ public/examples içinde görsel yok — kontrol çalıştırılamıyor.\n");
  process.exit(1);
}
const bytes = readFileSync(`public/examples/${examples[0]}`);
const dataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
});

async function open(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });

  const posted = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/detect") && request.method() === "POST") {
      try {
        posted.push(JSON.parse(request.postData() ?? "{}").gender ?? null);
      } catch {
        posted.push("(okunamadı)");
      }
    }
  });

  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.evaluate((url) => {
    sessionStorage.setItem("markas:pending-image", JSON.stringify({ dataUrl: url, fileName: "t.jpg" }));
    localStorage.removeItem("markas:kime");
  }, dataUrl);

  await page.goto(`${base}/analyze`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Kabul et/ }).click({ timeout: 4000 }).catch(() => {});
  await page.waitForSelector("text=Kimin için", { timeout: 60_000 });
  await page.waitForTimeout(1200);

  return { page, posted };
}

/*
 * 1) Yatay taşma — bu projenin duran kuralı.
 *
 * Her iki genişlikte de: `scrollWidth` ekranı aşarsa kullanıcı sağa kaydırmak
 * zorunda kalıyor ve mobilde bu, kartların yarısının görünmemesi demek.
 */
for (const [label, width, height] of [["mobil 390", 390, 844], ["masaüstü 1440", 1440, 900]]) {
  const { page } = await open(width, height);

  const size = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));

  t(size.scroll <= size.client, `${label}: yatay taşma yok (${size.scroll} ≤ ${size.client})`);

  const buttons = await page.getByRole("button", { name: /^(Fark etmez|Kadın|Erkek)$/ }).count();
  t(buttons === 3, `${label}: seçici üç düğmeyle çiziliyor (${buttons})`);

  await page.close();
}

/*
 * 2) Tıklama gerçekten bir tarama üretiyor mu?
 *
 * Asıl kontrol bu. Görüntü kontrolü seçicinin **var** olduğunu söylüyor;
 * çalıştığını yalnızca giden istek söylüyor. Kusur tam olarak buradaydı:
 * düğme doluyor, `localStorage` yazılıyor, hiçbir istek gitmiyordu.
 */
{
  const { page, posted } = await open(1440, 900);

  t(posted.length === 1, `ilk tarama bir kez çalışıyor (${posted.length})`);
  t(posted[0] === null || posted[0] === undefined, `başlangıçta seçim yok (${posted[0]})`);

  await page.getByRole("button", { name: "Kadın", exact: true }).click();
  await page.waitForSelector("text=Kimin için", { timeout: 60_000 });
  await page.waitForTimeout(2000);

  t(posted.length === 2, `seçim yeni bir tarama başlatıyor (${posted.length} istek)`);
  t(posted[1] === "kadın", `seçim isteğe giriyor: ${JSON.stringify(posted[1])}`);

  const stored = await page.evaluate(() => localStorage.getItem("markas:kime"));
  t(stored === "kadın", `seçim tarayıcıda saklanıyor (${stored})`);

  /*
   * Aynı seçime tekrar basmak yeni tarama başlatmamalı — nöbetçi anahtarı
   * yalnızca değişimde tetiklemeli, yoksa her tıklama bir Vision çağrısı.
   */
  await page.getByRole("button", { name: "Kadın", exact: true }).click();
  await page.waitForTimeout(1500);
  t(posted.length === 2, `aynı seçime tekrar basmak tarama başlatmıyor (${posted.length})`);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Kimin için", { timeout: 60_000 });
  await page.waitForTimeout(1500);

  const pressed = await page
    .getByRole("button", { name: "Kadın", exact: true })
    .getAttribute("aria-pressed");
  t(pressed === "true", `yenilemeden sonra seçim korunuyor (${pressed})`);

  await page.close();
}

await browser.close();

console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
console.log("");
process.exit(fails.length ? 1 : 0);
