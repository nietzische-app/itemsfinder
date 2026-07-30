# Markas

**Spot the look. Mark as yours.**

Upload any outfit or makeup screenshot. Markas finds the exact items and
budget-friendly alternatives with live buy links.

This is the MVP: a complete, clickable product built on a swappable detection
engine. It runs out of the box with **no API keys**.

The interface is Turkish (`lang="tr"`), prices render in Turkish convention
(`₺3.599,90`) via `formatPrice`, and the demo catalogue is priced in TRY.
Live results keep whatever currency the retailer quotes — showing a US-dollar
listing as lira would be a lie. Code, comments and identifiers stay English.

```bash
npm install
npm run dev      # http://localhost:3000
```

## How it works

```
screenshot ─▶ /api/detect ─▶ detector ─────────▶ product provider ─▶ DetectionResult
                             │                    │                        │
              Google Vision  │ or │ Mock          │ Context.dev │ or │ Mock ▼
              (what is it,   │                    │ (what to buy,          hotspots +
               where is it)  │                    │  live price & stock)   items rail
```

**Google Cloud Vision is the primary engine.** It is the only thing that turns
pixels into bounding boxes, object coordinates and labels, and it always takes
precedence when `GOOGLE_VISION_API_KEY` (or `GOOGLE_CLOUD_VISION_API_KEY`) is
set. The mock detector is a development fallback so a fresh clone runs — it is
never chosen over a configured key.

**Context.dev is a secondary enrichment layer.** It performs no detection. It
runs after Vision, on the labels Vision produced, to attach live prices, stock
and retailer branding. Configuring it without a Vision key is a demo
configuration and logs a warning on startup.

1. **Home** (`/`) — hero with the upload zone, plus a staggered masonry of four
   curated demo looks. The image is held in `sessionStorage` and never leaves
   the browser until a scan is triggered.
2. **Analyze** (`/analyze`) — a three-column workspace: a tool rail (category
   filters, budget slider, engine badge), the canvas with zoom and a pulsing
   coral hotspot per detection, and the detections rail, which streams items in
   one at a time. Filters apply to the rail *and* the hotspots together, so the
   canvas and the list never disagree.
3. **Matches** — hovering a hotspot reveals its bounding box and a frosted
   quick-look card. Selecting one expands that detection in the rail to show
   the exact match and 2–3 cheaper alternatives with a "% less" badge,
   retailer, price and a **Get this item** CTA wrapped in an affiliate link.
   Detections are grouped into **Clothing & Accessories** and **Beauty &
   Cosmetics**; the footer opens the whole curated look with both an as-is and
   a cheapest-route total.

## Brand & design system

**Markas** — the mark is a camera focus frame around a tag with the signature
coral dot: detection and the thing detected in one glyph. It lives in
`src/components/MarkasLogo.tsx` (`MarkasMark` for the icon, `MarkasLogo` for
the lockup) and in `src/app/icon.svg` as the favicon. The mark's strokes use
`currentColor`, so it inherits the surrounding text colour on any surface.

| Token       | Hex       | Used for                                  |
| ----------- | --------- | ----------------------------------------- |
| Matte black | `#111111` | Navigation, core CTAs, the logo mark      |
| Off-white   | `#FAFAFA` | The page canvas                           |
| Coral       | `#E05638` | Scan hotspots, active states, conversion  |

The interface implements the Stitch design in [`design/DESIGN.md`](design/DESIGN.md)
(reference renders alongside it): editorial "quiet luxury" — pure-white cards
lifting off the off-white canvas, matte black for navigation and core CTAs, and
the coral reserved for hotspots and conversion. Plus Jakarta Sans for
headlines, Inter for body, on an 8px baseline.

> Accessibility note: brand coral on the off-white canvas is 3.8:1, which is
> fine for graphics and large type but too low for the 10–12px labels this
> system uses. `secondary-deep` (`#C0451F`, 5.1:1) carries small coral **text**;
> `secondary` stays exactly on-brand for hotspots, dots and filled CTAs.

Its tokens are the Tailwind theme, using the same names as the design doc
(`surface`, `on-surface-variant`, `outline`, `secondary`, `label-sm` …) so the
two stay one vocabulary. The palette is deliberately light-only: the depth
model depends on white-on-off-white, which a dark inversion would lose.

> One gotcha worth knowing: because the theme replaces Tailwind's default
> colour and font-size scales, `tailwind-merge` is extended with both in
> `src/lib/utils.ts`. Without that it cannot tell `text-on-primary` (a colour)
> from `text-body-md` (a size), treats them as conflicting, and silently drops
> one.

## Live product intelligence (Context.dev)

With `CONTEXT_DEV_API_KEY` set and `ENABLE_CONTEXT_DEV_LIVE=true`, catalogue
products are replaced with live inventory. `src/services/contextDevService.ts`
wraps the official `context.dev` SDK and exposes two operations:

| Method                        | Context.dev API                        | Used for |
| ----------------------------- | -------------------------------------- | -------- |
| `searchLiveProducts(query, category)` | `web.search` → `web.extract` | Real titles, prices, currency, stock and images |
| `enrichBrandMetadata(domain)` | `brand.retrieveSimplified`             | Retailer logo, display name, brand colour |

`searchLiveProducts` runs in two stages: a web search scoped to a retailer
allowlist finds real product URLs, then a schema-driven extract pulls
structured cards off the best few. Extraction is pinned to a single page
(`maxDepth: 0`, `maxPages: 1`) and runs with `factCheck: true`, so a price on a
card is a price that was on the page — the whole point of going live.

**This is independent of the detector.** Live products work with the mock
detector too, which matters because the mock detector is what runs without a
Vision key — coupling the two would make `ENABLE_CONTEXT_DEV_LIVE=true`
silently do nothing for most setups.

### Failure behaviour

Fallback is **per detection**, not all-or-nothing. If the jacket resolves live
but the lipstick times out, the jacket goes live and the lipstick keeps its
catalogue row. Three bounds keep a bad upstream from holding a scan hostage:

- `CONTEXT_DEV_MAX_LIVE_ITEMS` — detections resolved live, highest confidence
  first. Everything else stays on the catalogue.
- `CONTEXT_DEV_DEADLINE_MS` — wall-clock budget for the whole live stage.
- The client aborts when the browser disconnects, so abandoned scans stop
  burning credits.

Results are cached in-process per query and per domain: scans repeat the same
labels constantly, and credits are the scarce resource.

`DetectionResult` carries `productSource` and `liveItemCount`, and the engine
badge on `/analyze` reports exactly what happened — including partial states
("3 of 5 live"). A scan running on demo prices never looks like real inventory.

## The detection engine

`src/services/visualSearch.ts` defines a single interface:

```ts
interface VisualSearchService {
  readonly source: DetectionSource;
  analyze(input: VisualSearchInput): Promise<DetectionResult>;
}
```

Two implementations ship with the app, chosen by `getVisualSearchService()`:

| Implementation                | Used when                                              |
| ----------------------------- | ------------------------------------------------------ |
| `GoogleVisionSearchService`   | `GOOGLE_VISION_API_KEY` / `GOOGLE_CLOUD_VISION_API_KEY` is set — **takes precedence** |
| `MockVisualSearchService`     | No key, or `USE_MOCK_VISION=true` (development fallback) |

The Google implementation calls `images:annotate` with `OBJECT_LOCALIZATION`
(what and where), `WEB_DETECTION` (brand-aware naming, so "Outerwear" becomes
"biker jacket") and `IMAGE_PROPERTIES` (dominant colour). If the live provider
fails, `/api/detect` degrades to the mock rather than erroring — the response
carries `source: "mock"`, so degraded results are never presented as real
detections.

**Bounding boxes are always normalised (0–1)**, which is what lets the overlay
place hotspots and boxes at any image size without measuring anything.

### Swapping the product source

Vision tells you *what* is in the image; it does not tell you *what to buy*.
That second half is the `ProductProvider` seam in
`src/services/productProvider.ts` — `MockProductProvider` reads the catalogue,
`ContextDevProductProvider` reads live inventory. Adding a third (a merchant
feed, an embedding index) means implementing one method:

```ts
enrich(result: DetectionResult, signal?: AbortSignal): Promise<DetectionResult>
```

A provider must be *total*: a detection it cannot resolve keeps the products it
arrived with, so the UI never loses a card.

## Product links

Catalogue rows store a `searchQuery`, not a URL, and `hydrateProduct()`
resolves it against `src/services/merchantSearch.ts` into a real Turkish
storefront search (`trendyol.com/sr?q=`, `amazon.com.tr/s?k=`,
`zara.com/tr/tr/search?searchTerm=` …).

This replaced hand-written product paths like `/dp/B08XYZ4321`, every one of
which 404'd — an invented product id cannot resolve, and it rots the moment a
retailer rotates its catalogue. A search always lands somewhere useful, and
`ProductMatch.urlKind` records which kind of link it is so the CTA can say
"Mağazada bul" rather than promising a product page it will not deliver.

Live rows from Context.dev are real product pages and are validated as absolute
`http(s)` URLs before reaching the UI; a row we cannot link to is marked out of
stock rather than shipped with a dead button.

### Search precision

`buildSearchQuery()` in `src/lib/searchQuery.ts` combines Vision's three
signals — dominant colour, the web-detection phrase and the object label — into
the query a shopper would type. "Cosmetics" becomes "Kırmızı Mat Ruj". Colours
are mapped to Turkish names by nearest RGB match, generic tokens are dropped,
and duplicates are collapsed.

> Limitation worth knowing: `IMAGE_PROPERTIES` returns dominant colours for the
> whole image, not per object, so every detection in one scan shares a colour
> term. Per-object colour needs server-side cropping, which is not wired up.

## Affiliate links

Live URLs are wrapped exactly like catalogue ones: `merchantForDomain()` maps a
live retailer domain onto a known merchant so the right tag is attached, and
unknown retailers still get UTM parameters.

`buildAffiliateUrl(originalUrl, merchant)` in `src/utils/affiliate.ts` rewrites
a product URL into a tracked one: it preserves existing query params, is
idempotent on repeat calls, attaches per-merchant tags from env vars, adds a
`utm_term` sub-id identifying the detection/product pair, and returns the input
untouched if it is not a valid `http(s)` URL. CTAs render with
`rel="noopener noreferrer sponsored nofollow"`.

## Configuration

Copy `.env.example` to `.env.local`. Everything is optional — see that file for
what each variable does.

## Project structure

```text
design/DESIGN.md                 # Source design system + reference renders
src/
├── app/
│   ├── page.tsx                 # Hero live-scan showcase, upload zone, FAQ
│   ├── analyze/page.tsx         # Scanning workspace + detection streaming
│   ├── (legal)/                 # Privacy, terms, KVKK notice
│   └── api/detect/route.ts      # Image validation + engine dispatch
├── components/
│   ├── LiveScanPreview.tsx      # Landing-page live scan demo (beam, hotspots)
│   ├── ImageUploader.tsx        # react-dropzone upload zone
│   ├── BoundingBoxOverlay.tsx   # Hotspots, boxes, quick-looks, scan status
│   ├── DetectedItemsPanel.tsx   # "AI Detected Items" rail + curated dialog
│   ├── ProductCard.tsx          # Product surface + affiliate CTA
│   ├── ProductImage.tsx         # Thumbnail with dead-URL fallback
│   ├── EngineBadge.tsx          # Which engines produced this result
│   ├── MarkasLogo.tsx           # Brand mark + wordmark lockup
│   ├── AnalyzeSidebar.tsx       # Workspace tool rail: filters + budget
│   ├── SiteHeader.tsx           # Top app bar: logo + "Görsel Yükle"
│   ├── MobileNav.tsx            # Bottom tab bar (mobile)
│   ├── Footer.tsx               # Four-column footer + affiliate notice
│   ├── CookieBanner.tsx         # Consent notice, localStorage-backed
│   ├── FaqSection.tsx           # <details> accordion
│   ├── ResultsSkeleton.tsx      # Loading state
│   └── ui/                      # shadcn primitives on the design tokens
├── lib/
│   ├── showcase.ts              # Landing-page showcase image + calibrated boxes
│   ├── examples.ts              # Demo-scenario image fixtures
│   ├── imageSession.ts          # Downscale + sessionStorage handoff
│   └── searchQuery.ts           # Vision labels -> storefront search query
├── services/
│   ├── visualSearch.ts          # Detector interface + composition/factories
│   ├── contextDevService.ts     # Context.dev Extract + Brand integration
│   ├── merchantSearch.ts        # Storefront search URLs + brand colours
│   ├── productProvider.ts       # ProductProvider seam: mock vs live
│   └── mockCatalog.ts           # Demo catalogue & scenarios
├── types/index.ts               # DetectionResult, ProductMatch, …
└── utils/affiliate.ts           # Affiliate URL builder + formatting
```

## Scripts

| Command             | Description                    |
| ------------------- | ------------------------------ |
| `npm run dev`       | Dev server                     |
| `npm run build`     | Production build               |
| `npm run start`     | Serve the production build     |
| `npm run lint`      | ESLint                         |
| `npm run typecheck` | `tsc --noEmit`                 |

## Deploying to Vercel

Nothing to configure beyond environment variables — the App Router build is
Vercel's default target.

1. Import the repository at [vercel.com/new](https://vercel.com/new). Framework
   preset is detected as Next.js; leave the build command and output directory
   alone.
2. **Paste the keys** under *Project → Settings → Environment Variables*, one
   row per line in `.env.example`. Set them for Production **and** Preview, or
   preview deployments will silently run in demo mode. Server-side keys
   (`GOOGLE_CLOUD_VISION_API_KEY`, `CONTEXT_DEV_API_KEY`) must **not** be
   prefixed with `NEXT_PUBLIC_` — that prefix inlines a value into the client
   bundle, which for an API key means publishing it. The affiliate IDs are the
   only variables that belong on the client, and they already carry the prefix.
3. Redeploy after adding variables. Vercel injects them at build and runtime, so
   an existing deployment does not pick them up on its own.

### Function timeout

`/api/detect` declares `maxDuration = 60` (seconds), the ceiling on the Hobby
plan. The live product stage is bounded separately by
`CONTEXT_DEV_DEADLINE_MS` (45s by default), which must stay **below**
`maxDuration`: the deadline degrades gracefully to catalogue products, whereas a
platform timeout returns a `504` with no result at all. If you raise one, raise
the other.

## Swapping the demo looks for photography

The landing page's showcase image is read from `src/lib/showcase.ts` and expects
`public/examples/pink-outfit.jpg` — a **2:3 portrait** shot of a full look. Drop
the file in and the hero picks it up with no code change; until then a
placeholder plate stands in so the hero never shows a broken image. See
[`public/examples/README.md`](public/examples/README.md) for the requirements and
the calibrated box coordinates.

The four `exampleId` scenarios still ship as SVG illustrations. Replacing those
with real photography is a three-step change:

1. **Drop the files in `public/examples/`** (`.jpg` or `.webp`). Portrait
   crops around 3:4 match the layout. Use imagery you have the rights to —
   the Unsplash and Pexels licences both permit commercial use without
   attribution, but check the individual photo.
2. **Point at them** in `src/lib/examples.ts` — change each entry's `src`.
   Nothing else in the code cares about the file type.
3. **Re-calibrate the hotspots** in `src/services/mockCatalog.ts`. Each
   detection's `boundingBox` is normalised to the displayed image:
   `{ x, y, width, height }` all in 0–1, measured from the top-left. So an item
   whose box starts 30% across and 25% down and covers 40% × 30% of the frame
   is `{ x: 0.3, y: 0.25, width: 0.4, height: 0.3 }`. The scenario keys map to
   the `ExampleId`s: `streetwear`, `glam-makeup`, `tailoring`, `soft-minimal`.

Sizing is handled for you: `prepareImage()` in `src/lib/imageSession.ts`
downscales anything over 1600px on its longest edge and re-encodes to JPEG
before it reaches sessionStorage. Without that, a multi-megabyte photo blows
past the ~4–5 MB sessionStorage quota, the write fails silently and `/analyze`
finds nothing to scan.

## Notes and limits

- Product data in the mock engine is illustrative. Prices, stock and URLs are
  fabricated demo content and are not live merchant data. The TRY figures were
  converted from the original USD placeholders at a nominal rate and rounded to
  plausible retail price points — they track no real exchange rate.
- The demo looks are placeholder SVG illustrations bundled in `public/examples`,
  pending real photography — see below.
- Google Cloud Vision does not accept SVG input, so the bundled demo looks
  always resolve through the mock path.
- The streamed `MATCHING… → IDENTIFIED` reveal is presentational: the engine
  returns all detections in one response, and the rail paces them out.
- Live mode costs credits per scan: roughly one web search plus
  `CONTEXT_DEV_EXTRACTS_PER_QUERY` extracts per resolved detection. Tune
  `CONTEXT_DEV_MAX_LIVE_ITEMS` before pointing it at a busy environment.
- Live product and logo images are hotlinked from retailer/Context.dev CDNs.
  `ProductImage` falls back to a neutral placeholder when one fails, since
  retailer CDNs can rate-limit or block hotlinking.
