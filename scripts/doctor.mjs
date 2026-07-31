/**
 * What is still missing, and the exact command to fix each thing.
 *
 *   npm run doctor
 *
 * `docs/ROADMAP.md` carries the same list in prose, and prose goes stale the
 * moment someone fills something in. This reads the actual state — environment
 * variables, recorded fixtures, verified product links — and prints only what is
 * genuinely outstanding, so "am I done?" is a command rather than a reading
 * comprehension exercise.
 *
 * Exit code is 0 when the *code* is healthy, regardless of what is missing. The
 * missing things are inputs a person supplies, not failures; making this red would
 * teach everyone to ignore it. `npm run eval` is the gate.
 */
import { register } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";

register(new URL("./alias-loader.mjs", import.meta.url).href);

const ROOT = new URL("..", import.meta.url).pathname;

const { VERIFIED_PDP_URLS, VERIFIED_PDP_IMAGES } = await import("@/data/verifiedProductUrls");
const { familyOf } = await import("@/lib/itemFamily");
const { groundTruth } = await import("../eval/groundTruth.ts");

const env = (name) => (process.env[name] ?? "").trim().length > 0;
const count = (dir) =>
  existsSync(`${ROOT}${dir}`) ? readdirSync(`${ROOT}${dir}`).filter((f) => f.endsWith(".json")).length : 0;

/**
 * Whether the legal notice still carries a placeholder for the data controller.
 *
 * Looks for the words a placeholder uses rather than for a specific name: any
 * real identity will not contain them, and a check keyed to one expected string
 * would go stale the day the company is renamed.
 */
function legalIdentityFilled() {
  const path = `${ROOT}src/app/(legal)/yasal-bildirim/page.tsx`;
  if (!existsSync(path)) return true;
  const source = readFileSync(path, "utf8");
  return !/(doldurulacak|belirlenecek|TODO|\[şirket|\[unvan|\[ad soyad|\[açık adres)/i.test(source);
}

const cases = groundTruth(familyOf);
const items = cases.reduce((n, testCase) => n + testCase.items.length, 0);

const checks = [
  {
    id: "0.1",
    when: "trafik",
    label: "Hız sınırı sayaçları kalıcı",
    ok: env("UPSTASH_REDIS_REST_URL") && env("UPSTASH_REDIS_REST_TOKEN"),
    missing: "UPSTASH_REDIS_REST_URL ve UPSTASH_REDIS_REST_TOKEN",
    why: "Onlarsız sayaçlar süreç-yerel; sunucusuz ortamda instance başına, yani gerçek bir sınır değil.",
    fix:
      "upstash.com -> Redis database oluştur -> UPSTASH_REDIS_REST_URL ve\n" +
      "                UPSTASH_REDIS_REST_TOKEN değerlerini ortama ekle (ücretsiz plan yeterli).\n" +
      "                Upstash, siteyi çalıştıran kopyaların hepsinin gördüğü küçük bir sayaç\n" +
      "                deposu; sayaç kendi belleğinde tutulursa «dakikada 10» aslında\n" +
      "                «her kopyada 10» oluyor.",
  },
  {
    id: "0.3",
    when: "yayın",
    label: "Ürünler satın alınabilir",
    ok: Object.keys(VERIFIED_PDP_URLS).length > 0,
    missing: `VERIFIED_PDP_URLS boş (${Object.keys(VERIFIED_PDP_IMAGES).length} görsel)`,
    why: "Site tarıyor, eşleştiriyor, fiyat gösteriyor — ve «Ürüne git» hiçbir yere gitmiyor.",
    fix: "npm run check:pdp  (mağazaya göre iş listesi) → bağlantıları doldur → npm run fetch:images",
  },
  {
    id: "1.1",
    when: "ölçüm",
    label: "Eval seti kıyaslama boyutunda",
    ok: cases.length >= 30,
    missing: `${cases.length} kombin / ${items} parça (hedef 30+)`,
    why: "Her yüzde bu sete karşı ölçülüyor. Bu boyutta sayılar yön gösterir, büyüklük göstermez.",
    fix: "30–50 çeşitli fotoğraf; kutuları tools/box-editor.html ile ölç, eval/groundTruth.ts'ye ekle.",
  },
  {
    id: "1.2",
    when: "ölçüm",
    label: "Kutu doğruluğu ölçüldü",
    ok: count("eval/fixtures") > 0,
    missing: "eval/fixtures/ boş",
    why: "Vision'ın çizdiği kutunun gerçekten giysinin üzerinde olup olmadığı hiç ölçülmedi.",
    fix: "GOOGLE_CLOUD_VISION_API_KEY=... npm run eval:record",
  },
  {
    id: "1.3",
    when: "ölçüm",
    label: "VLM kazancı ölçüldü",
    ok: count("eval/fixtures/attrs") > 0,
    missing: "eval/fixtures/attrs/ boş",
    why: "Boru hattı modelin rengini ölçülene tercih ediyor; bu tercihin doğru olduğunu gösteren sayı yok.",
    fix: "ANTHROPIC_API_KEY=... npm run eval:record-attrs -- --repeat 3",
  },
  {
    id: "—",
    when: "yayın",
    label: "Yasal kimlik dolduruldu",
    ok: legalIdentityFilled(),
    missing: "veri sorumlusunun adı ve tebligat adresi",
    why: "KVKK bildirimi yanlış sorumluyu adlandırırsa, boş olmasından kötüdür.",
    fix: "yasal-bildirim/page.tsx içinde CONTROLLER_NAME ve adres — şirket değil, gerçek kişi olarak yazıldı.",
  },
];

const done = checks.filter((c) => c.ok);
const open = checks.filter((c) => !c.ok);

console.log(`\n  ${done.length}/${checks.length} hazır\n`);

for (const check of done) {
  console.log(`  ✓ ${check.id.padEnd(4)} ${check.label}`);
}

/*
 * Grouped by *when it matters*, not just by what is missing.
 *
 * A flat list said "0/6 hazır" and gave a legal notice with a placeholder the same
 * weight as a rate-limit store nobody needs until there is traffic. That reads as
 * six equal emergencies, which is the fastest way to make someone ignore all six.
 */
const GROUPS = [
  ["yayın", "Yayına çıkmadan önce", "Bunlar olmadan canlıya çıkmak kullanıcıya ya da sana zarar verir."],
  ["ölçüm", "Doğruluğu ölçebilmek için", "Kod hazır; bunlar sayının kendisini üretiyor."],
  ["trafik", "Gerçek kullanıcı geldiğinde", "Şu an trafik yokken bir şey değiştirmiyor."],
];

for (const [key, title, note] of GROUPS) {
  const group = open.filter((check) => check.when === key);
  if (group.length === 0) continue;

  console.log(`\n  ${title.toLocaleUpperCase("tr")}`);
  console.log(`  ${note}\n`);
  for (const check of group) {
    console.log(`  ○ ${check.id.padEnd(4)} ${check.label}`);
    console.log(`         eksik: ${check.missing}`);
    console.log(`         neden: ${check.why}`);
    console.log(`         yap:   ${check.fix}\n`);
  }
}

console.log(
  "  Kodun sağlığı bu listeden bağımsız: «npm run eval» ve test süitleri o işi\n" +
    "  görüyor. Buradaki maddeler kod değil, girdi bekliyor.\n",
);
