import "server-only";

import { familyOf, type ItemFamily } from "@/lib/itemFamily";
import { cropRegion } from "@/services/imageCrop";
import { visionApiKey } from "@/services/visionKey";
import type { AttributeRequest } from "@/services/attributeExtractor";

/**
 * Kırpıma bakan **ücretsiz** aşama — Vision, ama bu kez parçanın kendisine.
 *
 * ## Neden var
 *
 * Kaba sınıf («Top», «Jeans») bugün fotoğrafın **tamamına** sorulan tek bir
 * Vision çağrısından geliyor. Kırpımlar zaten hesaplanıyor ve elde duruyor, ama
 * hiç kimseye sorulmuyor. Sonuç, `docs/BULUNAMADI.md`'deki tavan: beyaz bir
 * sneaker için sorgu «Beyaz Footwear» oluyor.
 *
 * Bir VLM bu işi daha iyi yapıyor — ama iki tur boyunca ücretsiz bir VLM
 * anahtarı edinilemedi (Anthropic kredisi bitti, Gemini projesi askıya alındı),
 * ve bu projede ödeme bir kısıt. Vision anahtarı ise **zaten çalışıyor**.
 *
 * ## Neden `AttributeExtractor` değil
 *
 * Şoehorn olurdu. `GarmentAttributes` sözleşmesi rengi zorunlu tutuyor ve
 * «parçanın rengi, dikdörtgenin değil» diyor (`normalizeAttributes`). Vision
 * etiketleri bunu veremez. Ölçülen bölge rengini oraya doldurmak ise en kötüsü
 * olurdu: zayıf bir sinyali güçlü göstermek, yani tam da bu boru hattında
 * kaçınılan şey.
 *
 * Ürettiği şey bir **ifade** — «polo shirt», «denim jacket» — yani web
 * varlıklarıyla aynı cinsten. O yüzden aynı yuvaya, aynı aile kuralıyla
 * giriyor; tek farkı kaynağının fotoğrafın tamamı değil kırpım olması. Sıralama
 * şu: betimleme (VLM) > kırpım etiketi > web varlığı > Vision sınıfı.
 *
 * ## Bedeli
 *
 * Vision'da **her görsel için her özellik bir birim**, ayda 1000 birim ücretsiz.
 * Tarama başına bugün 3 birim harcanıyor; bu aşama kırpım sayısı kadar ekliyor.
 * Bu yüzden varsayılan olarak **kapalı** — kotayı harcayan bir aşama kendini
 * açmamalı, `ENABLE_VLM_ATTRIBUTES` ile aynı kural.
 */

const VISION_BASE_URL = (
  process.env.VISION_BASE_URL?.trim().replace(/\/$/, "") || "https://vision.googleapis.com"
).replace(/\/$/, "");

const VISION_ENDPOINT = `${VISION_BASE_URL}/v1/images:annotate`;

/**
 * Tek istekte gönderilecek kırpım tavanı.
 *
 * Vision bir istekte birden fazla görsel kabul ediyor. Toplu göndermek **birim
 * harcamıyor** — fatura görsel başına — ama gidiş dönüş sayısını kırpıma değil
 * taramaya bağlıyor, yani gecikme kırpım sayısıyla büyümüyor.
 */
const MAX_CROPS = 4;

/** Etiketin ciddiye alınması için gereken en düşük Vision skoru. */
const MIN_SCORE = 0.6;

let visionLabelsBlockedUntil = 0;

export function cropLabelsBlocked(): boolean {
  return Date.now() < visionLabelsBlockedUntil;
}

export interface CropLabelOptions {
  maxCrops?: number;
  requestTimeoutMs?: number;
  baseUrl?: string;
  cooldownMs?: number;
  minScore?: number;
}

const AUTH_COOLDOWN_MS = 60_000;

interface VisionLabel {
  description?: string;
  score?: number;
}

export class CropLabelReader {
  private readonly maxCrops: number;
  private readonly requestTimeoutMs: number;
  private readonly baseUrl: string;
  private readonly cooldownMs: number;
  private readonly minScore: number;

  constructor(
    private readonly apiKey: string,
    options: CropLabelOptions = {},
  ) {
    this.maxCrops = options.maxCrops ?? MAX_CROPS;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 12_000;
    this.baseUrl = (options.baseUrl ?? VISION_ENDPOINT).replace(/\/$/, "");
    this.cooldownMs = options.cooldownMs ?? AUTH_COOLDOWN_MS;
    this.minScore = options.minScore ?? MIN_SCORE;
  }

  /**
   * Her kırpım için, o parçanın ailesine uyan en iyi İngilizce ifade.
   *
   * Anahtar bulunamayan parçalar haritada **hiç yok** — «bulunamadı» ile «boş
   * string» arasındaki farkı çağırana bırakmak, orada bir `?? ""` doğurur ve
   * sorguya boşluk yazar.
   */
  async read(
    imageBuffer: Buffer,
    requests: AttributeRequest[],
    options: { size?: { width: number; height: number }; signal?: AbortSignal } = {},
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    const selected = requests.slice(0, this.maxCrops);
    if (selected.length === 0) return results;

    const remaining = visionLabelsBlockedUntil - Date.now();
    if (remaining > 0) {
      console.warn(
        `[kırpım] ${selected.length} parça atlandı — anahtar reddi, ` +
          `${Math.ceil(remaining / 1000)} sn sonra yeniden denenecek`,
      );
      return results;
    }

    /*
     * Kırpılamayan parça isteğe hiç girmiyor — ve indeksin kayması için tek
     * gereken bu. Vision cevapları `requests` sırasıyla dönüyor, yani gönderilen
     * listeyi ayrıca tutmak zorunlu: `selected[i]` ile eşlemek, bir kırpım
     * düştüğü anda her etiketi bir parça kaydırırdı.
     */
    const sent: Array<{ key: string; family: ItemFamily }> = [];
    const images: Array<{ content: string }> = [];

    for (const request of selected) {
      const crop = await cropRegion(imageBuffer, request.box, { size: options.size });
      if (!crop) continue;
      sent.push({ key: request.key, family: familyOf(request.itemType) });
      images.push({ content: crop.base64 });
    }

    if (sent.length === 0) return results;

    const annotations = await this.annotate(images, options.signal);
    if (!annotations) return results;

    for (const [index, entry] of Array.from(sent.entries())) {
      const phrase = this.bestLabel(annotations[index] ?? [], entry.family);
      if (phrase) results.set(entry.key, phrase);
    }

    return results;
  }

  /**
   * Kırpımın ailesine uyan, en yüksek skorlu etiket.
   *
   * Aile süzgeci burada zorunlu: bir kırpımda ten, arka plan ve komşu parçalar
   * da var, ve Vision onları da etiketliyor («Shoulder», «Wall», «Denim»).
   * Süzgeçsiz bir «en yüksek skor» seçimi, bir ayakkabı kırpımına «Human leg»
   * yazdırırdı.
   *
   * Kural yeni değil: web varlıkları için zaten aynısı uygulanıyor — «bir varlık
   * ancak bağlı olduğu tespitle aynı aileyi adlandırdığında kullanılıyor».
   * Aynı sorunun aynı cevabı.
   */
  private bestLabel(labels: VisionLabel[], family: ItemFamily): string | null {
    if (family === "unknown") return null;

    let best: { description: string; score: number } | null = null;

    for (const label of labels) {
      const description = label.description?.trim();
      const score = label.score ?? 0;
      if (!description || score < this.minScore) continue;
      if (familyOf(description) !== family) continue;
      if (!best || score > best.score) best = { description, score };
    }

    return best?.description ?? null;
  }

  /** Tek gidiş dönüş; hata hâlinde `null`. Asla fırlatmıyor. */
  private async annotate(
    images: Array<{ content: string }>,
    signal?: AbortSignal,
  ): Promise<VisionLabel[][] | null> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}?key=${encodeURIComponent(this.apiKey)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requests: images.map((image) => ({
            image,
            features: [{ type: "LABEL_DETECTION", maxResults: 15 }],
          })),
        }),
        signal: signal ?? AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (error) {
      console.warn(
        "[kırpım] etiketler alınamadı: " +
          (error instanceof Error ? error.message.slice(0, 80) : "istek başarısız"),
      );
      return null;
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 160);
      console.warn(`[kırpım] HTTP ${response.status}: ${detail}`);

      /*
       * Yalnızca anahtar reddi kilitliyor. Kota aşımı (429) da buraya giriyor
       * çünkü Vision'ın aylık ücretsiz birimi dolduğunda geri kalan taramaların
       * her biri boşa gidiş dönüş olurdu — ve o birimler zaten bitmiş olurdu.
       */
      if ([401, 403, 429].includes(response.status)) {
        visionLabelsBlockedUntil = Date.now() + this.cooldownMs;
      }
      return null;
    }

    try {
      const payload = (await response.json()) as {
        responses?: Array<{ labelAnnotations?: VisionLabel[] }>;
      };
      visionLabelsBlockedUntil = 0;
      return (payload.responses ?? []).map((entry) => entry.labelAnnotations ?? []);
    } catch {
      console.warn("[kırpım] cevap okunamadı");
      return null;
    }
  }
}

/**
 * Bu istek için okuyucu, ya da aşama kapalıysa `null`.
 *
 * Hem anahtar hem de açık bayrak gerekiyor. Bayrak şart, çünkü bu aşama Vision'ın
 * aylık ücretsiz biriminden **kırpım başına bir birim** harcıyor: tarama başına
 * 3 birimden ~5-6 birime çıkarıyor, yani ayda ~1000 taramadan ~170-200'e. Kotayı
 * harcayan bir aşama kendini açmamalı — `getAttributeExtractor()` ile aynı kural.
 */
export function getCropLabelReader(): CropLabelReader | null {
  /*
   * Anahtar `visionKey.ts`'ten okunuyor, ortamdan doğrudan değil.
   *
   * O dosya tam olarak bu hatadan doğdu: iki kabul edilen yazımdan yalnızca
   * birini okuyan bir yol, kullanıcı diğerini ayarladığında sessizce kapalı
   * kalıyordu — ve aynı taramanın logunda hem `source: "google-vision"` hem
   * «anahtar yok» yan yana yazıyordu.
   */
  const apiKey = visionApiKey();
  if (!apiKey || process.env.ENABLE_CROP_LABELS !== "true") return null;

  return new CropLabelReader(apiKey);
}

/** Tarama başına tek satır — `[dizin]`, `[vlm]`, `[ratelimit]` ile aynı gerekçe. */
export function cropLabelStatus(): string {
  if (!visionApiKey()) return "kapalı — Vision anahtarı yok";
  if (process.env.ENABLE_CROP_LABELS !== "true") {
    return "kapalı — ENABLE_CROP_LABELS=true değil (Vision kotasından kırpım başına 1 birim)";
  }
  return cropLabelsBlocked() ? "açık — kilitli (anahtar/kota reddi)" : "açık";
}
