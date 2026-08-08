/**
 * What happened during one scan.
 *
 * Until now the only thing production emitted was `console.warn`, which means the
 * answer to "why did this scan give a bad result?" was *look at a screenshot and
 * guess* — the exact habit that let a global dominant colour label black shorts
 * "pudra" for months. Every stage already knows why it did what it did; the
 * rejection reasons are even human-readable already (`rejectProductTitle`,
 * `scoreTitleAgreement`). Nothing collected them.
 *
 * Two consumers, deliberately kept apart:
 *
 *  - **timings**, which are half a dozen numbers and ride along on every response.
 *    They cost nothing and they are the first question anyone asks about a slow
 *    scan.
 *  - **the detail** — every candidate box, why it was dropped, every catalogue row
 *    that was considered and rejected. That is far too much for a normal response
 *    and it is only useful to whoever is debugging, so it is behind a flag.
 *
 * The detail view is also the labelling tool for `docs/ROADMAP.md` 1.1: reading
 * "which boxes did Vision draw and what did the filter do to them" off a live scan
 * is how the eval set gets built without hand-transcribing everything.
 *
 * Nothing here holds pixels, and nothing here holds anything identifying. It is
 * timings, box coordinates and text the pipeline itself produced — which matters,
 * because a diagnostics channel that quietly accumulated user photographs would be
 * a KVKK problem wearing a debugging hat.
 */

import type { BoundingBox } from "@/types";

/** Stages worth timing separately, in the order they run. */
export type ScanStage =
  | "decode"
  | "vision"
  | "foreground"
  | "regionColor"
  | "crop"
  | "vlm"
  | "products"
  | "images"
  | "total";

export interface DroppedDetection {
  name: string;
  score: number;
  box: BoundingBox;
  /** Why it did not survive, in words a person can act on. */
  reason: string;
}

export interface RejectedProduct {
  /** Which detection was being matched. */
  itemId: string;
  title: string;
  reason: string;
}

/** Mağaza katmanı — önce Türkiye, bulunamazsa global. */
export type SearchTier = "tr" | "global";

/**
 * Harcanmış tek bir arama.
 *
 * Merdiven ve katman geçişleri yazıldıktan sonra geriye şu soru kaldı: gevşemenin
 * parası, getirdiği sonuca değiyor mu? Bunu ancak arama başına «hangi katman,
 * hangi basamak, kaç yeni aday» kaydı cevaplayabilir. Kayıt olmadan canlı yolu
 * açmak, kredinin nereye gittiğini görmeden harcamak olurdu.
 *
 * Burada, arayan serviste değil: `ScanDiagnostics` bir istemci bileşeni ve bu tip
 * ona kadar gidiyor. Tipi `contextDevService`'te tanımlamak, `server-only` bir
 * modülü istemci paketine sürüklerdi.
 */
export interface SearchAttemptRecord {
  /**
   * Adayı ne buldu: giysi kırpımı mı, metin sorgusu mu.
   *
   * İki yol yan yana çalışıyor ve hangisinin işi yaptığı ancak bu alanla
   * okunabiliyor — «görsel arama metinden iyi mi» sorusunun cevabı burada
   * birikiyor, tahminde değil.
   */
  source: "metin" | "görsel";
  tier: SearchTier;
  /** Merdiven basamağı: 0 tam sorgu, büyüdükçe gevşiyor. Görsel yolda hep 0. */
  rung: number;
  /** Mağazaya gerçekten gönderilen dize; görsel yolda kırpımın kimliği. */
  query: string;
  /** Bu aramanın eklediği, daha önce görülmemiş aday sayısı. */
  found: number;
  /**
   * Bu çağrının kaç milisaniye sürdüğü.
   *
   * Üretimde ürün aşaması 42.7 saniye sürdü ve `ms.products` tek bir sayı olduğu
   * için sürenin aramada mı çıkarımda mı geçtiği bilinmiyordu. Aşamanın toplamını
   * bilmek «yavaş» demeye yetiyor, «neyi hızlandıracağız» demeye yetmiyor.
   */
  ms: number;
  /**
   * Çağrı hata verdiyse gerekçesi; başarılıysa yok.
   *
   * Sıfır sonuç ile başarısız çağrı aynı şey değil: ilki «o mağazalarda yok»,
   * ikincisi «soramadık» demek, ve ikisi bambaşka işler gerektiriyor. Ayrımı
   * taşımayan bir muhasebe, boşuna harcanmış krediyi başarısız bir aramadan
   * ayırt edemez.
   */
  error?: string;
}

/**
 * Bir parça için harcanmış tek arama.
 *
 * `dropped`/`rejected` gibi ayrıntı bayrağına bağlı **değil**: bir taramada en
 * fazla dört parça × üç arama, yani on iki satır. Bu, taşımanın bedava sayılacağı
 * kadar küçük — ve karşılığında cevapladığı soru büyük: canlı yolun kredisi
 * nereye gidiyor, sorgu gevşemesi kendini ödüyor mu.
 */
export interface SearchAttempt extends SearchAttemptRecord {
  itemId: string;
}

export interface ScanTrace {
  /** Milliseconds per stage. Stages that did not run are absent, not zero. */
  timings: Partial<Record<ScanStage, number>>;
  /** Stages that fell back, and what they fell back to. */
  degraded: Array<{ stage: ScanStage; reason: string }>;
  /** Detections the cleanup removed. Only collected when detail is on. */
  dropped: DroppedDetection[];
  /** Catalogue and live rows that were considered and refused. Detail only. */
  rejected: RejectedProduct[];
  /** Canlı arama merdiveninin harcadığı aramalar. Canlı yol kapalıyken boş. */
  searches: SearchAttempt[];
  /** Counts that are cheap enough to always carry. */
  counts: {
    rawDetections: number;
    keptDetections: number;
    describedItems: number;
  };
}

/**
 * Whether the expensive half is collected.
 *
 * Off by default: the box-by-box detail is worth kilobytes per scan and is only
 * meaningful to someone reading it. A flag rather than `NODE_ENV` because the scans
 * worth debugging are the ones happening in production.
 */
export function scanDetailEnabled(): boolean {
  return process.env.ENABLE_SCAN_DETAIL === "true";
}

export interface TraceCollector {
  /** Times an async stage and records it, even when it throws. */
  stage<T>(name: ScanStage, run: () => Promise<T>): Promise<T>;
  /** Records a stage that fell back to something weaker. */
  degrade(stage: ScanStage, reason: string): void;
  drop(entry: DroppedDetection): void;
  reject(entry: RejectedProduct): void;
  /** Records one spent `web.search` credit. Always collected. */
  search(entry: SearchAttempt): void;
  count(key: keyof ScanTrace["counts"], value: number): void;
  /** The trace so far. Safe to call more than once. */
  snapshot(): ScanTrace;
}

export function createTrace(options: { detail?: boolean } = {}): TraceCollector {
  const detail = options.detail ?? scanDetailEnabled();
  const started = Date.now();

  const trace: ScanTrace = {
    timings: {},
    degraded: [],
    dropped: [],
    rejected: [],
    searches: [],
    counts: { rawDetections: 0, keptDetections: 0, describedItems: 0 },
  };

  return {
    async stage(name, run) {
      const at = Date.now();
      try {
        return await run();
      } finally {
        /*
         * `finally`, so a stage that throws is still timed. A stage that took four
         * seconds and then failed is the single most useful line in the log, and
         * timing only the happy path would drop exactly that one.
         */
        trace.timings[name] = Date.now() - at;
      }
    },
    degrade(stage, reason) {
      trace.degraded.push({ stage, reason });
    },
    drop(entry) {
      if (detail) trace.dropped.push(entry);
    },
    reject(entry) {
      if (detail) trace.rejected.push(entry);
    },
    search(entry) {
      trace.searches.push(entry);
    },
    count(key, value) {
      trace.counts[key] = value;
    },
    snapshot() {
      return {
        ...trace,
        timings: { ...trace.timings, total: Date.now() - started },
        degraded: [...trace.degraded],
        dropped: [...trace.dropped],
        rejected: [...trace.rejected],
        searches: [...trace.searches],
        counts: { ...trace.counts },
      };
    },
  };
}

/**
 * Bir hatanın kısa kimliği: durum kodu ve varsa sağlayıcının kendi kodu.
 *
 * Tam gerekçe `[context.dev]` uyarı satırında ve teşhis panelinde zaten duruyor.
 * Burada gereken şey **greplenebilir bir etiket**, çünkü bu satır bir özet.
 */
function errorTag(text: string): string {
  const status = /\b(4\d{2}|5\d{2})\b/.exec(text)?.[1];
  const code = /"error_code"\s*:\s*"([A-Z_]+)"/.exec(text)?.[1];

  if (status && code) return `${status} ${code}`;
  if (code) return code;
  if (status) return status;
  return text.slice(0, 40);
}

/**
 * Arama kayıtlarını özete indirger.
 *
 * İlk hâli her kaydı olduğu gibi yazıyordu ve üretimde işe yaramaz hâle geldi:
 * kredisi biten bir anahtarla yapılan 12 arama, aynı 120 karakterlik hata
 * metnini 12 kez tekrarladı ve `[scan]` satırı bir duvara döndü. Özet olsun diye
 * yazılmış bir alanın okunamaz olması, hiç olmamasından iyi değil.
 *
 * Aynı (kaynak, katman, basamak, sonuç) dörtlüsü artık tek satırda toplanıyor ve
 * kaç kez olduğu `×N` ile yazılıyor.
 */
function summariseSearches(searches: SearchAttempt[]): string[] {
  const counts = new Map<string, number>();

  for (const entry of searches) {
    const where = entry.source === "görsel" ? "img" : entry.tier;
    const outcome = entry.error ? `HATA ${errorTag(entry.error)}` : String(entry.found);
    const key = `${where}:${entry.rung}=${outcome}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts, ([key, count]) => (count > 1 ? `${key} ×${count}` : key));
}

/**
 * One structured line per scan, for whatever is reading stdout.
 *
 * Deliberately a single line of JSON rather than a paragraph: a log that has to be
 * read by eye is a log nobody greps. The prefix makes it filterable without a
 * parser.
 */
export function logScanTrace(trace: ScanTrace, context: { id: string; source: string }): void {
  const line = {
    id: context.id,
    source: context.source,
    ms: trace.timings,
    degraded: trace.degraded.map((entry) => `${entry.stage}:${entry.reason}`),
    ...trace.counts,
    droppedCount: trace.dropped.length,
    rejectedCount: trace.rejected.length,
    /*
     * Harcanan arama kredisi ve karşılığı.
     *
     * `searchCount` faturayı, `searchYield` neyin ödediğini anlatıyor: her giriş
     * «katman:basamak=yeni aday». `tr:0=2` tam sorgunun Türkiye'de iki aday
     * bulduğu, `tr:0=0,tr:1=3` ise tam sorgunun boş dönüp gevşemenin işi
     * kurtardığı anlamına geliyor — yani merdivenin parasını hak edip etmediği
     * tek satırda, greplenebilir biçimde okunuyor.
     */
    searchCount: trace.searches.length,
    searchYield: summariseSearches(trace.searches),
  };

  // `warn` when something degraded, `log` otherwise: a scan that quietly fell back
  // to the catalogue is the thing worth noticing in a wall of green.
  const emit = trace.degraded.length > 0 ? console.warn : console.log;
  emit(`[scan] ${JSON.stringify(line)}`);
}
