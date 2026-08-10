import "server-only";

import { ContextDevService, type LiveProductCard } from "@/services/contextDevService";
import { productUrlOrEmpty } from "@/lib/productUrl";
import { merchantForDomain } from "@/services/merchantSearch";
import { familyOf } from "@/lib/itemFamily";
import {
  ALTERNATIVE_FLOOR,
  EXACT_MATCH_FLOOR,
  expectedAttributesOf,
  scoreTitleAgreement,
} from "@/lib/attributeMatch";
import { rejectProductTitle } from "@/lib/retailVocabulary";
import type { TraceCollector } from "@/lib/scanTrace";
import { buildSearchQuery, relaxedQueries } from "@/lib/searchQuery";
import { cropRegion } from "@/services/imageCrop";
import { getVisualLookup, visualLookupStatus } from "@/services/visualLookup";
import { getGoogleSearch, googleSearchStatus } from "@/services/googleSearch";
import { getStoreSearch, storeSearchStatus } from "@/services/storeSearch";
import { markupExtractionEnabled, productsFromMarkup } from "@/services/markupProducts";
import { productThumbnail } from "@/lib/productThumbnail";
import { hydrateProduct } from "@/services/mockCatalog";
import { fetchRemoteImage } from "@/services/remoteImage";
import { describeImage, visualSimilarity } from "@/services/visualDescriptor";
import type {
  BoundingBox,
  BrandMetadata,
  DetectedItem,
  DetectionResult,
  Merchant,
  ProductMatch,
  ProductSource,
} from "@/types";

/**
 * Product resolution — the stage that decides *what to buy* for each detection.
 *
 * This is deliberately separate from detection. Which engine found the items
 * (mock or Cloud Vision) and which engine priced them (mock catalogue or
 * Context.dev) are independent choices, and the UI reports both.
 *
 * Every provider must be total: a detection that cannot be resolved keeps the
 * products it arrived with, so the UI never loses a card.
 */
/**
 * What the product stage gets besides the detections.
 *
 * The image is here because comparing a product photo against the thing that was
 * actually scanned needs the pixels, and this is the only stage that has a reason
 * to look at a *retailer's* image. Carrying a descriptor on `DetectedItem` instead
 * would have put a 36-float vector per item onto the wire for a client that never
 * reads it.
 */
export interface EnrichContext {
  signal?: AbortSignal;
  /** Decoded upload, for measuring a detection crop against product photos. */
  image?: { buffer: Buffer; size?: { width: number; height: number } };
  /**
   * Where this stage records the rows it refused — see `lib/scanTrace.ts`.
   *
   * The reasons already exist and are already written for a human to read;
   * `rejectProductTitle` returns "kılıf değil, çanta arıyoruz" and not a code.
   * They were going to `console.warn` and nowhere else, which meant the answer to
   * "why is this product missing" lived in a log line nobody could correlate with
   * a scan.
   */
  trace?: TraceCollector;
}

export interface ProductProvider {
  readonly source: ProductSource;
  /** Returns the result with products filled in, plus provenance counters. */
  enrich(result: DetectionResult, context?: EnrichContext): Promise<DetectionResult>;
}

/* -------------------------------------------------------------------------- */
/*  Mock provider                                                             */
/* -------------------------------------------------------------------------- */

/**
 * No-op provider: detections already arrive carrying catalogue products, so
 * there is nothing to fetch. Exists so the composition has a uniform shape.
 */
export class MockProductProvider implements ProductProvider {
  readonly source: ProductSource = "mock";

  async enrich(result: DetectionResult): Promise<DetectionResult> {
    return { ...result, productSource: "mock", liveItemCount: 0 };
  }
}

/* -------------------------------------------------------------------------- */
/*  Context.dev provider                                                      */
/* -------------------------------------------------------------------------- */

export interface ContextDevProductProviderOptions {
  /**
   * Detections to resolve live, highest-confidence first. Each one costs a
   * search plus a few extracts, so this bounds both latency and credits.
   */
  maxLiveItems?: number;
  /** Detections resolved in parallel. Kept low for the 30 req/min rate limit. */
  concurrency?: number;
  /** Wall-clock budget for the whole live stage; anything unfinished stays mock. */
  deadlineMs?: number;
  /** Alternatives kept per detection. */
  maxAlternatives?: number;
  /**
   * Product photos fetched and measured per detection. Each is one outbound image
   * request inside the shared function budget, so it is bounded rather than "all".
   */
  visualCandidates?: number;
  /** Kill switch for the visual comparison. */
  visualRerank?: boolean;
}

/**
 * Replaces catalogue products with live inventory from Context.dev.
 *
 * Fallback is per-detection, not all-or-nothing: if the jacket resolves live
 * but the lipstick times out, the jacket goes live and the lipstick keeps its
 * catalogue row. `liveItemCount` reports exactly how many went live so the UI
 * can tell the truth rather than claiming a blanket "live".
 */
export class ContextDevProductProvider implements ProductProvider {
  readonly source: ProductSource = "context-dev";

  private readonly maxLiveItems: number;
  private readonly concurrency: number;
  private readonly deadlineMs: number;
  private readonly maxAlternatives: number;
  private readonly visualCandidates: number;
  private readonly visualRerank: boolean;

  constructor(
    private readonly context: ContextDevService,
    options: ContextDevProductProviderOptions = {},
  ) {
    this.maxLiveItems = options.maxLiveItems ?? 4;
    this.concurrency = options.concurrency ?? 2;
    this.deadlineMs = options.deadlineMs ?? 45_000;
    this.maxAlternatives = options.maxAlternatives ?? 3;
    this.visualCandidates = options.visualCandidates ?? 4;
    this.visualRerank = options.visualRerank ?? true;
  }

  async enrich(result: DetectionResult, context: EnrichContext = {}): Promise<DetectionResult> {
    const signal = context.signal;

    if (result.items.length === 0) {
      return { ...result, productSource: "mock", liveItemCount: 0 };
    }

    // A deadline for the stage as a whole. Individual SDK calls have their own
    // timeouts; this stops a slow tail from holding the whole scan hostage.
    const controller = new AbortController();
    const abortOnOuter = () => controller.abort();
    signal?.addEventListener("abort", abortOnOuter, { once: true });
    const deadline = setTimeout(() => controller.abort(), this.deadlineMs);

    /*
     * Görsel yolun durumu, tarama başına bir satır.
     *
     * Üç ayrı üretim çalıştırmasında `img:` kaydı çıkmadı ve sebebini her seferinde
     * tahmin etmek zorunda kaldık. Artık tahmin yok: bayrak, anahtar ve fotoğraf
     * koşullarının hangisinin eksik olduğu burada yazılı.
     */
    console.log(
      `[lens] ${visualLookupStatus()}` +
        (context.image ? "" : " (ayrıca bu taramada fotoğraf taşınmadı)"),
    );
    console.log(`[cse] ${googleSearchStatus()}`);
    console.log(`[mağaza] ${storeSearchStatus()}`);

    try {
      // Spend the budget on the detections the user is most likely to act on.
      const priority = [...result.items]
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, this.maxLiveItems);
      const targetIds = new Set(priority.map((item) => item.id));

      const resolved = new Map<string, DetectedItem>();

      await runWithConcurrency(priority, this.concurrency, async (item) => {
        if (controller.signal.aborted) return;

        /*
         * Sibling boxes travel with the item so the visual comparison can skip the
         * garments hanging over this one. Without it a crop of "the shorts" is 69%
         * pink cardigan on the reference photo, and the pixel comparison then
         * prefers pink shorts — the same occlusion error `regionColor` already
         * fixed for the colour measurement.
         */
        const siblings = result.items
          .filter((other) => other.id !== item.id)
          .map((other) => other.boundingBox);

        const live = await this.resolveItem(
          item,
          controller.signal,
          context.image,
          siblings,
          context.trace,
        );
        if (live) resolved.set(item.id, live);
      });

      const items = result.items.map((item) => resolved.get(item.id) ?? item);
      const liveItemCount = items.filter((item) =>
        targetIds.has(item.id) && resolved.has(item.id) ? true : false,
      ).length;

      return {
        ...result,
        items,
        // Claiming "live" with zero live rows would be a lie; say mock instead.
        productSource: liveItemCount > 0 ? "context-dev" : "mock",
        liveItemCount,
      };
    } finally {
      clearTimeout(deadline);
      signal?.removeEventListener("abort", abortOnOuter);
    }
  }

  /**
   * Visual similarity between the detection's crop and each candidate's photo.
   *
   * Keyed by `productUrl`; a key is absent when there was nothing to measure —
   * no upload, no product image, an undecodable one, or a row outside the budget.
   * Absent means "no visual evidence", which is treated differently from a low
   * score: the caller falls back to attribute agreement alone.
   *
   * Bounded to `visualCandidates` rows, chosen by attribute agreement, because each
   * one is an outbound image fetch inside a shared 60-second budget.
   */
  private async measureVisualSimilarity(
    scored: Array<{ card: LiveProductCard; agreement: { score: number } }>,
    item: DetectedItem,
    signal: AbortSignal,
    image?: EnrichContext["image"],
    siblings: BoundingBox[] = [],
  ): Promise<Map<string, number>> {
    const measured = new Map<string, number>();
    if (!image || !this.visualRerank) return measured;

    const crop = await cropRegion(image.buffer, item.boundingBox, {
      size: image.size,
      exclude: siblings,
    });
    if (!crop) return measured;

    const reference = await describeImage(Buffer.from(crop.base64, "base64"), {
      exclude: crop.masks,
    });
    if (!reference) return measured;

    const candidates = [...scored]
      .sort((a, b) => b.agreement.score - a.agreement.score)
      .slice(0, this.visualCandidates)
      .filter((entry) => Boolean(entry.card.imageUrl));

    await Promise.all(
      candidates.map(async (entry) => {
        const bytes = await fetchRemoteImage(entry.card.imageUrl!, { signal });
        if (!bytes) return;

        const descriptor = await describeImage(bytes);
        if (!descriptor) return;

        measured.set(entry.card.productUrl, visualSimilarity(reference, descriptor));
      }),
    );

    return measured;
  }

  /**
   * Giysi kırpımından doğrudan ürün kartları — metin sorgusundan geçmeden.
   *
   * Boş dizi «bu yol bir şey bulamadı» demek ve çağıran metin merdivenine
   * düşüyor. Bayrak kapalıyken ya da elde fotoğraf yokken tek bir çağrı bile
   * yapılmıyor.
   */
  private async resolveByImage(
    item: DetectedItem,
    signal: AbortSignal,
    image?: EnrichContext["image"],
    siblings: BoundingBox[] = [],
    trace?: TraceCollector,
  ): Promise<LiveProductCard[]> {
    const lookup = getVisualLookup();
    if (!lookup || !image) return [];

    /*
     * Kırpım, görsel benzerlik ölçümüyle **aynı** kırpım: aynı dolgu, aynı
     * kardeş maskesi. İki ayrı kırpım tanımı, aynı giysinin iki farklı hâlini
     * arayıp ölçmek olurdu.
     */
    const crop = await cropRegion(image.buffer, item.boundingBox, {
      size: image.size,
      exclude: siblings,
    });
    if (!crop) {
      // Kırpılamayan bir kutu, görsel yolun sessizce atladığı üçüncü durumdu.
      trace?.degrade("products", `«${item.itemType}» kırpılamadı — görsel arama atlandı`);
      return [];
    }

    const lookupStartedAt = Date.now();
    const { urls, seen } = await lookup.findProductPages(crop.base64, signal);

    trace?.search({
      itemId: item.id,
      source: "görsel",
      // Katman ve basamak metin merdiveninin kavramları; görsel yolda ikisi de yok.
      tier: "tr",
      rung: 0,
      query: `${item.itemType} kırpımı (${crop.width}×${crop.height})`,
      found: urls.length,
      ms: Date.now() - lookupStartedAt,
    });

    if (urls.length === 0) {
      if (seen > 0) {
        trace?.degrade(
          "products",
          `görsel arama ${seen} sonuç buldu, hiçbiri ürün sayfası değildi`,
        );
      }
      return [];
    }

    return this.extractFrom(urls, signal, trace);
  }

  /**
   * Aday adresleri bulur — iki sağlayıcıdan biriyle.
   *
   * Aday bulma zincirin ilk halkası ve tek satıcıya bağlıydı: `web.search` ölünce
   * (üretimde `401 USAGE_EXCEEDED`) çıkarılacak sayfa da kalmıyor, yani işaretleme
   * okuma yolu tek başına kurtarmıyor.
   *
   * Google Programmable Search açıksa **önce** o deneniyor. Sıra kasıtlı: bir
   * geri düşüş kurgusu ölü bir anahtara her seferinde bir gidiş dönüş harcatırdı,
   * ve context.dev kredisi bittiğinde durum tam olarak buydu. Boş dönerse
   * merdiven olduğu gibi devrede.
   *
   * Merdivenin yalnızca ilk basamağı CSE'ye gidiyor: gevşetme `web.search`'ün
   * sıfır sonucuna karşı yazılmıştı, CSE ise zaten alan adına kısıtlı bir web
   * araması ve kotası günlük — üç kat sorgu harcamadan önce ölçülmesi gerekiyor.
   */
  private async discoverCandidates(
    ladder: string[],
    item: DetectedItem,
    signal: AbortSignal,
    trace?: TraceCollector,
  ): Promise<string[]> {
    const google = getGoogleSearch();

    if (google && ladder[0]) {
      const startedAt = Date.now();
      const { urls, seen, error } = await google.findProductPages(ladder[0], item.category, signal);

      trace?.search({
        itemId: item.id,
        source: "cse",
        tier: "tr",
        rung: 0,
        query: ladder[0],
        found: urls.length,
        ms: Date.now() - startedAt,
        error,
      });

      if (urls.length > 0) return urls;
      if (seen > 0) {
        trace?.degrade("products", `Google araması ${seen} sonuç buldu, hiçbiri ürün sayfası değildi`);
      }
    }

    /*
     * Mağazanın kendi arama sayfası — satıcısız ve ücretsiz yol.
     *
     * Sıra kasıtlı: context.dev'den önce geliyor çünkü kredi harcamıyor, ve
     * Google'dan sonra geliyor çünkü Google tek istekte on dokuz mağazayı birden
     * tarardı. Boş dönerse merdiven olduğu gibi devrede — ölçülmüş bir yolun,
     * ölçülmüş başka bir yolu kaldırması için gerekçe yok.
     *
     * Yalnızca ilk basamak: gevşetme `web.search`'ün sıfır sonucuna karşı
     * yazılmıştı, burada her basamak mağaza başına bir HTTP isteği demek.
     */
    const stores = getStoreSearch();

    if (stores && ladder[0]) {
      const startedAt = Date.now();
      const { urls, seen, error } = await stores.findProductPages(ladder[0], signal);

      trace?.search({
        itemId: item.id,
        source: "mağaza",
        tier: "tr",
        rung: 0,
        query: ladder[0],
        found: urls.length,
        ms: Date.now() - startedAt,
        error,
      });

      if (urls.length > 0) return urls;
      if (seen > 0) {
        trace?.degrade(
          "products",
          `mağaza aramaları ${seen} ürün sayfası buldu, hiçbiri sorguyla eşleşmedi`,
        );
      }
    }

    return this.context.findCandidateUrls(
      ladder,
      item.category,
      signal,
      (attempt) => trace?.search({ itemId: item.id, ...attempt }),
    );
  }

  /**
   * Aday adreslerden kart çıkarır — iki yoldan biriyle.
   *
   * Varsayılan `web.extract`: sayfayı bir modele okutuyor, doğru ama pahalı ve
   * tek satıcıya bağlı. `ENABLE_MARKUP_EXTRACT` açıkken önce mağazanın kendi
   * schema.org işaretlemesi deneniyor — orada fiyat, stok ve puan zaten yazılı,
   * yani çıkarıma gerek yok ve uydurma ihtimali de yok.
   *
   * Sıra kasıtlı ve geri düşüşlü: işaretleme okunamazsa (sayfa bot duvarına
   * takıldı, ya da mağaza işaretleme koymuyor) `web.extract` devrede kalıyor.
   * Ölçülmemiş bir yolun, ölçülmüş bir yolu kaldırması için gerekçe yok.
   */
  private async extractFrom(
    urls: string[],
    signal: AbortSignal,
    trace?: TraceCollector,
  ): Promise<LiveProductCard[]> {
    /*
     * Aday yoksa çıkaracak bir şey de yok.
     *
     * Üretim logu bunu «0 sayfanın işaretlemesi okunamadı — çıkarıma düşüldü»
     * diye yazdı, iki kez. Oysa okunamayan bir şey yoktu: arama hiç aday
     * döndürmemişti. Olmayan bir başarısızlığı raporlamak, `degraded` listesini
     * gerçek arızaların arasına gürültü katıyor — ve o liste arayüzde amber bir
     * uyarı olarak çiziliyor.
     */
    if (urls.length === 0) return [];

    if (markupExtractionEnabled()) {
      const cards = await productsFromMarkup(urls, signal);
      if (cards.length > 0) return cards;

      trace?.degrade(
        "products",
        `${urls.length} sayfanın işaretlemesi okunamadı — çıkarıma düşüldü`,
      );
    }

    return this.context.productsFromUrls(urls, signal);
  }

  /** Resolves one detection, or `null` to keep its catalogue products. */
  private async resolveItem(
    item: DetectedItem,
    signal: AbortSignal,
    image?: EnrichContext["image"],
    siblings: BoundingBox[] = [],
    trace?: TraceCollector,
  ): Promise<DetectedItem | null> {
    /*
     * Tek bir sorgu değil, gevşeyen bir merdiven.
     *
     * En özel basamak renk + betimleyiciler + ürün adı; bir mağazada o
     * kombinasyonun tam karşılığı yoksa sıfır sonuç dönüyordu ve kullanıcı boş
     * ekran görüyordu — oysa aynı mağazada onlarca gömlek var. Arama ilk yeterli
     * sonuçta duruyor, yani sıradan durumda hâlâ tek arama yapılıyor.
     */
    /*
     * Önce görsel, sonra metin — ve görsel yol kapalı doğuyor.
     *
     * Metin yolu giysiyi kelimeye çevirip o kelimeyi arıyor, yani her adlandırma
     * hatası yanlış bir aramaya dönüşüyor (bölge rengi ölçülen %81). Kırpımın
     * kendisiyle aramak o adımı atlıyor. Sıra kasıtlı: görsel yol yeterince aday
     * bulursa metin araması hiç yapılmıyor, yani `web.search` kredisi de harcanmıyor.
     *
     * Bulamazsa metin merdiveni olduğu gibi devrede. Yeni yol eskisinin **önüne**
     * geçiyor, yerine değil — ölçülmemiş bir yolun, ölçülmüş bir yolu kaldırması
     * için hiçbir gerekçe yok.
     */
    const seenFromImage = await this.resolveByImage(item, signal, image, siblings, trace);

    let cards = seenFromImage;
    if (cards.length === 0) {
      const ladder = relaxedQueries({
        itemType: item.itemType,
        label: item.label,
        colorHex: item.colorHex,
        attributes: item.attributes,
      });

      const urls = await this.discoverCandidates(
        ladder.length > 0 ? ladder : [item.label],
        item,
        signal,
        trace,
      );

      /*
       * Çıkarım artık burada, servisin içinde değil.
       *
       * Ayrılmasının sebebi ölçülmüş bir kusur: işaretleme okuma yolu yalnızca
       * görsel arama dalına takılıydı, çünkü metin dalının çıkarımı
       * `searchLiveProducts`'ın **içine** gömülüydü. Yani `ENABLE_MARKUP_EXTRACT`
       * açıkken bile ana yolda hiç çalışmıyordu ve üretimde tek bir `[markup]`
       * satırı çıkmadı. Aday bulma ile kart çıkarma iki ayrı iş; ayrı durunca her
       * ikisinin de sağlayıcısı bağımsız seçilebiliyor.
       */
      cards = await this.extractFrom(urls, signal, trace);
    }

    if (cards.length === 0) return null;

    /*
     * Storefront search does not only return the thing you asked for. A query for
     * a black coat also returns the toddler's version, a coat hanger, and a phone
     * case that happens to be black — and this stage used to hand the top-ranked
     * row straight to the user as the "exact match". The catalogue path has always
     * been family-gated; live rows were the hole in that guarantee.
     *
     * The family is the detector's own ruling, carried on the item, not a fresh
     * guess from the label.
     */
    /*
     * Bağlantısı olmayan canlı satır hiç yarışmaya girmiyor.
     *
     * Çıkarım bazen ürün sayfası şeklinde bir adres bulamıyor (`productUrl: ""`).
     * Böyle bir satır yine de en iyi seçilebiliyordu ve katalogdaki satırın
     * **yerine geçiyordu** — katalog satırının doğrulanmış bir bağlantısı varken.
     * Sonuç: canlı yol açıldığında çalışan bir «Ürüne git» kaybolur, yerine
     * tıklanamayan bir kart gelirdi. Canlı verinin katalogdan kötü bir sonuç
     * üretebildiği tek yer burasıydı.
     *
     * Gerçek fiyat gösterip satın alma yolunu kapatmak, kataloğun tahmini
     * fiyatını gösterip gerçek bir bağlantı vermekten kötü.
     */
    const linkable = cards.filter((card) => card.productUrl.length > 0);
    if (linkable.length < cards.length) {
      trace?.degrade(
        "products",
        `${cards.length - linkable.length} canlı satır bağlantısız geldi — elendi`,
      );
    }
    if (linkable.length === 0) return null;

    const family = item.family ?? familyOf(`${item.itemType} ${item.label}`);
    const rejected: string[] = [];
    const usable = linkable.filter((card) => {
      const reason = rejectProductTitle(card.title, family);
      if (reason) {
        rejected.push(`"${card.title}" (${reason})`);
        trace?.reject({ itemId: item.id, title: card.title, reason });
      }
      return reason === null;
    });

    if (rejected.length > 0) {
      // One line per detection, not per row: a noisy query can reject ten.
      console.warn(
        `[products] ${rejected.length}/${cards.length} canlı satır «${item.itemType}» ` +
          `(${family}) için elendi: ${rejected.slice(0, 3).join("; ")}`,
      );
    }

    // Everything plausible was filtered out, so there is nothing live to show.
    // The catalogue row is a worse price but a correct product.
    if (usable.length === 0) return null;

    /*
     * Rank by measured attribute agreement, not by what the search engine ranked
     * first. The family gate says a row is the right *kind* of product; it still
     * leaves a beige linen blazer eligible for a black leather blazer, and search
     * rank has no opinion about that. `scoreTitleAgreement` does, and the number it
     * returns is the one shown on the card — so the match percentage finally
     * corresponds to something instead of being a constant.
     */
    const expected = expectedAttributesOf(item);
    const scored = usable.map((card) => ({
      card,
      agreement: scoreTitleAgreement(card.title, expected),
    }));

    /*
     * Visual measurement, where there is anything to measure.
     *
     * Titles are a claim about a product; the photograph is the product. Two rows
     * that both say "Siyah Deri Ceket" are indistinguishable to the scorer above,
     * and one of them looks like what the user scanned. Bounded to the top few by
     * agreement, so this costs a handful of small image fetches, and it degrades to
     * `null` per row rather than failing the detection.
     */
    const visual = await this.measureVisualSimilarity(scored, item, signal, image, siblings);

    const ranked = scored
      .map((entry) => {
        const seen = visual.get(entry.card.productUrl);
        return {
          ...entry,
          visual: seen ?? null,
          /*
           * Blended for *ranking and display*. The gate below still tests the
           * attribute agreement alone: a correct row can look unlike the photo for
           * honest reasons — studio lighting, a flat-lay, a different pose — and
           * demoting it out of the exact-match slot for that would be trading a
           * reliable signal for a noisy one.
           */
          score:
            seen === undefined
              ? entry.agreement.score
              : Math.round((0.6 * entry.agreement.score + 0.4 * seen) * 100) / 100,
        };
      })
      /*
       * Stokta olan önce — puan farkı küçükken.
       *
       * Sıralama yalnızca puana bakıyordu, yani tükenmiş bir ürün başrolü («birebir
       * eşleşme») alabiliyor ve satın alınabilir bir muadil altında kalabiliyordu.
       * Kart «Tükendi» yazıyor, yani kimse kandırılmıyor — ama sonucun en görünür
       * yeri tıklanınca alınamayan bir ürün oluyor, ki hedef tam olarak bunun
       * tersi.
       *
       * Eşik neden var: stok her şeyi ezerse, doğru ürünün tükenmiş hâli yerine
       * yanlış ürünün stoktaki hâli başrole geçer — bu daha kötü. Beş puanlık fark
       * (0.05) "ikisi de aynı derecede iyi eşleşme" demek için makul bir aralık;
       * ötesinde puan kazanıyor.
       */
      .sort((a, b) => {
        const close = Math.abs(a.score - b.score) <= 0.05;
        if (close && a.card.inStock !== b.card.inStock) return a.card.inStock ? -1 : 1;
        return b.score - a.score || a.card.price - b.card.price;
      });

    const leader = ranked[0];
    if (!leader) return null;

    /*
     * The exact-match slot is a promise. A row only holds it if it clears the floor
     * *and* does not contradict the detected colour — a shopper who scanned a black
     * jacket and is shown a beige one as the "birebir eşleşme" has been lied to,
     * however well the rest of the words line up. Otherwise the catalogue row keeps
     * the slot: a worse price for a product that is actually what they scanned, and
     * the live rows are still offered as alternatives.
     */
    const leaderQualifies =
      leader.agreement.score >= EXACT_MATCH_FLOOR && leader.agreement.color !== "conflict";

    if (!leaderQualifies) {
      console.warn(
        `[products] «${item.itemType}» için canlı birebir eşleşme yok: en iyi satır ` +
          `"${leader.card.title}" %${Math.round(leader.agreement.score * 100)} ` +
          `(${leader.agreement.reason}` +
          `${leader.visual === null ? "" : `; görsel %${Math.round(leader.visual * 100)}`}` +
          `); katalog satırı korunuyor`,
      );
    }

    const best = leaderQualifies ? leader : null;
    const rest = leaderQualifies ? ranked.slice(1) : ranked;

    // Alternatives keep agreement order too — a cheaper row that is the wrong
    // colour is not a better deal, it is a different product. Rows below the
    // alternative floor are dropped rather than shown under a near-zero score.
    const alternatives = rest
      .filter((entry) => entry.score >= ALTERNATIVE_FLOOR)
      .slice(0, this.maxAlternatives);

    // Nothing survived either floor, so there is no live data for this detection.
    if (!best && alternatives.length === 0) return null;
    const cheapest = alternatives.reduce<number>(
      (min, entry) => Math.min(min, entry.card.price),
      Number.POSITIVE_INFINITY,
    );

    // One brand lookup per distinct retailer in this detection's result set.
    const domains = Array.from(
      new Set(
        [...(best ? [best] : []), ...alternatives]
          .map((entry) => entry.card.merchantDomain)
          .filter(Boolean),
      ),
    );
    const brands = new Map<string, BrandMetadata | null>();

    await Promise.all(
      domains.map(async (domain) => {
        brands.set(domain, await this.context.enrichBrandMetadata(domain, signal));
      }),
    );

    return {
      ...item,
      exactMatch: best
        ? toProductMatch(best.card, {
            id: `${item.id}-live-exact`,
            matchType: "exact",
            // Measured: attribute agreement, blended with visual similarity where
            // a product photo was available. Never a constant.
            similarity: best.score,
            tag: "Canlı",
            brand: brands.get(best.card.merchantDomain) ?? null,
            colorHex: item.colorHex,
          })
        : item.exactMatch,
      alternatives: alternatives.map((entry, index) =>
        toProductMatch(entry.card, {
          id: `${item.id}-live-alt-${index}`,
          matchType: "alternative",
          similarity: entry.score,
          tag: entry.card.price === cheapest ? "En uygun" : undefined,
          brand: brands.get(entry.card.merchantDomain) ?? null,
          colorHex: item.colorHex,
        }),
      ),
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Mapping                                                                   */
/* -------------------------------------------------------------------------- */


interface ProductMatchOverrides {
  id: string;
  matchType: ProductMatch["matchType"];
  similarity: number;
  tag?: string;
  brand: BrandMetadata | null;
  /** The detection's colour, used when the retailer supplied no image. */
  colorHex: string;
}


function toProductMatch(
  card: LiveProductCard,
  overrides: ProductMatchOverrides,
): ProductMatch {
  const merchant = merchantForDomain(card.merchantDomain);
  // Product detail page or no link at all — the extractor already applies this,
  // and applying it again here means no future caller can bypass the ban by
  // constructing a LiveProductCard directly.
  const productUrl = productUrlOrEmpty(card.productUrl);
  const isUsableUrl = productUrl.length > 0;

  return {
    id: overrides.id,
    title: card.title,
    brand: card.brand ?? overrides.brand?.name ?? card.merchantName,
    merchant,
    price: card.price,
    currency: card.currency,
    productUrl,
    // Live rows are real product pages, not storefront searches.
    urlKind: "product",
    // Live listings without an image fall back to the neutral placeholder the
    // catalogue uses, so cards never render an empty box.
    imageUrl: card.imageUrl ?? placeholderImage(card.title, overrides.colorHex),
    matchType: overrides.matchType,
    similarity: overrides.similarity,
    tag: overrides.tag,
    // A row we cannot link to is not buyable, whatever the page claimed.
    inStock: card.inStock && isUsableUrl,
    merchantDomain: card.merchantDomain,
    isLive: true,
    brandMetadata: overrides.brand ?? undefined,
    /*
     * Puan yalnızca canlı satırlarda: katalogda karşılığı yok, çünkü uydurma bir
     * puan gerçek bir mağaza bağlantısının yanında uydurma bir fiyat kadar
     * yanıltıcı olur. `?? undefined`, alan yoksa hiç taşınmaması için.
     */
    rating: card.rating ?? undefined,
    // Adet puansız gelemiyor: kural `ratingOf` içinde, kaynakta uygulanıyor.
    reviewCount: card.reviewCount ?? undefined,
  };
}

/**
 * Fallback for a live row whose retailer supplied no image.
 *
 * Uses the same silhouette the catalogue draws, in the *detected* colour — this row
 * is an answer to a specific detection, so its colour is known even when its picture
 * is not. The previous version stamped two initials on a grey box, which read as a
 * broken image rather than as a product.
 */
function placeholderImage(title: string, colorHex: string): string {
  return productThumbnail(title, colorHex);
}

/* -------------------------------------------------------------------------- */
/*  Utilities                                                                 */
/* -------------------------------------------------------------------------- */

/** Runs `worker` over `items`, at most `limit` at a time. Never rejects. */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]!;
      try {
        await worker(item);
      } catch (error) {
        // A single failed detection must not abort the others; it simply keeps
        // its catalogue products.
        console.warn("[products] live resolution failed:", error);
      }
    }
  });

  await Promise.all(runners);
}

/** Re-exported so the Vision path can hydrate catalogue lookups. */
export { hydrateProduct };
