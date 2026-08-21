/**
 * Mağaza kanalı geri çekiliyor mu? — `node scripts/stubs/store-ladder-check.mjs`
 *
 * ## Neden var
 *
 * Üretimde ölçüldü:
 *
 *   «Antrasit bot»   → 62 ürün sayfası, hiçbiri eşleşmedi (eşofman geldi)
 *   «Antrasit şapka» → 35 ürün sayfası, hiçbiri eşleşmedi (tişört geldi)
 *
 * Mağazanın kendi arama motoru sorguyu VEYA olarak okuyor ve renk baskın
 * çıkıyor: «antrasit» yüzlerce üründe geçiyor, «bot» birkaçında. Sonuç,
 * kategorinin tamamı — ve içinde aranan şey yok.
 *
 * Merdivenin son basamağı tam bunun için vardı: renksiz, yalnız isim. Ama
 * mağaza kanalı **yalnızca ilk basamağı** deniyordu. Gerekçesi yazılıydı — «her
 * basamak mağaza başına bir HTTP isteği» — ve makul bir öngörüydü; ölçüm
 * çürüttü. Hazır bir çözüm, kullanılmadan duruyordu.
 *
 * ## Ne ölçüyor
 *
 * Geri çekilmenin gerçekten olduğunu, **ve yalnızca gerektiğinde** olduğunu.
 * İlk basamak iş görüyorsa ikinci istek atmak, ölçülmüş bir maliyeti
 * karşılıksız ödemek olurdu.
 */
import { createServer } from "node:http";
import { register } from "node:module";

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

/** Mağazaya gerçekten giden sorgular. */
const asked = [];

/**
 * Sahte mağaza: sorguda renk varsa **alakasız** ürünler döndürüyor.
 *
 * Gerçek davranışın taklidi bu: Koton «antrasit bot» için eşofman döndürdü,
 * hiç sonuç döndürmedi değil. Boş dönen bir sahte mağaza kusuru gizlerdi —
 * geri çekilme «sıfır sonuç» yüzünden değil, «gelenler alakasız» yüzünden
 * gerekiyor.
 */
let base = "";
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const [, host, ...rest] = url.pathname.split("/");
  const path = `/${rest.join("/")}`;

  if (path === "/") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(
      `<html><head><script type="application/ld+json">${JSON.stringify({
        "@type": "WebSite",
        potentialAction: {
          "@type": "SearchAction",
          target: `${base}/${host}/ara?q={search_term_string}`,
        },
      })}</script></head><body>ana sayfa</body></html>`,
    );
    return;
  }

  if (path === "/ara") {
    const q = url.searchParams.get("q") ?? "";
    asked.push(q);

    // Renkli sorgu → eşofman. Renksiz «bot» → gerçekten bot.
    const slug = /antrasit/i.test(q)
      ? "sardonlu-cepli-rahat-kalip-esofman-alti-antrasit"
      : "deri-bilekte-bot-siyah";

    res.writeHead(200, { "content-type": "text/html" });
    res.end(
      `<html><body>${Array.from(
        { length: 3 },
        (_, i) => `<a href="/${host}/urun/${slug}-p-1234567${i}">ürün ${i}</a>`,
      ).join("")}</body></html>`,
    );
    return;
  }

  res.writeHead(404);
  res.end("yok");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
base = `http://127.0.0.1:${server.address().port}`;

process.env.STORE_SEARCH_BASE_URL = base;
process.env.ENABLE_STORE_SEARCH = "true";
process.env.STORE_SEARCH_DOMAINS = "magaza-bir.com";
delete process.env.ENABLE_PRODUCT_INDEX;
delete process.env.ENABLE_GOOGLE_CSE;
delete process.env.ENABLE_VISION_LENS;

register(new URL("../alias-loader.mjs", import.meta.url).href);
const { ContextDevProductProvider } = await import("@/services/productProvider");
const { createTrace } = await import("@/lib/scanTrace");

const itemOf = (label, itemType, colorHex) => ({
  id: "i1",
  label,
  itemType,
  category: "clothing",
  attributes: "",
  description: "",
  confidence: 0.9,
  boundingBox: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
  colorHex,
  family: "footwear",
  products: [],
});

/** Taramayı sürüp mağazaya giden sorguları döndürüyor. */
async function scan(item) {
  asked.length = 0;
  const trace = createTrace({ detail: true });

  // context.dev yok: ücretsiz kanalların tek başına çalıştığı hâl — üretimdeki hâl.
  const provider = new ContextDevProductProvider(null, { deadlineMs: 15_000 });
  await provider.enrich(
    { items: [item], productSource: "mock", liveItemCount: 0, source: "google-vision" },
    { trace },
  );

  const searches = trace.snapshot().searches?.filter((s) => s.source === "mağaza") ?? [];
  return { asked: [...asked], searches };
}

/*
 * 1) **Renk sorguyu bozduğunda geri çekiliyor.**
 *
 * Asıl iddia. İlk basamak renkli ve mağaza kategoriyi döndürüyor; hiçbiri
 * eşleşmiyor. Merdivenin renksiz basamağı denenmezse aşama burada biterdi — ve
 * üretimde tam olarak bu oluyordu.
 */
{
  const { asked: queries, searches } = await scan(itemOf("Antrasit bot", "Boot", "#3c3e44"));

  t(queries.length > 1, `birden fazla basamak deneniyor (${queries.length}: ${queries.join(" | ")})`);
  t(/antrasit/i.test(queries[0] ?? ""), `ilk basamak renkli: «${queries[0]}»`);
  t(
    queries.some((q) => !/antrasit/i.test(q)),
    `renksiz basamak da deneniyor: ${queries.join(" | ")}`,
  );

  // İz her basamağı ayrı kaydediyor — panelde hangi basamağın işe yaradığı görünsün.
  t(
    searches.some((s) => s.rung === 0) && searches.some((s) => (s.rung ?? 0) > 0),
    `basamaklar ize ayrı ayrı yazılıyor: ${searches.map((s) => `${s.rung}=${s.found}`).join(", ")}`,
  );
  t(
    searches.some((s) => s.found > 0),
    `renksiz basamak aday üretiyor: ${searches.map((s) => `${s.rung}=${s.found}`).join(", ")}`,
  );
}

/*
 * 2) **İlk basamak iş görüyorsa ikinci istek atılmıyor.**
 *
 * Geri çekilmenin bedeli mağaza başına bir HTTP isteği ve o bedel yalnızca
 * zaten başarısız olmuş bir aramada ödenmeli. Bu kontrol olmasaydı, «her zaman
 * bütün merdiveni yürü» de yeşil kalırdı — yani ölçüm, düzeltmenin maliyetini
 * hiç sınamamış olurdu.
 */
{
  const { asked: queries } = await scan(itemOf("Siyah bot", "Boot", "#111111"));

  t(queries.length === 1, `ilk basamak tutunca tek istek (${queries.length}: ${queries.join(" | ")})`);
  t(!/antrasit/i.test(queries[0] ?? ""), `sorgu beklenen dize: «${queries[0]}»`);
}

server.close();
console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
