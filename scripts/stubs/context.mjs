/**
 * Context.dev şeklinde bir sahte sunucu — canlı ürün yolunu anahtarsız sürmek için.
 *
 * SDK'nın konuştuğu iki uç: web.search ve web.extract. Döndürdüğü ürünler gerçek
 * değil, o yüzden buradan çıkan hiçbir sayı ölçüm sayılmaz. Amacı tek: canlı yol
 * baştan sona çalışıyor mu, kartlar gerçekten canlı veriden mi kuruluyor, ve bir
 * mağaza çöktüğünde kataloğa düşülüyor mu.
 */
import { createServer } from "node:http";
const PORT = Number(process.argv[2] ?? 4731);

const PRODUCTS = {
  "boyner.com.tr": { title: "Siyah Deri Mini Şort", price: 1299.9, brand: "Boyner" },
  "trendyol.com": { title: "Pembe Fermuarlı Triko Hırka", price: 749.5, brand: "Macharel" },
  "lcw.com": { title: "Yüksek Bel Skinny Jean", price: 599.99, brand: "LCW" },
  "asos.com": { title: "Ripped Boyfriend Jean", price: 45.0, brand: "ASOS" },
};

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = req.url ?? "";
    console.log(`${req.method} ${url} :: ${body.slice(0, 160)}`);
    const payload = JSON.parse(body || "{}");
    res.writeHead(200, { "content-type": "application/json" });

    if (url.includes("search")) {
      const domains = payload.includeDomains ?? [];
      const hits = domains
        .filter((d) => PRODUCTS[d])
        .map((d) => ({ url: `https://www.${d}/urun/ornek-p-1234567`, title: PRODUCTS[d].title }));
      res.end(JSON.stringify({ results: hits }));
      return;
    }

    if (url.includes("extract")) {
      const target = String(payload.urls?.[0] ?? payload.url ?? "");
      const host = Object.keys(PRODUCTS).find((d) => target.includes(d));
      const p = PRODUCTS[host] ?? null;
      // SDK `response.data.products` okuyor — sarmalayıcı `results` değil.
      res.end(
        JSON.stringify({
          data: p
            ? {
                products: [{
                  title: p.title, price: p.price, currency: "TRY", brand: p.brand,
                  imageUrl: `https://cdn.example.com/${host}.jpg`,
                  productUrl: target, inStock: true,
                }],
              }
            : { products: [] },
        }),
      );
      return;
    }

    res.end(JSON.stringify({}));
  });
});
server.listen(PORT, () => console.log(`stub-context :${PORT}`));
