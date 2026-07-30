import type { ColorBucket } from "./groundTruth";

/**
 * Maps a measured hex to a coarse colour family.
 *
 * Scoring against the 26 exact Turkish colour names in `searchQuery.ts` would be
 * too brittle to be useful — "Pudra" versus "Gül Kurusu" is not the difference
 * that matters. What matters is whether the pipeline thinks a black shorts is
 * dark and a pink cardigan is pink, so the buckets are deliberately coarse and
 * ordered: lightness first, because a very dark or very light pixel has an
 * unreliable hue.
 */
export function colorBucketOf(hex: string): ColorBucket {
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
