import { normalizeTr } from "@/lib/itemFamily";
import { materialGroupOf } from "@/lib/retailVocabulary";

/**
 * Scoring for the attributes the model asserts about a crop.
 *
 * Colour and the garment noun are scored elsewhere as plain hit rates, because
 * there a wrong answer and a missing answer cost the same thing: the pipeline
 * falls back and the shopper gets a worse query.
 *
 * Material and pattern are different, and the difference is the whole reason this
 * file exists. `scoreTitleAgreement` gives a matching material `MATERIAL_AGREE`
 * and a contradicting one `MATERIAL_CONFLICT` — a **negative** weight. So a model
 * that says nothing about material leaves the ranking exactly as it was, while a
 * model that says "deri" about a linen jacket actively demotes the correct linen
 * products. Averaging those two into one "accuracy" number would hide the only
 * failure mode that costs the user a result.
 *
 * Hence three outcomes rather than two, and a fourth for the items where the
 * photograph does not settle the question at all.
 */
export type AttributeVerdict =
  /** Asserted, and it matches what a person sees in the photograph. */
  | "correct"
  /** Left empty. Costs nothing downstream — the field simply does not contribute. */
  | "abstained"
  /** Asserted something the photograph contradicts. This is the expensive one. */
  | "wrong"
  /** No ground truth: the photograph does not settle it, so nothing is claimed. */
  | "ungraded";

/** Words that all mean "no pattern". */
const PLAIN = new Set(["duz", "sade", "desensiz", "düz"].map((word) => normalizeTr(word)));

/** Same character class the app tokenises with — a plain `[^a-z]+` shreds "ayakkabı". */
function words(value: string): string[] {
  return normalizeTr(value)
    .split(/[^a-z0-9çğıöşü]+/)
    .filter(Boolean);
}

/**
 * Material verdict, compared at group level.
 *
 * "kot" and "denim" are the same cloth, as are "süet" and "deri" for the purpose
 * of a search box; `materialGroupOf` already encodes that for the live product
 * stage, and the eval reuses it rather than keeping a second opinion.
 *
 * The comparison is per word, because the model answers in the register a
 * storefront uses — "hakiki deri", "yıkamalı denim" — and demanding the bare noun
 * would score vocabulary rather than perception.
 */
export function materialVerdict(expected: string | null, got: string | null): AttributeVerdict {
  if (!expected) return "ungraded";
  if (!got || !got.trim()) return "abstained";

  const want = materialGroupOf(expected);
  return words(got).some((word) => materialGroupOf(word) === want) ? "correct" : "wrong";
}

/**
 * Pattern verdict.
 *
 * `expected === "düz"` is a claim, not a shrug: these garments are plain, and the
 * failure this catches is a model inventing "çizgili" on a black blazer. Any of
 * the plainness words satisfies it.
 */
export function patternVerdict(expected: string | null, got: string | null): AttributeVerdict {
  if (!expected) return "ungraded";
  if (!got || !got.trim()) return "abstained";

  const found = words(got);
  if (PLAIN.has(normalizeTr(expected))) {
    // `some`, not `every`: "düz renk" is a plain garment described in two words,
    // and demanding that every word be a plainness word would fail it for the
    // second one. A model that answers "düz çizgili" is not a case that occurs.
    return found.some((word) => PLAIN.has(word)) ? "correct" : "wrong";
  }

  const want = normalizeTr(expected);
  // Prefix rather than equality: Turkish suffixes the answer ("leopar desenli"),
  // and a pattern name that starts with the expected one is the same pattern.
  return found.some((word) => word.startsWith(want) || want.startsWith(word))
    ? "correct"
    : "wrong";
}

export interface VerdictTally {
  correct: number;
  abstained: number;
  wrong: number;
  graded: number;
}

export function tally(verdicts: AttributeVerdict[]): VerdictTally {
  const counts = { correct: 0, abstained: 0, wrong: 0, graded: 0 };

  for (const verdict of verdicts) {
    if (verdict === "ungraded") continue;
    counts.graded += 1;
    counts[verdict] += 1;
  }

  return counts;
}

/**
 * Final consonants that soften when a vowel-initial suffix follows.
 *
 * Turkish does this to almost every word the eval asks about: a metric written as
 * a plain substring test scores "güneş gözlüğü" as *not containing* "gözlük" and
 * reports a perfect answer as a miss. That is the metric being wrong about the
 * model, which is the worst way for a metric to be wrong — it argues for changing
 * working code.
 *
 * `k` gets two: it softens to `ğ` between vowels ("gözlük" → "gözlüğü") and to `g`
 * after `n` ("renk" → "rengi").
 */
const SOFTENED: Record<string, string[]> = {
  k: ["ğ", "g"],
  p: ["b"],
  t: ["d"],
  ç: ["c"],
};

/**
 * Whether a Turkish token appears in a piece of text.
 *
 * Shared by the query metrics so "sneaker" in "Siyah Deri Sneaker" counts, and so
 * every arm of the comparison asks the question the same way. Turkish lowering
 * matters too: `"İ".toLowerCase()` is not `"i"` in this locale.
 *
 * Only the final consonant is relaxed, and only in the token being looked for. A
 * looser rule — stemming, or a prefix match — would start matching "şort" inside
 * "şortlu etek", which is a different garment.
 */
export function containsToken(text: string, token: string): boolean {
  const haystack = normalizeTr(text);
  const needle = normalizeTr(token);
  if (haystack.includes(needle)) return true;

  const stem = needle.slice(0, -1);
  return (SOFTENED[needle.slice(-1)] ?? []).some((soft) => haystack.includes(`${stem}${soft}`));
}
