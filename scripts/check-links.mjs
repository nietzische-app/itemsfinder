/**
 * Doğrulanmış ürün bağlantıları hâlâ açılıyor mu?
 *
 *   npm run check:links
 *   npm run check:links -- --json     makineye okunur çıktı
 *
 * **Neden ayrı bir betik.** `check:pdp` adresin **şeklini** doğruluyor — ürün
 * sayfası mı, arama sayfası mı. Şekli doğru olan bir adres 404 dönebilir ve
 * dönüyor da: mağazalar ürünü kaldırıyor, koleksiyon değiştiriyor, URL'i
 * döndürüyor. `VERIFIED_PDP_URLS` elle doldurulan bir dosya, yani yazıldığı gün
 * doğru olması yarın da doğru olduğu anlamına gelmiyor.
 *
 * **Ağ gerektiriyor, o yüzden CI'da değil senin makinende.** Bu betiğin yazıldığı
 * ortamdan hiçbir mağazaya yol yok; şekli `LINK_CHECK_BASE_URL` ile sahte bir
 * sunucuya çevrilerek sürüldü (`scripts/stubs/README.md`).
 *
 * Hiçbir şeyi otomatik silmiyor. Ölü bir bağlantıyı dosyadan çıkarmak bir karar —
 * ürün geçici olarak stokta olmayabilir, mağaza bot duvarı koymuş olabilir — ve
 * bu betik o kararı sana bırakıp yalnızca durumu bildiriyor.
 */
import { register } from "node:module";

register(new URL("./alias-loader.mjs", import.meta.url).href);

const { VERIFIED_PDP_URLS } = await import("@/data/verifiedProductUrls");

const JSON_OUT = process.argv.includes("--json");
const TIMEOUT_MS = 15_000;

/**
 * Test için adresin ana bilgisayarını değiştirir.
 *
 * `VISION_BASE_URL`, `VLM_BASE_URL` ve `CONTEXT_DEV_BASE_URL` ile aynı desen ve
 * aynı gerekçe: ağ gerektiren bir betiğin çalıştığını, ağ olmadan da görebilmek.
 * Üretimde boş.
 */
const BASE_OVERRIDE = process.env.LINK_CHECK_BASE_URL?.trim().replace(/\/$/, "") ?? "";

function requestUrl(pdpUrl) {
  if (!BASE_OVERRIDE) return pdpUrl;
  const parsed = new URL(pdpUrl);
  return `${BASE_OVERRIDE}${parsed.pathname}${parsed.search}`;
}

const entries = Object.entries(VERIFIED_PDP_URLS);

if (entries.length === 0) {
  console.error("\nVERIFIED_PDP_URLS boş — kontrol edilecek bağlantı yok.\n");
  process.exit(1);
}

/**
 * Bir sayfanın açılıp açılmadığı.
 *
 * Önce `HEAD`, sonra gerekirse `GET`: bazı mağazalar HEAD'e 405 ya da 403
 * dönüyor ve bu, sayfanın olmadığı anlamına gelmiyor. Tarayıcı `user-agent`'ı
 * veriliyor çünkü çıplak bir isteğe bot duvarı çıkaran mağazalar var — amaç
 * kullanıcının göreceği sayfayı sorgulamak.
 */
export async function probe(url) {
  const headers = {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "accept-language": "tr-TR,tr;q=0.9",
  };

  for (const method of ["HEAD", "GET"]) {
    try {
      const response = await fetch(url, {
        method,
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      // HEAD'i desteklemeyen mağazalarda GET'e geçiliyor; başka her şey cevaptır.
      if (method === "HEAD" && (response.status === 405 || response.status === 403)) {
        continue;
      }
      return { ok: response.ok, status: response.status, finalUrl: response.url };
    } catch (error) {
      if (method === "GET") {
        return { ok: false, status: 0, reason: error instanceof Error ? error.message : String(error) };
      }
    }
  }

  return { ok: false, status: 0, reason: "cevap yok" };
}

/**
 * Bir bağlantının durumu — cevap **ve** nereye düştüğü.
 *
 * Yönlendirme, ölü bağlantının en sessiz hâli: mağazalar kaldırılan ürünü 404
 * yerine ana sayfaya ya da kategoriye atıyor, istek 200 dönüyor ve kullanıcı
 * ürünü göremiyor. Yolun **kısalması** bunun işareti — `/urun/elbise-p-123` iken
 * `/` ya da `/kadin`e düşmüşse gidilen yer artık o ürün değil. Yolun uzaması ya
 * da değişmesi (dil eki, kanonik hâl) yönlendirme sayılmıyor.
 */
export function judge(url, result) {
  let redirectedAway = false;
  if (result.ok && result.finalUrl) {
    try {
      const from = new URL(url).pathname.replace(/\/$/, "");
      const to = new URL(result.finalUrl).pathname.replace(/\/$/, "");
      redirectedAway = to !== from && from.startsWith(to);
    } catch {
      // Ayrıştırılamayan bir adres zaten "şüpheli" sayılıyor.
    }
  }

  return {
    status: result.status,
    ok: Boolean(result.ok) && !redirectedAway,
    note: redirectedAway
      ? "ürün sayfasından uzağa yönlendirildi"
      : result.ok
        ? ""
        : (result.reason ?? `HTTP ${result.status}`),
  };
}

/** Doğrudan çalıştırıldığında rapor bas; içe aktarıldığında yalnızca yardımcıları ver. */
const RUN = process.argv[1]?.endsWith("check-links.mjs") ?? false;
if (!RUN) {
  // Test dosyası yalnızca `probe` ve `judge` için içe aktarıyor.
} else {
const rows = [];

for (const [productId, url] of entries) {
  const target = requestUrl(url);
  const result = await probe(target);
  // Yönlendirme kararı gerçek adrese göre veriliyor; stub yolu değiştirmiyor.
  const verdict = judge(BASE_OVERRIDE ? target : url, result);

  rows.push({ productId, url, ...verdict });
}

if (JSON_OUT) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const dead = rows.filter((row) => !row.ok);
  console.log(`\n${rows.length - dead.length}/${rows.length} bağlantı açılıyor.\n`);

  for (const row of rows) {
    console.log(`  ${row.ok ? "✓" : "✗"} ${row.productId.padEnd(22)} ${row.note || row.status}`);
  }

  if (dead.length > 0) {
    console.log(
      "\n" +
        "Ölü bağlantılar otomatik silinmiyor — bu bir karar. Ürün geçici olarak\n" +
        "stokta olmayabilir ya da mağaza bot duvarı koymuş olabilir; ikisi de\n" +
        "adresin yanlış olduğu anlamına gelmiyor.\n" +
        "\n" +
        "  1. Bağlantıyı tarayıcıda aç.\n" +
        "  2. Ürün gerçekten yoksa src/data/verifiedProductUrls.ts içinden çıkar —\n" +
        "     bağlantısı olmayan ürün CTA'sız çiziliyor, kırık bağlantıdan iyi.\n" +
        "  3. Yerine yenisini bulduysan aynı satıra yaz.\n",
    );
  }
}

// Ölü bağlantı bir hata değil, bir bulgu: çıkış kodu yalnızca betik çalışamazsa
// sıfırdan farklı olur. Aksi hâlde bir mağazanın geçici kesintisi CI'ı kırardı.
process.exit(0);
}
