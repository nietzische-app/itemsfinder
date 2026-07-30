/**
 * Coarse colour families.
 *
 * Two callers need the same answer, so it lives in one place:
 *
 *  - the eval, which asks "is the pipeline's measured colour the one a human would
 *    name?" — this logic started there and has been corrected twice by it
 *    (saturated navy was being called dark; cream was being called yellow),
 *  - the live product stage, which asks "does this listing's colour word contradict
 *    what we detected?" before promoting a row to the exact match.
 *
 * Scoring against the 26 exact Turkish colour names in `searchQuery.ts` would be
 * too brittle to be useful — "Pudra" versus "Gül Kurusu" is not the difference that
 * matters. What matters is whether a black shorts is dark and a pink cardigan is
 * pink, so the families are deliberately coarse and ordered: lightness first,
 * because a very dark or very light pixel has an unreliable hue.
 */
export type ColorFamily =
  | "pembe"
  | "kirmizi"
  | "koyu"
  | "beyaz"
  | "mavi"
  | "yesil"
  | "kahve"
  | "bej"
  | "gri"
  | "sari"
  | "mor";

export function colorFamilyOf(hex: string): ColorFamily {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  /*
   * Lightness dominates at the extremes, but only when the hue is weak. A dark
   * *saturated* pixel still has a colour a shopper would name: #011b2a is navy
   * denim, and bucketing it as "koyu" hid a correct measurement behind a wrong
   * label.
   */
  if (lightness < 0.28 && saturation < 0.55) return "koyu";
  /*
   * Near white, HSL saturation stops meaning anything: its denominator collapses
   * as lightness approaches 1, so cream (#f2efe6) reports 0.32 saturation off a
   * channel spread of twelve units out of 255 and came out "sari". Nobody shops
   * for a yellow beanie because it is off-white. Above this lightness the raw
   * channel spread is the honest measure of whether there is a hue at all.
   */
  if (lightness > 0.86 && delta < 0.12) return "beyaz";
  // Metal frames and washed greys sit around 0.15 saturation; 0.12 was too tight.
  if (saturation < 0.2) return lightness < 0.6 ? "gri" : "beyaz";

  // Hue in degrees.
  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }

  if (hue < 15 || hue >= 340) {
    // Red family: a pale, desaturated red reads as pink to a shopper.
    return lightness > 0.62 || saturation < 0.45 ? "pembe" : "kirmizi";
  }
  if (hue < 40) {
    // Orange-browns: dark ones are leather/brown, light ones are beige.
    return lightness < 0.5 ? "kahve" : "bej";
  }
  if (hue < 70) return "sari";
  if (hue < 165) return "yesil";
  if (hue < 255) return "mavi";
  if (hue < 290) return "mor";
  return "pembe";
}

/* -------------------------------------------------------------------------- */
/*  Contradiction                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Pairs that can be the same garment.
 *
 * Enumerated rather than derived from a "neutral versus chromatic" rule, because
 * that rule is wrong in both directions: it made beige-versus-black agree (it is
 * the textbook contradiction) while it would have made navy-versus-black disagree
 * (it is the commonest honest confusion there is).
 *
 * Each entry is a way a *correct* listing and a *correct* measurement can disagree
 * on the word: navy and aubergine and bordeaux and forest green all measure dark;
 * cream measures white; camel measures beige.
 */
const COMPATIBLE = new Set([
  // Dark garments a retailer names by their hue.
  "koyu|mavi",
  "kahve|koyu",
  "koyu|mor",
  "koyu|yesil",
  "kirmizi|koyu",
  // Pale garments a retailer names by their hue.
  "bej|beyaz",
  "beyaz|pembe",
  "beyaz|sari",
  "bej|kahve",
  "bej|sari",
  "bej|pembe",
  // Neighbouring hues.
  "kirmizi|pembe",
  "mor|pembe",
  "mavi|mor",
  "sari|yesil",
  "kahve|kirmizi",
]);

function pairKey(a: ColorFamily, b: ColorFamily): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * True only when two colour families are a contradiction a human would call out.
 *
 * This decides whether a real, in-stock product is demoted out of the exact-match
 * slot, so a false contradiction costs the shopper the best row on the page — but a
 * missed one shows them a beige coat for a black one. The list above is the whole
 * of the leniency; anything else that differs is a contradiction.
 *
 * **Grey is exempt entirely.** It is where measurement error lands: on the eval
 * set, washed indigo jeans measure #596564 and black sandals measure #4e5857, both
 * grey. Asserting a contradiction against grey would demote correct rows on the
 * strength of the pipeline's least reliable answer.
 */
export function colorFamiliesContradict(a: ColorFamily, b: ColorFamily): boolean {
  if (a === b) return false;
  if (a === "gri" || b === "gri") return false;

  return !COMPATIBLE.has(pairKey(a, b));
}
