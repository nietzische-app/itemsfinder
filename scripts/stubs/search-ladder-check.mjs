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

/*
 * 6) Harcanan her arama rapor ediliyor — ve raporun sayıları doğru.
 *
 * Merdivenin parasını hak edip etmediği yalnızca bu kayıtla yargılanabiliyor
 * (`BULUNAMADI.md` madde 4). Kaydın kendisi yanlışsa, kararı yanlış sayıya
 * dayandırırız; o yüzden burada test edilen şey «kayıt var mı» değil, **kaydın
 * gerçekten olan biteni anlatıp anlatmadığı**.
 */
{
  const { svc } = make((q) =>
    /^gömlek /.test(q)
      ? ["https://www.trendyol.com/g-p-7777777", "https://www.lcw.com/h-o-88888"]
      : [],
  );
  const seen = [];
  await svc.searchLiveProducts(["beyaz keten gömlek", "gömlek"], "clothing", undefined, (a) =>
    seen.push(a),
  );

  t(seen.length === 2, `her arama rapor ediliyor (${seen.length} === 2)`);
  t(
    seen.every((a) => typeof a.ms === "number" && a.ms >= 0),
    `her aramanın süresi yazılıyor: ${JSON.stringify(seen.map((a) => a.ms))}`,
  );
  t(
    seen[0]?.tier === "tr" && seen[0]?.rung === 0 && seen[0]?.found === 0,
    `boş dönen tam sorgu 0 aday olarak yazılıyor (${JSON.stringify(seen[0])})`,
  );
  t(
    seen[1]?.rung === 1 && seen[1]?.found === 2,
    `kurtaran basamak kendi kazancıyla yazılıyor (${JSON.stringify(seen[1])})`,
  );
  t(
    seen.every((a) => a.query.includes("satın al")),
    "rapor edilen sorgu, mağazaya gerçekten gönderilen dize",
  );
}

// 7) Aynı adayı ikinci kez bulan basamak kazanç yazmıyor — kredi boşa gitti demek.
{
  const { svc } = make(() => ["https://www.trendyol.com/i-p-9999999"]);
  const seen = [];
  await svc.searchLiveProducts(["tam sorgu", "gevşek"], "clothing", undefined, (a) => seen.push(a));

  t(seen.length >= 2, `tek aday MIN_LOCAL_CANDIDATES'i karşılamıyor (${seen.length} >= 2)`);
  t(seen[0]?.found === 1, "ilk basamak bulduğu adayı yazıyor");
  t(seen[1]?.found === 0, `tekrar bulunan aday kazanç sayılmıyor (${seen[1]?.found})`);
}

// 8) Geri çağrı verilmezse arama yine çalışıyor — kayıt isteğe bağlı.
{
  const { svc } = make(() => [
    "https://www.trendyol.com/j-p-1212121",
    "https://www.boyner.com.tr/k-p-3434343",
  ]);
  const out = await svc.searchLiveProducts(["gömlek"], "clothing");
  t(out.length > 0, "geri çağrısız çağrı bozulmuyor");
}

/*
 * 9) Bir basamağın hata vermesi merdiveni bitirmemeli — ve harcanan çağrı
 *    muhasebeye yazılmalı.
 *
 * Üretimden gelen kayıt: Türkiye katmanındaki sorgu 400 aldı, dıştaki `try`
 * bütün döngüyü iptal etti, global katman hiç denenmedi ve log `searchCount: 0`
 * yazdı — üç çağrı harcanmışken. Bir mağaza kümesinin isteği reddetmesi, öteki
 * kümenin denenmemesi için gerekçe değil; ve harcanmış çağrı harcanmıştır.
 */
{
  const svc = new ContextDevService("stub");
  const calls = [];
  svc.client = {
    web: {
      search: async ({ query, includeDomains }) => {
        calls.push({ query, includeDomains });
        // Türkiye katmanı reddediyor, global katman çalışıyor.
        if (/satın al/.test(query)) throw Object.assign(new Error("400"), {
          status: 400,
          error: { message: "includeDomains too long" },
        });
        return { results: [{ url: "https://www.asos.com/prd/1234567" }] };
      },
      extract: async ({ url }) => ({
        data: { products: [{ title: "Ürün", price: 100, currency: "TRY", productUrl: url }] },
      }),
    },
  };

  const seen = [];
  const out = await svc.searchLiveProducts(["nadir parça"], "clothing", undefined, (a) =>
    seen.push(a),
  );

  t(calls.length >= 2, `hata sonrası global katman denendi (${calls.length} çağrı)`);
  t(out.length > 0, "global katmandan ürün döndü — merdiven iptal olmadı");
  t(seen.length === calls.length, `harcanan her çağrı yazıldı (${seen.length}/${calls.length})`);
  t(
    seen.some((a) => typeof a.error === "string" && /includeDomains/.test(a.error)),
    `hata gerekçesi muhasebeye geçti: ${JSON.stringify(seen.map((a) => a.error))}`,
  );
  // Başarısız çağrı da zaman harcadı; süresi yazılmazsa «nereye gitti» eksik kalır.
  t(
    seen.every((a) => typeof a.ms === "number"),
    `başarısız çağrının süresi de yazıldı: ${JSON.stringify(seen.map((a) => a.ms))}`,
  );
}

// 10) Alan adı listesi tavana kırpılıyor — 12 alan adlı liste 10'a iniyor.
{
  const { svc, calls } = make(() => []);
  await svc.searchLiveProducts(["gömlek"], "clothing");
  t(
    calls[0].includeDomains.length <= 10,
    `alan adı listesi kırpıldı (${calls[0].includeDomains.length} <= 10)`,
  );
  t(calls[0].includeDomains.includes("trendyol.com"), "öncelikli mağazalar korundu");
}

/*
 * 11) Anahtar reddedilince merdiven durmalı — ve durduğunu söylemeli.
 *
 * Üretimden gelen kayıt: kredisi biten bir anahtarla dört parça için **12** arama
 * yapıldı, on ikisi de `401 USAGE_EXCEEDED` aldı. Merdiven her basamağı ve her
 * katmanı denemeye devam ediyordu, çünkü hata «bu sorgu tutmadı» ile «bu anahtar
 * çalışmıyor» arasında ayrım yapmıyordu. Sorguyu değiştirmek 401'i çözmez.
 */
{
  const svc = new ContextDevService("stub");
  const calls = [];
  svc.client = {
    web: {
      search: async ({ query }) => {
        calls.push(query);
        throw Object.assign(new Error("401"), {
          status: 401,
          error: { message: "The key's credits have been completely depleted.", error_code: "USAGE_EXCEEDED" },
        });
      },
      extract: async () => ({ data: { products: [] } }),
    },
  };

  const seen = [];
  await svc.searchLiveProducts(["a", "b", "c"], "clothing", undefined, (x) => seen.push(x));
  t(calls.length === 1, `401 sonrası merdiven durdu (${calls.length} çağrı, 3 değil)`);
  t(seen.length === 1 && Boolean(seen[0]?.error), "duran çağrı muhasebeye yazıldı");

  // İkinci parça hiç sormamalı: aynı anahtar, aynı cevap.
  const before = calls.length;
  const seen2 = [];
  await svc.searchLiveProducts(["d"], "clothing", undefined, (x) => seen2.push(x));
  t(calls.length === before, `sonraki parça hiç sormadı (${calls.length - before} çağrı)`);
  t(
    seen2.some((x) => /çağrı yapılmadı/.test(x.error ?? "")),
    `yapılmayan çağrı da yazıldı: ${JSON.stringify(seen2.map((x) => x.error))}`,
  );
}

// 12) Geçici hata merdiveni durdurmuyor — 500 ile 401 aynı şey değil.
{
  const svc = new ContextDevService("stub");
  const calls = [];
  svc.client = {
    web: {
      search: async ({ query }) => {
        calls.push(query);
        if (/satın al/.test(query)) throw Object.assign(new Error("500"), { status: 500 });
        return { results: [{ url: "https://www.asos.com/prd/1234567" }] };
      },
      extract: async ({ url }) => ({
        data: { products: [{ title: "Ürün", price: 100, currency: "TRY", productUrl: url }] },
      }),
    },
  };

  const out = await svc.searchLiveProducts(["nadir"], "clothing");
  t(calls.length >= 2, `500 sonrası merdiven yürüdü (${calls.length} çağrı)`);
  t(out.length > 0, "geçici hatadan sonra global katman sonuç verdi");
}

console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
