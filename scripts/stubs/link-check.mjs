/**
 * Bağlantı kontrolünün sınırları — `node scripts/stubs/link-check.mjs`.
 *
 * 404 dönen bir bağlantıyı yakalamak kolay; asıl mesele mağazaların ölü bağlantı
 * verme biçimlerinin hepsi 404 olmaması:
 *
 *  - Kaldırılan ürün ana sayfaya **yönlendiriliyor** — istek 200 dönüyor,
 *    kullanıcı ürünü göremiyor. Sessiz olduğu için en tehlikelisi.
 *  - Sayfa duruyor ama **HEAD desteklenmiyor** (405) — ölü sanılmamalı.
 *  - **Bot duvarı** (403) — yine ölü değil, sadece bize kapalı.
 *
 * Sunucu `scripts/stubs/store.mjs` ile ayağa kalkıyor; bu dosya onu sürüp
 * kararların doğru çıktığını ölçüyor.
 */
import { register } from "node:module";
import { spawn } from "node:child_process";

register(new URL("../alias-loader.mjs", import.meta.url).href);

const PORT = 4742;
const BASE = `http://127.0.0.1:${PORT}`;
const server = spawn("node", [new URL("./store.mjs", import.meta.url).pathname, String(PORT)], {
  stdio: "ignore",
});
await new Promise((resolve) => setTimeout(resolve, 800));

const { probe, judge } = await import("../check-links.mjs");

const CASES = [
  ["canlı ürün", "/urun/kirmizi-elbise-p-123", true, ""],
  ["404", "/urun/olu-urun-p-123", false, "HTTP 404"],
  ["ana sayfaya yönlendirme", "/urun/kaldirilmis-p-123", false, "ürün sayfasından uzağa yönlendirildi"],
  ["HEAD desteklenmiyor", "/urun/head-yok-p-123", true, ""],
  ["bot duvarı", "/urun/bot-duvari-p-123", true, ""],
];

let pass = 0;
const fails = [];

for (const [name, path, wantOk, wantNote] of CASES) {
  const url = `${BASE}${path}`;
  const verdict = judge(url, await probe(url));
  if (verdict.ok === wantOk && verdict.note === wantNote) pass += 1;
  else fails.push(`${name}: beklenen ok=${wantOk} «${wantNote}», çıkan ok=${verdict.ok} «${verdict.note}»`);
}

// Ulaşılamayan sunucu: ölü sayılmalı, ama çökmeden.
{
  const verdict = judge("http://127.0.0.1:1/x", await probe("http://127.0.0.1:1/x"));
  if (verdict.ok === false) pass += 1;
  else fails.push("ulaşılamayan sunucu ölü sayılmalı");
}

server.kill();
console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
