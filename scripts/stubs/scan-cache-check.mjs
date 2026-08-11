/**
 * Önbellek doğru şeyi saklıyor mu? — `node scripts/stubs/scan-cache-check.mjs`
 *
 * ## Neden var
 *
 * Bu dosyanın ölçtüğü kural `scanCache.ts`'in kendi yorumunda yazılı: **sonucu
 * değiştiren her girdi anahtarın parçası olmalı.** Fotoğraf, örnek kimliği ve
 * cinsiyet seçimi zaten oradaydı; boru hattının kendisi değildi.
 *
 * Görünmüyordu, çünkü önbellek süreç-yereldi — her dağıtım yeni instance demek,
 * yani önbellek kendiliğinden temizleniyordu. Upstash canlıya geçince önbellek
 * dağıtımdan uzun yaşamaya başladı ve kusur ortaya çıktı: betimleme aşaması
 * eklendikten sonra bile aynı fotoğraf, aşama yokken hesaplanmış cevabını
 * vermeye devam etti. İki ayrı üretim ölçümü bu yüzden boşa gitti ve log'da
 * görünen tek şey şuydu:
 *
 *   {"ms":{"total":48},"degraded":["total:önbellekten döndü — yeni çağrı
 *    yapılmadı"],"rawDetections":0,"describedItems":0}
 *
 * Sıfır algılama ve 48 ms, «aşama çalıştı ama betimleyemedi» ile aynı sayıyı
 * gösteriyor (`describedItems: 0`) — yani kusur, çözmeye çalıştığımız sorunun
 * kılığına giriyordu.
 */
import { register } from "node:module";

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

register(new URL("../alias-loader.mjs", import.meta.url).href);
const { scanCacheKey } = await import("@/services/scanCache");

const photo = Buffer.from("bir fotoğrafın byte'ları");
const other = Buffer.from("başka bir fotoğraf");

const env = { ...process.env };
const set = (values) => {
  for (const name of ["VERCEL_DEPLOYMENT_ID", "VERCEL_GIT_COMMIT_SHA", "SCAN_CACHE_VERSION"]) {
    if (values[name] === undefined) delete process.env[name];
    else process.env[name] = values[name];
  }
};

/*
 * 1) Eskiden beri geçerli olan üç girdi hâlâ anahtarda.
 *
 * Yeni bir segment eklerken eskilerini düşürmek, sessizce yanlış cevap veren bir
 * önbellek üretirdi — ve bunu kimse fark etmezdi, çünkü hızlı cevap doğru cevap
 * gibi görünür.
 */
{
  set({});

  t(scanCacheKey(photo) === scanCacheKey(photo), "aynı girdi aynı anahtar");
  t(scanCacheKey(photo) !== scanCacheKey(other), "farklı fotoğraf farklı anahtar");
  t(
    scanCacheKey(photo, "ornek-1") !== scanCacheKey(photo, "ornek-2"),
    "örnek kimliği anahtarda",
  );
  t(
    scanCacheKey(photo, undefined, "kadın") !== scanCacheKey(photo, undefined, "erkek"),
    "cinsiyet seçimi anahtarda",
  );
}

/*
 * 2) **Dağıtım değişince anahtar değişiyor.**
 *
 * Asıl iddia bu. Boru hattı değiştiğinde eski cevap artık o fotoğrafın cevabı
 * değil — ve onu sunmak, değişikliği görünmez kılıyor.
 */
{
  set({ VERCEL_DEPLOYMENT_ID: "dpl_eski" });
  const before = scanCacheKey(photo);

  set({ VERCEL_DEPLOYMENT_ID: "dpl_yeni" });
  const after = scanCacheKey(photo);

  t(before !== after, "yeni dağıtım yeni anahtar üretiyor");

  set({ VERCEL_DEPLOYMENT_ID: "dpl_eski" });
  t(scanCacheKey(photo) === before, "aynı dağıtıma dönünce anahtar geri geliyor");
}

/*
 * 3) Sürüm sabitken anahtar da sabit.
 *
 * Her çağrıda değişen bir sürüm — zaman damgası, rastgele sayı — önbelleği
 * tamamen kapatırdı ve bunun tek belirtisi fatura olurdu. Değişmeyen bir
 * dağıtımda hiçbir şeyin değişmemesi, değişiklikte değişmesi kadar önemli.
 */
{
  set({ VERCEL_DEPLOYMENT_ID: "dpl_sabit" });
  const keys = new Set([scanCacheKey(photo), scanCacheKey(photo), scanCacheKey(photo)]);
  t(keys.size === 1, `sabit dağıtımda anahtar sabit (${keys.size} farklı)`);
}

/*
 * 4) Kaynak sırası: dağıtım kimliği, yoksa commit, yoksa elle verilen sürüm.
 *
 * Vercel dışında da çalışması gerekiyor — bir GitHub Actions çalıştırması ya da
 * kendi sunucusunda duran bir dağıtım, dağıtım kimliği görmez.
 */
{
  set({ VERCEL_GIT_COMMIT_SHA: "abc123" });
  const byCommit = scanCacheKey(photo);

  set({ VERCEL_GIT_COMMIT_SHA: "def456" });
  t(scanCacheKey(photo) !== byCommit, "commit değişince anahtar değişiyor");

  set({ SCAN_CACHE_VERSION: "elle-2" });
  const byManual = scanCacheKey(photo);
  set({ SCAN_CACHE_VERSION: "elle-3" });
  t(scanCacheKey(photo) !== byManual, "elle verilen sürüm de işliyor");

  // Dağıtım kimliği varken commit'e bakılmıyor — ikisi de değişse tek karar.
  set({ VERCEL_DEPLOYMENT_ID: "dpl_a", VERCEL_GIT_COMMIT_SHA: "sha_a" });
  const withBoth = scanCacheKey(photo);
  set({ VERCEL_DEPLOYMENT_ID: "dpl_a", VERCEL_GIT_COMMIT_SHA: "sha_b" });
  t(scanCacheKey(photo) === withBoth, "dağıtım kimliği varken commit anahtarı bozmuyor");
}

/*
 * 5) Yerel geliştirmede sürüm sabit.
 *
 * Hiçbir değişken yokken her `next dev` yeniden başlatmasında önbelleği
 * düşürmenin faydası yok: orada zaten süreç-yerel ve zaten ölüyor. Sabit
 * kalması, yerel davranışın bu değişiklikten hiç etkilenmediği anlamına
 * geliyor.
 */
{
  set({});
  t(/^scan:v1:/.test(scanCacheKey(photo)), `yerelde sürüm sabit: ${scanCacheKey(photo)}`);
}

/*
 * 6) Sır anahtara düşmüyor.
 *
 * Dağıtım kimliği sır değil, ama anahtar Redis'te düz metin duruyor ve buraya
 * ne konduğuna dikkat etmenin maliyeti sıfır. Kimlik özetleniyor, olduğu gibi
 * yazılmıyor.
 */
{
  set({ VERCEL_DEPLOYMENT_ID: "dpl_gizli_olabilir" });
  t(!scanCacheKey(photo).includes("dpl_gizli_olabilir"), "dağıtım kimliği özetleniyor");
}

set(env);
console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
