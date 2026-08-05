/**
 * Product photograph URLs pulled from a retailer PDP's own markup.
 *
 * Context.dev's structured extract often leaves `imageUrl` empty even when the
 * page nominates a canonical photo in Open Graph / Twitter / JSON-LD tags. Those
 * tags are what the retailer itself chose to represent the product, so they are
 * the right thumbnail — and parsing them is cheap compared to another model call.
 *
 * Shared with `scripts/fetch-images.mjs` so the offline catalogue collector and
 * the live scan path cannot drift apart on which tags count.
 */

const META_PATTERNS: RegExp[] = [
  /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
  /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
  /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
  /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']image_src["']/i,
];

/**
 * First matching Open Graph / Twitter / JSON-LD product image in a page's HTML.
 *
 * Returns an absolute `https:` URL, or `null` when nothing usable is present.
 * `http:` values are rejected — mixed content is blocked in the browser, so
 * shipping them would render as a broken thumbnail rather than a missing one.
 */
export function extractProductImageFromHtml(html: string, pageUrl: string): string | null {
  for (const pattern of META_PATTERNS) {
    const match = pattern.exec(html);
    if (!match?.[1]) continue;
    const resolved = absoluteHttpsUrl(match[1].trim(), pageUrl);
    if (resolved) return resolved;
  }

  return extractJsonLdImage(html, pageUrl);
}

/**
 * Walks `<script type="application/ld+json">` blocks for Product (or Product
 * group) `image` fields. Retailers that skip Open Graph often still ship JSON-LD
 * for Google Shopping.
 */
function extractJsonLdImage(html: string, pageUrl: string): string | null {
  const scriptPattern =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;
  while ((match = scriptPattern.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    const found = firstImageInJsonLd(parsed);
    if (!found) continue;

    const resolved = absoluteHttpsUrl(found, pageUrl);
    if (resolved) return resolved;
  }

  return null;
}

function firstImageInJsonLd(node: unknown): string | null {
  if (node == null) return null;

  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = firstImageInJsonLd(entry);
      if (found) return found;
    }
    return null;
  }

  if (typeof node !== "object") return null;
  const record = node as Record<string, unknown>;

  const type = record["@type"];
  const types = Array.isArray(type)
    ? type.map((entry) => String(entry).toLowerCase())
    : typeof type === "string"
      ? [type.toLowerCase()]
      : [];

  const isProduct =
    types.length === 0 ||
    types.some(
      (entry) =>
        entry === "product" ||
        entry === "productgroup" ||
        entry === "individualproduct" ||
        entry.endsWith("/product"),
    );

  if (isProduct) {
    const fromImage = imageFieldValue(record.image);
    if (fromImage) return fromImage;
  }

  // @graph wrappers and nested offers — keep walking.
  for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "hasVariant", "offers"]) {
    if (key in record) {
      const found = firstImageInJsonLd(record[key]);
      if (found) return found;
    }
  }

  return null;
}

function imageFieldValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = imageFieldValue(entry);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (typeof record.url === "string" && record.url.trim()) return record.url.trim();
    if (typeof record.contentUrl === "string" && record.contentUrl.trim()) {
      return record.contentUrl.trim();
    }
  }

  return null;
}

function absoluteHttpsUrl(value: string, pageUrl: string): string | null {
  try {
    const resolved = new URL(value, pageUrl);
    return resolved.protocol === "https:" ? resolved.toString() : null;
  } catch {
    return null;
  }
}

/** True when the URL is a usable absolute https product photo (not a data URI). */
export function isHttpsImageUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "https:";
  } catch {
    return false;
  }
}
