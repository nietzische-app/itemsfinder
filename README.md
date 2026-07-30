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

1. **Home** (`/`) — hero with an auto-playing live-scan showcase: a real look
   under a sweeping coral beam, a pulsing hotspot per detected garment, and a
   product card that follows the focus. Four looks are switchable, and "Bu
   taramayı aç" runs the selected one through the real pipeline. Below it, the
   upload zone; the image is held in `sessionStorage` and never leaves the
   browser until a scan is triggered.
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


## Detection cleanup

Vision's OBJECT_LOCALIZATION is generous. A three-piece outfit came back as eight
or more boxes, because it reports the same garment at several granularities
("Clothing" over "Outerwear" over "Top" on one cardigan) and each shoe of a pair
separately — and every one of those became a hotspot.

`src/lib/detectionFilter.ts` reduces them: a 0.65 confidence floor, suppression of
nested boxes (containment ≥ 0.7) and overlapping ones (IoU ≥ 0.4), a merge of
same-family neighbours so a pair of shoes is one hotspot, and a cap of 4.

Ordering is the subtle part: candidates are ranked by **specificity before
confidence**. Vision scores the generic "Clothing" box *higher* than the
"Outerwear" box inside it, so plain score order keeps the useless one and
suppresses both real garments. A named family always outranks `unknown`.

The "Person" box, previously discarded, is now the frame of reference.
`familyFitsBody` rejects the physically impossible — shoes at chest height, a top
at ankle height — with deliberately one-sided, generous bounds: Vision sometimes
returns a half-body crop, and tight bands would silently drop real detections,
which is worse than letting noise through.

### Per-region colour

IMAGE_PROPERTIES describes the **whole frame**. Applying its dominant colour to
every detection meant that on a photo dominated by a pink cardigan, the black
shorts and the monochrome sneakers were both labelled "pudra" — and colour leads
the generated search query, so every lookup inherited the error.

`src/services/regionColor.ts` samples each box locally with `sharp`, from bytes
the request already has (no extra Vision calls). Two details earn their keep:

- It returns the mean of the **largest colour bucket**, not the mean of all
  pixels. Averaging a black-and-white sneaker gives grey — a colour the shoe does
  not contain and a word nobody searches.
- It **excludes overlapping detections** while sampling. The box is not the
  garment: on the reference photo the cardigan hangs over 69% of the shorts box,
  so sampling the box alone still returned pink for the shorts.

Measured on `look-pink-knit.jpg`: cardigan `#efb8c9` (Pudra), shorts `#333046`
(Antrasit), sneakers `#352a32` (Antrasit) — three distinct colours where all three
were previously "Pudra".

> `sharp` is a native dependency and adds to the serverless bundle. It is only
> imported by `regionColor.ts`, which is `server-only`, so it never reaches the
> client; Vercel supports it natively.

## Measuring detection accuracy

```bash
npm run eval          # colour, query and family metrics; no API key needed
npm run eval:record   # capture real Vision responses as fixtures (needs a key)
```

Every earlier round of accuracy work was judged by looking at a screenshot, which
is how a whole-image dominant colour survived long enough to label black shorts
"pudra". [`eval/`](eval/README.md) replaces that with numbers: four labelled
photographs, fourteen items, and a non-zero exit code when a metric drops below
its floor — so it gates a change the way `tsc` does.

It is a smoke test, not a benchmark, and the point is the direction the score
moves rather than its absolute value. Its first run took colour accuracy from 57%
to 71% by exposing two colour-*classification* bugs, and it rejected three
plausible-sounding fixes for the rest (a larger sampling inset, background-colour
rejection, and a dominance abstention threshold) by measuring that each one made
things worse. The remaining four failures are one documented class — the garment
is a minority of its own bounding box — which needs a real mask, not another
constant. `eval/README.md` records all of that.

## Product links: PDP or nothing

A product CTA navigates to a product detail page or it does not navigate at all.
Storefront search URLs are **banned**, not de-prioritised — no
`zara.com/search?searchTerm=`, no `trendyol.com/sr?q=`.

`src/lib/productUrl.ts` is the only place that decides, and everything that can
put a link in front of a shopper routes through it: the Context.dev extractor,
the live product provider and the demo catalogue. Search shapes are tested
*before* PDP shapes, because `search-results.html?q=x` matches `.html` and would
otherwise pass as a product page. `ProductMatch["urlKind"]` is a single-member
union (`"product"`), so code trying to emit a search kind fails to compile.

An unverifiable link becomes `productUrl: ""` and the card renders **"Bağlantı
doğrulanmadı"** instead of a CTA. That is deliberate: an inert card costs a
shopper nothing, a CTA that lands on a results page costs them a tap and their
trust.

### Filling in the demo links

`src/data/verifiedProductUrls.ts` maps catalogue product ids to live PDP URLs and
ships **empty**, so every demo CTA is currently inert. The URLs cannot be
generated — a PDP path encodes a retailer's internal SKU (`-p-123456789`,
`/dp/B0XXXXXXXX`), an invented id is a guaranteed 404, and verifying one means
fetching it. Paste real URLs in and they light up; every entry is shape-validated
on import, so a malformed or search-shaped link throws at startup rather than
shipping.

Product **photographs** work the same way: `VERIFIED_PDP_IMAGES` in the same file
holds the retailer's own image URL per product, hotlinked rather than copied.
Until an entry exists, `src/lib/productThumbnail.ts` draws a garment silhouette in
the product's colour — not a photograph, and it does not pretend to be one.

```bash
npm run check:pdp                     # grouped by retailer, exact matches first
npm run check:pdp -- --exact          # only the rows a shopper sees before expanding
npm run check:pdp -- --merchant=Zara  # one store at a time
npm run check:pdp -- --paste          # just the code block to paste
npm run fetch:images                  # og:image per verified PDP (needs network)
```

`fetch:images` runs on your machine, not in CI: it needs a route to the retailers.
It prints a block to paste rather than writing the file, so a wrong-looking image
never lands without someone having seen it.

The next phase of work — what is missing, in what order, and what has to turn
green for each item to count as done — is in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Rate limiting and the daily budget

`/api/detect` is unauthenticated and every call spends money — a Vision request,
up to `VLM_MAX_ITEMS` model calls, a Context.dev search plus extracts, and a few
product-image fetches. `src/services/rateLimit.ts` puts two per-client tiers
(minute and day) and a client-independent daily ceiling in front of it, checked
*before* the request body is read so an abusive client does not cost bandwidth
first.

At 80% of `SCAN_DAILY_BUDGET` the paid enrichment stages switch off by
themselves: the scan still returns a real answer from detection and the
catalogue, without the model attribute pass or the live product lookup. Past the
ceiling the endpoint answers 503 — it does not quietly serve demo data under the
badge of a real scan.

Counters live behind `RateLimitStore`: in-memory for development, Upstash Redis
over REST for production. Without `UPSTASH_REDIS_REST_URL` / `_TOKEN` the
counters are process-local, which in a serverless deployment means per-instance —
i.e. not a limit. The app logs that as an error on startup in production rather
than letting it pass silently.

It fails **open**: if the counter store is unreachable the scan is allowed and
the outage is logged. A Redis outage taking the product down would be the worse
failure, and the daily ceiling is what actually bounds the bill.

This is not authentication. Client IPs come from `x-forwarded-for`, which an
attacker with an address pool walks around; it is a speed bump on casual abuse
plus a ceiling that does not care whose address it is.

## Tools

`tools/box-editor.html` — ground-truth box editor for the eval set. Open the file
in a browser, drag a photo onto it, draw boxes, fill in the per-item expectations,
and copy out the `SHOWCASE_LOOKS` and `EXPECTATIONS` entries. Standalone: no
server, no build step, no route added to the app, and it works on photos that are
still in your downloads folder. Arrow keys nudge the selected box by one pixel
(Shift for ten) because the last two pixels of a box are the whole point; work in
progress is autosaved per image.

It exists because the eval has to grow from four photos to thirty or more, and
measuring fifty photographs by counting pixels in an image viewer is not something
anyone finishes.

Grouped by **retailer** rather than by look, because that is how the work
actually goes: open one store, find its products, move on. Each row carries a
search link for that store so the product page is one click away, and the run
ends with a paste-ready block of ids for `VERIFIED_PDP_URLS`. Those search links
are a research aid, not product URLs — pasting one in by mistake throws on
import.

Partial is fine. A product with no entry renders inert; it does not fall back to
anything.

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
│   ├── SiteHeader.tsx           # Top app bar: logo + "Görsel Yükle" (+ saved count when non-empty)
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

## Demo photography

The landing page's showcase cycles four real looks, defined in
`src/lib/showcase.ts` and shipped in `public/examples/look-*.jpg`. Each look
carries its own hand-measured detection boxes and its own `exampleId`, so "Bu
taramayı aç" runs the selected look through the real pipeline.

The boxes are defined once, in `SHOWCASE_LOOKS`, and read back out by
`mockCatalog.ts` via `showcaseBox()` — so the hero hotspots and the `/analyze`
overlay cannot drift apart, and re-calibrating after swapping a photo is a
single edit.

Two things matter when replacing a photo, both covered in
[`public/examples/README.md`](public/examples/README.md): the frame's aspect
ratio comes from `width`/`height` and a mismatch crops the image (sliding every
hotspot off its garment), and the `0..1` box coordinates are specific to that
framing and must be re-measured.

Assets are downscaled to 1100px wide at JPEG q0.82 — 638 KB for all four, from
22 MB of originals. `prepareImage()` in `src/lib/imageSession.ts` additionally
downscales anything a *user* uploads over 1600px before it reaches
sessionStorage; without that, a multi-megabyte photo blows past the ~4-5 MB
quota, the write fails silently and `/analyze` finds nothing to scan.

The four older `exampleId` scenarios still ship as SVG illustrations and are
reachable through the API, but are no longer surfaced on the landing page.

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
