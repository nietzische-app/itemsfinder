# Get The Look

Upload a screenshot of an outfit or a makeup look from Instagram/TikTok, and
get back the exact items — plus budget-friendly alternatives with affiliate
purchase links.

This is the MVP: a complete, clickable product built on a swappable detection
engine. It runs out of the box with **no API keys**.

```bash
npm install
npm run dev      # http://localhost:3000
```

## How it works

```
screenshot ──▶ /api/detect ──▶ VisualSearchService ──▶ DetectionResult
                                   │                        │
                     Google Vision │ or │ Mock              ▼
                                                  coral hotspots on the image
                                                  + "AI Detected Items" rail
```

1. **Home** (`/`) — hero with the upload zone, plus a staggered masonry of four
   curated demo looks. The image is held in `sessionStorage` and never leaves
   the browser until a scan is triggered.
2. **Analyze** (`/analyze`) — a two-pane workspace. The image sits on the left
   with a scan sweep and a pulsing coral hotspot per detection; the right rail
   streams detections in one at a time, each moving from `MATCHING…` to
   `IDENTIFIED`.
3. **Matches** — hovering a hotspot reveals its bounding box and a frosted
   quick-look card. Selecting one expands that detection in the rail to show
   the exact match and 2–3 cheaper alternatives with a "% less" badge,
   retailer, price and a **Get this item** CTA wrapped in an affiliate link.
   Detections are grouped into **Clothing & Accessories** and **Beauty &
   Cosmetics**; the footer opens the whole curated look with both an as-is and
   a cheapest-route total.

## Design system

The interface implements the Stitch design in [`design/DESIGN.md`](design/DESIGN.md)
(reference renders alongside it): editorial "quiet luxury" — a warm off-white
canvas with pure-white cards lifting off it, matte black for navigation and
core CTAs, and a single coral accent reserved for hotspots and conversion.
Plus Jakarta Sans for headlines, Inter for body, on an 8px baseline.

Its tokens are the Tailwind theme, using the same names as the design doc
(`surface`, `on-surface-variant`, `outline`, `secondary`, `label-sm` …) so the
two stay one vocabulary. The palette is deliberately light-only: the depth
model depends on white-on-off-white, which a dark inversion would lose.

> One gotcha worth knowing: because the theme replaces Tailwind's default
> colour and font-size scales, `tailwind-merge` is extended with both in
> `src/lib/utils.ts`. Without that it cannot tell `text-on-primary` (a colour)
> from `text-body-md` (a size), treats them as conflicting, and silently drops
> one.

## The detection engine

`src/services/visualSearch.ts` defines a single interface:

```ts
interface VisualSearchService {
  readonly source: DetectionSource;
  analyze(input: VisualSearchInput): Promise<DetectionResult>;
}
```

Two implementations ship with the app, chosen by `getVisualSearchService()`:

| Implementation                | Used when                                    |
| ----------------------------- | -------------------------------------------- |
| `MockVisualSearchService`     | No API key, or `USE_MOCK_VISION=true`        |
| `GoogleVisionSearchService`   | `GOOGLE_CLOUD_VISION_API_KEY` is set         |

The Google implementation calls `images:annotate` with `OBJECT_LOCALIZATION`
(what and where), `WEB_DETECTION` (brand-aware naming, so "Outerwear" becomes
"biker jacket") and `IMAGE_PROPERTIES` (dominant colour). If the live provider
fails, `/api/detect` degrades to the mock rather than erroring — the response
carries `source: "mock"`, so degraded results are never presented as real
detections.

**Bounding boxes are always normalised (0–1)**, which is what lets the overlay
place hotspots and boxes at any image size without measuring anything.

### Wiring up real products

Vision tells you *what* is in the image; it does not tell you *what to buy*.
That second half lives behind one function:

```ts
findProductsForLabel(label, category) // src/services/mockCatalog.ts
```

Replace it with a merchant feed query or an embedding similarity search and the
rest of the app is unchanged.

## Affiliate links

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
│   ├── page.tsx                 # Hero, upload zone, demo looks
│   ├── analyze/page.tsx         # Scanning workspace + detection streaming
│   └── api/detect/route.ts      # Image validation + engine dispatch
├── components/
│   ├── ImageUploader.tsx        # react-dropzone upload zone
│   ├── DemoLookGrid.tsx         # Staggered masonry of curated looks
│   ├── BoundingBoxOverlay.tsx   # Hotspots, boxes, quick-looks, scan status
│   ├── DetectedItemsPanel.tsx   # "AI Detected Items" rail + curated dialog
│   ├── ProductCard.tsx          # Product surface + affiliate CTA
│   ├── ResultsSkeleton.tsx      # Loading state
│   ├── SiteHeader.tsx           # Top app bar
│   ├── MobileNav.tsx            # Bottom tab bar (mobile)
│   └── ui/                      # shadcn primitives on the design tokens
├── services/
│   ├── visualSearch.ts          # Interface + Mock + Google Vision
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

## Notes and limits

- Product data in the mock engine is illustrative. Prices, stock and URLs are
  fabricated demo content and are not live merchant data.
- The demo looks are SVG illustrations bundled in `public/examples`; the mock
  bounding boxes are hand-tuned to them, so changing an illustration means
  re-checking the boxes for its scenario id in `mockCatalog.ts`.
- Google Cloud Vision does not accept SVG input, so the bundled demo looks
  always resolve through the mock path.
- The streamed `MATCHING… → IDENTIFIED` reveal is presentational: the engine
  returns all detections in one response, and the rail paces them out.
