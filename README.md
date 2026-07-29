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
                                                  interactive bounding boxes
                                                  + product match cards
```

1. **Home** (`/`) — drag-and-drop uploader (`.jpg`, `.png`, `.webp`, 8 MB cap)
   plus two "try an example image" demos. The image is held in `sessionStorage`
   and never leaves the browser until a scan is triggered.
2. **Analyze** (`/analyze`) — posts the image to `/api/detect`, shows an animated
   scanning state, then draws numbered, clickable hotspots over every detected
   item. Tapping a hotspot filters the results pane to that item (and vice
   versa).
3. **Results** — split into **Clothing & Accessories** and **Beauty &
   Cosmetics**. Each detected item shows one exact match / closest look and 2–3
   cheaper alternatives with a "% less" badge, retailer, price and a
   **Get this item** CTA wrapped in an affiliate link.

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
carries `source: "mock"` and the UI shows that as a badge, so degraded results
are never presented as real detections.

**Bounding boxes are always normalised (0–1)**, which is what lets the overlay
scale with any container without measuring the image.

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
src/
├── app/
│   ├── page.tsx                 # Hero + upload
│   ├── analyze/page.tsx         # Interactive analysis & results
│   └── api/detect/route.ts      # Image validation + engine dispatch
├── components/
│   ├── ImageUploader.tsx        # react-dropzone upload + examples
│   ├── BoundingBoxOverlay.tsx   # Clickable hotspots on the screenshot
│   ├── DetectionResults.tsx     # Categorised results pane
│   ├── ProductCard.tsx          # Product card + affiliate CTA
│   ├── ResultsSkeleton.tsx      # Loading state
│   └── ui/                      # shadcn primitives
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
- The example screenshots are SVG illustrations bundled in `public/examples`;
  the mock bounding boxes are hand-tuned to them, so changing an illustration
  means re-checking the boxes for its scenario id.
- Google Cloud Vision does not accept SVG input, so the bundled examples always
  resolve through the mock path.
