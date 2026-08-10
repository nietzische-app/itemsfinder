/**
 * Ölçüm betiği yanlış bayrağı sessizce yutuyor mu? — `node scripts/stubs/args-check.mjs`
 *
 * Kusur ölçümün kendisinde yakalandı: iş akışının açılır menüsündeki adla
 * (`magaza`) çağrıldı, betik `--magaza`yı tanımadı, `--site` boş kaldı ve **on
 * dokuz mağazanın hepsi** ölçüldü. Çıktı düzgündü — yalnızca başka bir sorunun
 * cevabıydı.
 *
 * Bir ölçüm betiğinde bu, sıradan bir kullanım hatasından farklı: çıktı bir
 * karara dönüşüyor ve hangi soruyu sorduğumuz çıktıdan okunamıyor. O yüzden
 * ölçülen şey «doğru bayrak çalışıyor mu» değil, **yanlış bayrak duruyor mu**.
 */
import { parseArgs } from "../args.mjs";

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

const SPEC = { q: ["sorgu"], site: ["magaza"], url: ["adres"] };

/*
 * 1) Bilinen bayraklar — iki yazımda da.
 */
{
  const arg = parseArgs(["--q", "gri pantolon", "--site", "koton.com"], SPEC);
  t(arg("q") === "gri pantolon", `boşluklu değer okunuyor (${arg("q")})`);
  t(arg("site") === "koton.com", `--site okunuyor (${arg("site")})`);
  t(arg("url") === undefined, "verilmeyen bayrak undefined");

  const esit = parseArgs(["--q=gri pantolon", "--site=koton.com"], SPEC);
  t(esit("q") === "gri pantolon", `--ad=değer okunuyor (${esit("q")})`);
  t(esit("site") === "koton.com", "--ad=değer ikinci bayrakta da");
}

/*
 * 2) İş akışının kendi adları da geçerli.
 *
 * Actions ekranında `sorgu` ve `magaza` yazıyor. Orada gördüğü adı yazan kişi
 * haklı; betiğin `--q`/`--site` demesi bir uygulama ayrıntısı.
 */
{
  const arg = parseArgs(["--sorgu", "gri pantolon", "--magaza", "koton.com"], SPEC);
  t(arg("q") === "gri pantolon", `--sorgu, --q'ya bağlanıyor (${arg("q")})`);
  t(arg("site") === "koton.com", `--magaza, --site'a bağlanıyor (${arg("site")})`);
}

/*
 * 3) Asıl ölçüm: tanınmayan bayrak betiği durduruyor mu?
 *
 * `process.exit` yakalanıyor, çünkü ölçülen şey tam olarak **çıkış** — mesajı
 * kontrol etmek yetmez, sessizce devam eden bir betik de mesaj basabilirdi.
 */
{
  const gercekExit = process.exit;
  const gercekError = console.error;
  let kod = null;
  let mesaj = "";

  process.exit = (value) => {
    kod = value;
    throw new Error("__exit__");
  };
  console.error = (text) => {
    mesaj += text;
  };

  try {
    parseArgs(["--magza", "koton.com"], SPEC);
  } catch (error) {
    if (error.message !== "__exit__") throw error;
  } finally {
    process.exit = gercekExit;
    console.error = gercekError;
  }

  t(kod === 2, `tanınmayan bayrakta çıkılıyor (kod ${kod})`);
  t(mesaj.includes("--magza"), "hangi bayrağın tanınmadığı yazılıyor");
  t(mesaj.includes("--sorgu"), "kabul edilenler listeleniyor");
}

/*
 * 4) Bayrak gibi görünen **değer** yanlış alarm vermiyor.
 *
 * `--q "--indirimli pantolon"` gibi bir sorgu ya da bir adres kalıbı bayrakla
 * karışırsa, kontrol çalışan bir çağrıyı reddederdi — yani düzeltme yeni bir
 * kusur olurdu. Değer olarak tüketilen sözcük denetime girmiyor.
 */
{
  let kod = null;
  const gercekExit = process.exit;
  const gercekError = console.error;
  process.exit = (value) => {
    kod = value;
    throw new Error("__exit__");
  };
  console.error = () => {};

  let arg;
  try {
    arg = parseArgs(["--url", "--tuhaf-ama-deger", "--q", "gri"], SPEC);
  } catch (error) {
    if (error.message !== "__exit__") throw error;
  } finally {
    process.exit = gercekExit;
    console.error = gercekError;
  }

  t(kod === null, `bayrağa benzeyen değer reddedilmiyor (kod ${kod})`);
  t(arg?.("url") === "--tuhaf-ama-deger", `ve değer olarak okunuyor (${arg?.("url")})`);
  t(arg?.("q") === "gri", "sonraki bayrak da okunuyor");
}

console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
