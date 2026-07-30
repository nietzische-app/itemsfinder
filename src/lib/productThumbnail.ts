import { familyOf, normalizeTr, type ItemFamily } from "@/lib/itemFamily";

/**
 * Catalogue product thumbnails.
 *
 * The demo catalogue has no photographs — its products are authored, so there is
 * nothing to photograph, and a retailer's image cannot be invented. What it had
 * instead was a colour gradient with the product's initials stamped on it, which
 * read as a loading state that never finished.
 *
 * This draws the garment instead: a silhouette per product kind, filled in the
 * product's own colour, on a studio-grey ground with a contact shadow. At the size
 * these render (80–128px) a bold shape carries and fine detail is wasted, so the
 * paths are deliberately blunt — one silhouette, one highlight, no line work.
 *
 * It is still not a photograph and does not pretend to be. The moment a real image
 * URL exists for a product, `verifiedProductUrls.ts` carries it and
 * `hydrateProduct` prefers it; this is what shows until then.
 */

/* -------------------------------------------------------------------------- */
/*  Colour                                                                    */
/* -------------------------------------------------------------------------- */

function parseHex(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return [136, 136, 140];

  const value = Number.parseInt(match[1]!, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Mixes towards black (`amount` < 0) or white (`amount` > 0). */
function shift(hex: string, amount: number): string {
  const [r, g, b] = parseHex(hex);
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  return toHex([r + (target - r) * t, g + (target - g) * t, b + (target - b) * t]);
}

/**
 * Outline colour.
 *
 * A near-black garment has nothing darker to be outlined with, so below this
 * lightness the edge goes *lighter* instead. Without it every black product was a
 * silhouette-shaped hole.
 */
function edgeColor(hex: string): string {
  const [r, g, b] = parseHex(hex);
  const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
  return lightness < 0.22 ? shift(hex, 0.28) : shift(hex, -0.32);
}

/* -------------------------------------------------------------------------- */
/*  Shapes                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What to draw. Finer than `ItemFamily` where one shape would be plainly wrong —
 * "accessory" spans sunglasses, beanies, scarves and necklaces, and drawing all
 * four as the same blob is the amateurish part of a placeholder, not the fact that
 * it is a placeholder.
 */
type Shape =
  | "jacket"
  | "top"
  | "trousers"
  | "shorts"
  | "skirt"
  | "dress"
  | "sneaker"
  | "boot"
  | "heel"
  | "bag"
  | "glasses"
  | "hat"
  | "jewellery"
  | "scarf"
  | "lipstick"
  | "wand"
  | "compact"
  | "generic";

/**
 * Two-word phrases, checked first.
 *
 * Necessary because "top" is three different products: "Hi Top" is a sneaker,
 * "Top Handle" is a bag, "Crop Top" is a blouse. Matching the bare token drew a
 * shoe for a cropped top, which is the sort of thing that makes a placeholder look
 * like a bug rather than a placeholder.
 */
const SHAPE_PHRASES: Array<[Shape, string[]]> = [
  ["sneaker", ["hi top", "high top", "low top"]],
  ["bag", ["top handle"]],
  ["top", ["crop top", "tank top"]],
];

/** Keyword → shape, checked after the phrases. Order matters. */
const SHAPE_WORDS: Array<[Shape, string[]]> = [
  ["boot", ["boot", "chelsea", "bot", "çizme"]],
  ["heel", ["heel", "sandal", "court", "pump", "stiletto", "topuk", "sandalet"]],
  // No bare "top" here: see SHAPE_PHRASES.
  ["sneaker", ["sneaker", "trainer", "platform", "shoe"]],
  ["glasses", ["sunglasses", "glasses", "gözlü", "shades"]],
  ["hat", ["hat", "beanie", "cap", "şapka", "bere"]],
  ["scarf", ["scarf", "fular", "şal", "atkı"]],
  ["jewellery", ["necklace", "chain", "earring", "hoop", "pearl", "bracelet", "ring", "kolye", "küpe"]],
  ["lipstick", ["lipstick", "lip", "gloss", "balm", "ruj", "dudak", "ink", "matte", "cream", "oil"]],
  ["wand", ["liner", "mascara", "lash", "eyeliner", "maskara", "kalem", "pencil"]],
  ["compact", ["palette", "powder", "bronz", "blush", "glow", "drops", "highlighter", "pudra", "allık"]],
  ["skirt", ["skirt", "etek"]],
  ["shorts", ["short", "shorts", "şort", "bermuda"]],
  ["trousers", ["jean", "denim", "trouser", "pant", "legging", "pantolon", "tayt", "jogger"]],
  ["dress", ["dress", "gown", "jumpsuit", "elbise", "tulum"]],
  ["bag", ["bag", "tote", "clutch", "crossbody", "baguette", "çanta"]],
  ["jacket", ["jacket", "coat", "blazer", "parka", "puffer", "cardigan", "ceket", "kaban", "hırka", "mont"]],
  ["top", ["tee", "shirt", "blouse", "tank", "knit", "body", "sweater", "pullover", "crop", "gömlek", "bluz", "kazak"]],
];

/** Family fallback, for a label with no recognisable word in it. */
const SHAPE_BY_FAMILY: Record<ItemFamily, Shape> = {
  outerwear: "jacket",
  top: "top",
  bottom: "trousers",
  dress: "dress",
  footwear: "sneaker",
  bag: "bag",
  accessory: "jewellery",
  lips: "lipstick",
  eyes: "wand",
  face: "compact",
  unknown: "generic",
};

export function shapeFor(label: string): Shape {
  const words = normalizeTr(label).split(/[^a-z0-9çğıöşü]+/).filter(Boolean);
  const tokens = new Set(words);
  const joined = words.join(" ");

  for (const [shape, phrases] of SHAPE_PHRASES) {
    if (phrases.some((phrase) => joined.includes(phrase))) return shape;
  }

  for (const [shape, words] of SHAPE_WORDS) {
    if (words.some((word) => tokens.has(normalizeTr(word)))) return shape;
  }

  return SHAPE_BY_FAMILY[familyOf(label)];
}

/**
 * Silhouette geometry, on a 400×500 canvas.
 *
 * `body` is filled in the product colour and stroked in its edge colour. `detail`
 * is drawn over it at low opacity for a hint of dimension — a sleeve seam, a sole,
 * a lens. Both are plain path data so the whole thing stays a few hundred bytes.
 */
const SHAPES: Record<Shape, { body: string; detail?: string }> = {
  jacket: {
    body:
      "M200 118 L146 138 L120 168 L104 300 L138 310 L146 232 L146 386 " +
      "L254 386 L254 232 L262 310 L296 300 L280 168 L254 138 Z",
    detail: "M200 118 L200 386 M200 118 L168 156 L200 176 L232 156 Z",
  },
  top: {
    body:
      "M200 132 L152 148 L112 178 L126 226 L152 214 L152 370 L248 370 " +
      "L248 214 L274 226 L288 178 L248 148 Z",
    detail: "M200 132 Q200 160 172 146 M200 132 Q200 160 228 146",
  },
  trousers: {
    body:
      "M148 138 L252 138 L258 190 L246 384 L206 384 L200 236 L194 384 " +
      "L154 384 L142 190 Z",
    detail: "M148 156 L252 156 M200 236 L200 384",
  },
  shorts: {
    body:
      "M148 150 L252 150 L258 198 L250 292 L210 292 L200 238 L190 292 " +
      "L150 292 L142 198 Z",
    detail: "M148 168 L252 168 M200 238 L200 292",
  },
  skirt: {
    body: "M156 148 L244 148 L286 366 L114 366 Z",
    detail: "M156 176 L244 176 M200 176 L200 366",
  },
  dress: {
    body:
      "M200 122 L158 142 L146 208 L120 382 L280 382 L254 208 L242 142 Z",
    detail: "M200 122 L200 382 M158 208 L242 208",
  },
  sneaker: {
    body:
      "M112 296 L112 262 Q112 234 142 232 L184 232 L232 262 L286 274 " +
      "Q306 280 306 300 L306 314 Q306 328 288 328 L128 328 Q112 328 112 312 Z",
    detail: "M112 306 L306 306 M184 232 L200 300 M216 246 L232 300",
  },
  boot: {
    body:
      "M148 168 L216 168 L222 268 L268 292 Q288 302 288 320 L288 332 " +
      "Q288 344 272 344 L152 344 Q136 344 136 328 L136 200 Z",
    detail: "M136 324 L288 324 M148 200 L222 200",
  },
  heel: {
    body:
      "M120 322 Q118 304 138 298 L244 274 L250 300 L262 336 L238 336 " +
      "L230 304 L146 334 Q124 336 120 322 Z",
    detail: "M152 296 L184 240 M198 286 L224 240 M172 244 L216 244",
  },
  bag: {
    body: "M132 216 L268 216 L282 372 L118 372 Z",
    detail: "M164 216 Q164 152 200 152 Q236 152 236 216",
  },
  glasses: {
    body:
      "M108 236 Q108 210 140 210 L176 210 Q186 210 186 226 L186 252 " +
      "Q186 282 152 282 Q116 282 110 254 Z " +
      "M214 226 Q214 210 224 210 L260 210 Q292 210 292 236 L290 254 " +
      "Q284 282 248 282 Q214 282 214 252 Z",
    detail: "M186 232 L214 232 M108 226 L84 214 M292 226 L316 214",
  },
  hat: {
    body:
      "M136 296 Q124 296 124 288 Q124 214 200 214 Q276 214 276 288 " +
      "Q276 296 264 296 Z",
    detail: "M124 272 Q200 254 276 272",
  },
  jewellery: {
    body:
      "M200 178 Q126 178 126 266 Q126 322 200 322 Q274 322 274 266 " +
      "Q274 178 200 178 Z M200 208 Q244 208 244 266 Q244 292 200 292 " +
      "Q156 292 156 266 Q156 208 200 208 Z",
    detail: "M200 292 L200 336 M186 336 L214 336",
  },
  scarf: {
    body: "M164 146 L236 146 L244 350 L156 350 Z",
    detail:
      "M162 172 L238 172 M158 320 L242 320 " +
      "M162 350 L160 380 M181 350 L180 380 M200 350 L200 380 " +
      "M219 350 L220 380 M238 350 L240 380",
  },
  lipstick: {
    body: "M166 296 L234 296 L234 388 L166 388 Z M172 296 L172 196 L206 168 L228 190 L228 296 Z",
    detail: "M166 312 L234 312 M172 220 L228 220",
  },
  wand: {
    body: "M180 246 L220 246 L220 390 L180 390 Z M186 246 L186 178 Q200 156 214 178 L214 246 Z",
    detail: "M180 264 L220 264 M200 156 L200 246",
  },
  compact: {
    body: "M116 214 L284 214 Q296 214 296 226 L296 348 Q296 360 284 360 L116 360 Q104 360 104 348 L104 226 Q104 214 116 214 Z",
    detail: "M144 248 L256 248 Q262 248 262 256 L262 326 L144 326 Q138 326 138 318 Z",
  },
  generic: {
    body: "M118 206 L282 206 L282 366 L118 366 Z",
    detail: "M118 258 L282 258 M118 312 L282 312",
  },
};

/* -------------------------------------------------------------------------- */
/*  Render                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Inline SVG data URL for one product.
 *
 * A data URL rather than a file because these are generated from the catalogue and
 * there are 113 of them; shipping 113 files to serve a placeholder would be worse
 * than the few hundred bytes each of these costs. They are not stored in
 * localStorage for the same reason the saved list keeps no images — the quota.
 */
export function productThumbnail(label: string, colorHex: string): string {
  const shape = SHAPES[shapeFor(label)];
  const fill = colorHex;
  const edge = edgeColor(colorHex);
  const gloss = shift(colorHex, 0.22);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" role="img">` +
    `<defs>` +
    `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#f8f7f6"/><stop offset="1" stop-color="#eae8e6"/>` +
    `</linearGradient>` +
    `<radialGradient id="sh" cx="0.5" cy="0.5" r="0.5">` +
    `<stop offset="0" stop-color="#1d1b1a" stop-opacity="0.20"/>` +
    `<stop offset="1" stop-color="#1d1b1a" stop-opacity="0"/>` +
    `</radialGradient>` +
    `</defs>` +
    `<rect width="400" height="500" fill="url(#bg)"/>` +
    // Contact shadow, so the silhouette sits on the ground instead of floating.
    `<ellipse cx="200" cy="404" rx="104" ry="20" fill="url(#sh)"/>` +
    `<path d="${shape.body}" fill="${fill}" stroke="${edge}" stroke-width="5" ` +
    `stroke-linejoin="round" stroke-linecap="round"/>` +
    (shape.detail
      ? `<path d="${shape.detail}" fill="none" stroke="${gloss}" stroke-width="4" ` +
        `stroke-linecap="round" stroke-opacity="0.55"/>`
      : "") +
    `</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
