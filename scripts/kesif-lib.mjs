/**
 * `check-kesif.mjs`'in karar veren kısmı — artık **üretim kodunun kendisi**.
 *
 * Bu dosya önce burada yazılmıştı ve gerçek mağazalara karşı üç koşu sürüldü.
 * Üretim aynı işi yapacaksa aynı kodu yapmalı: ikinci bir kopya, ölçülen
 * davranışla çalışan davranışın sessizce ayrışması demekti. Mantık
 * `src/lib/storeSearchPage.ts`'e taşındı; burada yalnızca takma ad çözümü için
 * ince bir kabuk kaldı.
 *
 * `scripts/stubs/kesif-check.mjs` buradan içe aktarmaya devam ediyor, yani o
 * ölçüm artık üretimi ölçüyor.
 */
import { register } from "node:module";

register(new URL("./alias-loader.mjs", import.meta.url).href);

export const {
  STORE_USER_AGENT: USER_AGENT,
  PROBE_SHAPES,
  fillTemplate,
  looksLikeWall,
  openSearchHref,
  openSearchUrlFromXml,
  pageDiagnosis,
  probeUrls,
  productLinks,
  searchActionTemplate,
} = await import("@/lib/storeSearchPage");
