/**
 * Arama merdiveni — `node scripts/stubs/search-ladder-check.mjs`.
 *
 * Canlı arama tek bir sorgu deniyordu: renk + malzeme + desen + ürün adı. Bir
 * mağazada o kombinasyonun tam karşılığı yoksa sonuç sıfır oluyordu, yani
 * kullanıcı «beyaz keten oversize gömlek» için boş ekran görüyordu — oysa aynı
 * mağazada onlarca gömlek var.
 *
 * Merdiven gerçekten gevşiyor mu, ve gereğinden fazla arama yapıyor mu?
 *
 * Sahte istemci yalnızca **belirli** sorgulara sonuç dönüyor, böylece "tam sorgu
 * boş, gevşek sorgu dolu" durumu gerçekten kuruluyor.
 */
import { register } from "node:module";
register(new URL("../alias-loader.mjs", import.meta.url).href);
const { ContextDevService } = await import("@/services/contextDevService");

let pass = 0; const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

function make(matcher) {
  const svc = new ContextDevService("stub");
  const calls = [];
  svc.client = {
    web: {
      search: async ({ query, includeDomains }) => {
        calls.push({ query, includeDomains });
        return { results: matcher(query).map((u) => ({ url: u })) };
      },
      extract: async ({ url }) => ({
        data: { products: [{ title: "Ürün", price: 100, currency: "TRY", productUrl: url }] },
      }),
    },
  };
  return { svc, calls };
}

// 1) Tam sorgu doluysa tek arama.
{
  const { svc, calls } = make(() => [
    "https://www.trendyol.com/a-p-1111111",
    "https://www.boyner.com.tr/b-p-2222222",
  ]);
  await svc.searchLiveProducts(["beyaz keten gömlek", "gömlek"], "clothing");
  t(calls.length === 1, "tam sorgu doluysa tek arama");
}

// 2) Tam sorgu boşsa gevşek sorgu deneniyor ve sonuç dönüyor.
{
  const { svc, calls } = make((q) =>
    /^gömlek /.test(q)
      ? ["https://www.trendyol.com/c-p-3333333", "https://www.lcw.com/d-o-44444"]
      : [],
  );
  const out = await svc.searchLiveProducts(["beyaz keten gömlek", "gömlek"], "clothing");
  t(calls.length === 2, "tam sorgu boşsa ikinci basamak deneniyor");
  t(/^gömlek /.test(calls[1].query), "ikinci basamak gevşek sorgu");
  t(out.length > 0, "gevşek sorgudan ürün dönüyor");
}

// 3) Türkiye hiç bulamazsa global katmana geçiliyor.
{
  const { svc, calls } = make((q) =>
    /buy price/.test(q) ? ["https://www.asos.com/prd/1234567"] : [],
  );
  await svc.searchLiveProducts(["nadir parça"], "clothing");
  t(calls.some((c) => c.includeDomains.includes("asos.com")), "global katmana geçiliyor");
}

// 4) Arama sayısı sınırı aşılmıyor.
{
  const { svc, calls } = make(() => []);
  await svc.searchLiveProducts(["a", "b", "c"], "clothing");
  t(calls.length <= 3, `arama sınırı korunuyor (${calls.length} <= 3)`);
}

// 5) Türkiye'de gevşek sonuç, globaldeki tam sonuçtan önce geliyor.
{
  const { svc, calls } = make((q) =>
    /satın al/.test(q) && /^gömlek /.test(q)
      ? ["https://www.trendyol.com/e-p-5555555", "https://www.lcw.com/f-o-66666"]
      : /buy price/.test(q)
        ? ["https://www.asos.com/prd/7654321"]
        : [],
  );
  const out = await svc.searchLiveProducts(["beyaz keten gömlek", "gömlek"], "clothing");
  t(out.every((c) => !c.merchantDomain.includes("asos")), "Türkiye gevşek sonucu globalden önce");
  t(calls.every((c) => /satın al/.test(c.query)), "global hiç aranmadı");
}

console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
