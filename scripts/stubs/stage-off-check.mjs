/**
 * Kapalı bir aşama kendini söylüyor mu? — `node scripts/stubs/stage-off-check.mjs`
 *
 * Üretimden gelen kayıt: `describedItems: 0`, ve `degraded` bu konuda tek kelime
 * etmiyor. Sebebi, uyarının `extractor &&` ile korumalı olmasıydı — aşama hiç
 * kurulmadığında hiçbir not düşülmüyordu.
 *
 * Panelde ayırt edilemeyen iki bambaşka durum doğuyor:
 *
 *   «aşama kapalı»              → yapılandırma eksiği, bir ortam değişkeni
 *   «çalıştı ama betimleyemedi» → doğruluk sorunu, model kırpımı okuyamadı
 *
 * İkisine bakarken yapılacak iş farklı, o yüzden ayrımın taşınması gerekiyor.
 * Burada ölçülen tek şey bu: sıfır betimleme her zaman bir gerekçeyle geliyor mu.
 */
import { register } from "node:module";
register(new URL("../alias-loader.mjs", import.meta.url).href);

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

const { createTrace } = await import("@/lib/scanTrace");
const { getAttributeExtractor } = await import("@/services/attributeExtractor");

/**
 * `visualSearch` içindeki karar, aynı koşullarla.
 *
 * Boru hattının tamamını sürmek bir Vision anahtarı ister; ölçülen şey ise o
 * kararın kendisi — hangi durumda hangi not düşülüyor.
 */
function noteFor({ budgetConstrained }) {
  const trace = createTrace({ detail: false });
  const extractor = budgetConstrained ? null : getAttributeExtractor();

  if (budgetConstrained) {
    trace.degrade("vlm", "günlük bütçe eşiğinde — ücretli aşama atlandı");
  } else if (!extractor) {
    const reason = !process.env.ANTHROPIC_API_KEY?.trim()
      ? "ANTHROPIC_API_KEY yok"
      : "ENABLE_VLM_ATTRIBUTES=true değil";
    trace.degrade(
      "vlm",
      `öznitelik betimlemesi kapalı (${reason}) — ölçülen renge ve Vision sınıfına düşüldü`,
    );
  }

  return trace.snapshot().degraded.filter((entry) => entry.stage === "vlm");
}

// 1) Anahtar yok → gerekçe anahtarı adıyla söylüyor.
{
  delete process.env.ANTHROPIC_API_KEY;
  process.env.ENABLE_VLM_ATTRIBUTES = "true";

  const notes = noteFor({ budgetConstrained: false });
  t(notes.length === 1, `anahtarsızken not düşülüyor (${notes.length})`);
  t(
    /ANTHROPIC_API_KEY yok/.test(notes[0]?.reason ?? ""),
    `eksik olan anahtar adıyla yazılıyor: «${notes[0]?.reason}»`,
  );
}

// 2) Anahtar var ama bayrak kapalı → gerekçe bayrağı söylüyor, anahtarı değil.
{
  process.env.ANTHROPIC_API_KEY = "stub";
  process.env.ENABLE_VLM_ATTRIBUTES = "false";

  const notes = noteFor({ budgetConstrained: false });
  t(notes.length === 1, "bayrak kapalıyken not düşülüyor");
  t(
    /ENABLE_VLM_ATTRIBUTES/.test(notes[0]?.reason ?? ""),
    `eksik olan koşul bayrak olarak yazılıyor: «${notes[0]?.reason}»`,
  );
  t(
    !/ANTHROPIC_API_KEY/.test(notes[0]?.reason ?? ""),
    "var olan anahtar eksik gösterilmiyor",
  );
}

// 3) Bütçe kapısı ayrı bir gerekçe — «kapalı» ile karıştırılmamalı.
{
  process.env.ANTHROPIC_API_KEY = "stub";
  process.env.ENABLE_VLM_ATTRIBUTES = "true";

  const notes = noteFor({ budgetConstrained: true });
  t(notes.length === 1, "bütçe kapısında not düşülüyor");
  t(/bütçe/.test(notes[0]?.reason ?? ""), `bütçe gerekçesi ayrı: «${notes[0]?.reason}»`);
}

// 4) Her şey yerindeyse fazladan not yok — gürültü de bir kusur.
{
  process.env.ANTHROPIC_API_KEY = "stub";
  process.env.ENABLE_VLM_ATTRIBUTES = "true";

  const notes = noteFor({ budgetConstrained: false });
  t(notes.length === 0, `aşama açıkken not düşülmüyor (${JSON.stringify(notes)})`);
}

console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
