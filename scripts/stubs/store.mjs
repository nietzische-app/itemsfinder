/**
 * Mağaza şeklinde bir sahte sunucu — `check:links`'i ağsız sürmek için.
 *
 *   node scripts/stubs/store.mjs 4741
 *   LINK_CHECK_BASE_URL=http://127.0.0.1:4741 npm run check:links
 *
 * Gerçek mağazaların ölü bağlantı verme biçimlerini taklit ediyor, çünkü hepsi
 * 404 dönmüyor:
 *
 *  - **404** — dürüst olanı.
 *  - **Yönlendirme** — kaldırılan ürün ana sayfaya atılıyor; istek 200 dönüyor,
 *    kullanıcı ürünü göremiyor. Sessiz olduğu için en tehlikelisi.
 *  - **HEAD'e 405** — sayfa duruyor ama HEAD desteklenmiyor; ölü sanılmamalı.
 *  - **403** — bot duvarı; yine ölü değil, sadece bize kapalı.
 *
 * Hangi yolun ne döndüğü yolun kendisinden okunuyor, böylece stub'ın hangi ürünü
 * bildiğini ayrıca ayarlamak gerekmiyor.
 */
import { createServer } from "node:http";

const PORT = Number(process.argv[2] ?? 4741);

const server = createServer((req, res) => {
  const url = req.url ?? "/";

  if (url.includes("olu-urun")) {
    res.writeHead(404).end("not found");
    return;
  }

  if (url.includes("kaldirilmis")) {
    // Ürün sayfasından ana sayfaya: 200 dönen ölü bağlantı.
    res.writeHead(302, { location: "/" }).end();
    return;
  }

  if (url.includes("head-yok") && req.method === "HEAD") {
    res.writeHead(405).end();
    return;
  }

  if (url.includes("bot-duvari") && req.method === "HEAD") {
    res.writeHead(403).end();
    return;
  }

  res.writeHead(200, { "content-type": "text/html" }).end("<html><head></head></html>");
});

server.listen(PORT, () => console.log(`stub-store :${PORT}`));
