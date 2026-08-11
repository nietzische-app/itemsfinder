import "server-only";

import { cropRegion } from "@/services/imageCrop";
import {
  ATTRIBUTE_SYSTEM_PROMPT,
  describePosition,
  normalizeAttributes,
  withDeadline,
  type AttributeExtractor,
  type AttributeRequest,
  type GarmentAttributes,
} from "@/services/attributeExtractor";

/**
 * Kırpıma bakıp giysiyi betimleyen ikinci sağlayıcı — **Google Gemini**.
 *
 * ## Neden var
 *
 * Öznitelik çıkarımı bu boru hattındaki tek «kırpıma bakan» aşama ve kapalıyken
 * elde yalnızca Vision'ın kaba sınıfı ile kutunun ölçülen rengi kalıyor. Ölçülen
 * sonucu şuydu: üç aday da yalnızca ürün adıyla tam tabana oturdu ve beyaz bir
 * sneaker için «Ayakkabı ve Çanta Koku Topu» birebir eşleşme oldu
 * (`docs/BULUNAMADI.md`). Yani kalite tavanını belirleyen şey bu aşama.
 *
 * Anthropic anahtarının kredisi bitti ve **bu projede ödeme bir kısıt**: bütün
 * tur boyunca kural, satıcıya para vermeden çalışmaktı (Google CSE, context.dev,
 * sitemap kanalı — hepsi aynı gerekçeyle). Gemini'nin ücretsiz kademesi bu
 * aşamayı ödeme yapmadan geri açıyor.
 *
 * ## Neden ayrı bir dosya, neden SDK yok
 *
 * Karar ve çıktı ortak: sistem istemi, `GarmentAttributes` şekli ve
 * `normalizeAttributes` doğrulaması `attributeExtractor.ts`'ten geliyor. Ayrışan
 * tek şey **taşıma** — hangi adrese, hangi gövdeyle. İkinci bir istem yazmak, iki
 * sağlayıcının sessizce farklı şeyler betimlemesi demekti.
 *
 * SDK yok, düz `fetch`: tek uç nokta ve tek gövde şekli için bir bağımlılık
 * eklemek, dağıtım paketine karşılıksız yük bindirirdi.
 *
 * ## Sağlayıcı sırası
 *
 * Anthropic anahtarı varsa o kullanılıyor — ölçülmüş ve bu projede sürülmüş yol
 * o. Gemini, o anahtar yokken ya da kredisi bittiğinde devreye giriyor. Yeni bir
 * yolun ölçülmüş bir yolu kaldırması için gerekçe yok; **eksiği kapatıyor**.
 */

/**
 * Denenecek modeller, sırayla — tek bir sabit isim değil.
 *
 * Üretimde ölçüldü: `gemini-2.0-flash` emekli oldu ve aşama 404 ile durdu.
 *
 *   404 This model models/gemini-2.0-flash is no longer available.
 *
 * Bunun bir dağıtım gerektirmesi yanlış. Model emekliliği öngörülebilir ve
 * tekrarlanabilir bir olay; ona her seferinde kod değişikliğiyle cevap veren bir
 * tasarım, kullanıcıyı satıcının takvimine bağlıyor. Liste sırayla deneniyor ve
 * çalışan model **modül düzeyinde hatırlanıyor**, yani bedel taramada bir kez
 * değil instance ömründe bir kez ödeniyor.
 *
 * Hepsi görme yeteneğine sahip ve ücretsiz kademede sunuluyor. `GEMINI_MODEL`
 * verildiyse liste hiç kullanılmıyor — operatörün açık seçimi denenip
 * geçilecek bir öneri değil.
 */
const MODEL_CANDIDATES = ["gemini-3.5-flash", "gemini-2.5-flash"] as const;

/**
 * Ölçüm listeyi kendi yazmasın diye dışa açık.
 *
 * Kontrolde adları elle yazmak, liste değiştiğinde sessizce **hiçbir şey
 * ölçmeyen** bir kontrol bırakırdı: sahte sunucu var olmayan bir modeli emekli
 * ilan eder, kod başka bir modeli sorar, ikisi de yeşil görünür.
 */
export const MODEL_CANDIDATES_FOR_TEST: readonly string[] = MODEL_CANDIDATES;

/**
 * Çalıştığı görülen model. Instance ömrü boyunca kalıyor.
 *
 * Aday listesi kısa ve emeklilik nadir, ama hatırlamamak her taramanın ilk
 * isteğini ölü bir modele göndermek demekti.
 */
let resolvedModel: string | null = null;

/** Emekli model mi? Kotayla ya da anahtarla ilgisi yok — susmayı gerektirmiyor. */
function isRetiredModel(status: number, body: string): boolean {
  return status === 404 && /no longer available|not found|is not supported/i.test(body);
}

/**
 * Susmanın sebebi. İkisinin **çözümü farklı**, o yüzden ikisi ayrı.
 *
 * `"kota"`  — ücretsiz kademenin günlük sınırı. Kendiliğinden açılıyor; yapılacak
 *             bir şey yok, beklemek yeterli.
 * `"anahtar"` — anahtar reddedildi: askıya alınmış, silinmiş ya da hiç geçerli
 *             değil. **Kendiliğinden düzelmiyor.** Üretimde ölçüldü:
 *             `403 … Consumer 'api_key:…' has been suspended`. Bunu «kota doldu,
 *             bir süre sonra açılır» diye yazmak, operatörü hiç gelmeyecek bir
 *             şeyi beklemeye gönderirdi — aşama sessizce kapalı kalırdı.
 */
export type GeminiBlockKind = "kota" | "anahtar";

/**
 * Reddedilen anahtarın kilidi — `attributeExtractor` ile aynı desen, ayrı sayaç.
 *
 * Ayrı olmasının sebebi: iki sağlayıcının kotası ayrı. Anthropic'in kredisi
 * bittiğinde Gemini'yi de susturmak, çalışan bir aşamayı kapatmak olurdu.
 */
let geminiBlockedUntil = 0;
let geminiBlockKind: GeminiBlockKind | null = null;

/** Kotası/anahtarı düşmüş sağlayıcı dışarıdan okunabilsin — gerileme notu için. */
export function geminiBlocked(): boolean {
  return Date.now() < geminiBlockedUntil;
}

/** Kilit açıksa **neden** açık olduğu; değilse `null`. */
export function geminiBlockReason(): GeminiBlockKind | null {
  return geminiBlocked() ? geminiBlockKind : null;
}

export interface GeminiAttributeOptions {
  model?: string;
  maxItems?: number;
  deadlineMs?: number;
  requestTimeoutMs?: number;
  /** Sahte sunucuya yönlendirmek için — `VISION_BASE_URL` ile aynı gerekçe. */
  baseUrl?: string;
  /** Kilit süresi; ölçüm bir dakika beklemesin diye parametreye alınabiliyor. */
  cooldownMs?: number;
}

const AUTH_COOLDOWN_MS = 60_000;

/**
 * Bu cevap susmayı gerektiriyor mu, gerektiriyorsa hangi sebeple?
 *
 * Gemini kotayı 429, anahtar sorununu 400/401/403 ile söylüyor. Geçici sunucu
 * hatası (5xx) kilitlemiyor: kilit «bu anahtar çalışmıyor» demek, «bu istek
 * tutmadı» demek değil — `contextDevService` ve VLM'de üç kez ödenmiş ders.
 *
 * Şüphede kalan durum bilerek `"anahtar"` tarafına yazılıyor. İki yanlışın
 * bedeli eşit değil: kotayı anahtar sanmak operatöre bir bakış pahasına gelir,
 * anahtarı kota sanmak aşamayı süresiz kapalı bırakır ve kimse fark etmez.
 */
function rejectionKind(status: number, body: string): GeminiBlockKind | null {
  if (status === 429) return "kota";
  if (status === 401 || status === 403) return "anahtar";
  if (status === 400 && /API key not valid|API_KEY_INVALID/i.test(body)) return "anahtar";
  return null;
}

/** Bir gidiş dönüşün sonucu — emeklilik, çağıranın devam etmesi gereken tek dal. */
type SendOutcome =
  | { kind: "ok"; attributes: GarmentAttributes | null }
  | { kind: "emekli" }
  | { kind: "hata" };

export class GeminiAttributeExtractor implements AttributeExtractor {
  /** Operatörün açık seçimi; verilmediyse aday listesi sürülüyor. */
  private readonly pinnedModel: string | null;
  private readonly maxItems: number;
  private readonly deadlineMs: number;
  private readonly requestTimeoutMs: number;
  private readonly baseUrl: string;
  private readonly cooldownMs: number;

  constructor(
    private readonly apiKey: string,
    options: GeminiAttributeOptions = {},
  ) {
    this.pinnedModel = options.model ?? null;
    this.maxItems = options.maxItems ?? 4;
    this.deadlineMs = options.deadlineMs ?? 15_000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
    this.baseUrl = (options.baseUrl ?? "https://generativelanguage.googleapis.com").replace(
      /\/$/,
      "",
    );
    this.cooldownMs = options.cooldownMs ?? AUTH_COOLDOWN_MS;
  }

  /** `ClaudeAttributeExtractor.extract` ile aynı sözleşme. */
  async extract(
    imageBuffer: Buffer,
    requests: AttributeRequest[],
    options: { size?: { width: number; height: number }; signal?: AbortSignal } = {},
  ): Promise<Map<string, GarmentAttributes>> {
    const results = new Map<string, GarmentAttributes>();
    const selected = requests.slice(0, this.maxItems);
    if (selected.length === 0) return results;

    const remaining = geminiBlockedUntil - Date.now();
    if (remaining > 0) {
      console.warn(
        `[gemini] ${selected.length} parça atlandı — ${geminiBlockKind ?? "ret"}, ` +
          `${Math.ceil(remaining / 1000)} sn sonra yeniden denenecek`,
      );
      return results;
    }

    const budget = withDeadline(this.deadlineMs, options.signal);

    try {
      const settled = await Promise.allSettled(
        selected.map(async (request) => {
          const crop = await cropRegion(imageBuffer, request.box, { size: options.size });
          if (!crop) return null;

          const attributes = await this.describe(request, crop, budget.signal);
          return attributes ? ([request.key, attributes] as const) : null;
        }),
      );

      for (const outcome of settled) {
        if (outcome.status === "fulfilled" && outcome.value) {
          results.set(outcome.value[0], outcome.value[1]);
        }
      }
    } finally {
      budget.dispose();
    }

    return results;
  }

  private async describe(
    request: AttributeRequest,
    crop: { base64: string; mediaType: "image/jpeg" },
    signal: AbortSignal,
  ): Promise<GarmentAttributes | null> {
    /*
     * Anahtar başlıkta, sorgu dizesinde değil.
     *
     * Google iki yolu da kabul ediyor ama `?key=…` anahtarı **adresin bir
     * parçası** yapıyor: ağ hatasının mesajı, ara sunucu kaydı ya da bir yığın
     * izi adresi olduğu gibi yazdığında sır loga düşer. `x-goog-api-key` bu
     * sınıfı tümden kaldırıyor — `rateLimitStatus`'ta jetonun yazılmaması ile
     * aynı gerekçe.
     */
    const models = this.pinnedModel
      ? [this.pinnedModel]
      : resolvedModel
        ? [resolvedModel, ...MODEL_CANDIDATES.filter((name) => name !== resolvedModel)]
        : [...MODEL_CANDIDATES];

    /*
     * Alan listesi isteme yazılıyor.
     *
     * Gemini'nin `responseSchema`sı JSON Schema'nın kendisi değil, OpenAPI'nin
     * bir alt kümesi — lehçeyi yanlış yazmak istemi sessizce reddettirir ve bu,
     * «model betimleyemedi» gibi görünür. `responseMimeType` JSON'u garantiliyor,
     * alanların doğruluğunu ise `normalizeAttributes` zaten sınıyor: eksik ya da
     * boş bir betimleme kabul edilmiyor.
     */
    const body = {
      systemInstruction: { parts: [{ text: ATTRIBUTE_SYSTEM_PROMPT }] },
      contents: [
        {
          role: "user",
          parts: [
            { inline_data: { mime_type: crop.mediaType, data: crop.base64 } },
            {
              text:
                `Kaba sınıf: "${request.itemType}".\n` +
                `Bu kırpım, fotoğrafın ${describePosition(request.box)} bölgesinden alındı.\n` +
                "Bu sınıfa uyan parçanın özniteliklerini çıkar.\n\n" +
                "Yalnızca şu alanları taşıyan bir JSON nesnesi döndür: " +
                "visible (boolean), garmentType (string), colorName (string), " +
                "colorHex (string, #rrggbb), material (string), pattern (string), " +
                "details (string dizisi), fit (string), confidence (0..1 sayı).",
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        // Betimleme algı işi, üretim değil: aynı kırpım aynı cevabı vermeli.
        temperature: 0,
        maxOutputTokens: 1024,
      },
    };

    /*
     * Aşama bütçesi ile istek bütçesi iç içe: `withDeadline` ikisini tek bir
     * sinyalde birleştiriyor. `AbortSignal.any` bunu tek satırda yapardı ama
     * `attributeExtractor` orada zaten aynı kararı verdi — çalışması gereken
     * çalışma zamanlarından yeni.
     *
     * Kaynak **gövde okunduktan sonra** bırakılıyor. Yanıt başlıkları gelir
     * gelmez bırakmak, gövdeyi süresiz bırakırdı: `dispose` dış sinyalin
     * iletimini de söküyor, yani aşama bütçesi dolsa bile akış devam ederdi.
     */
    const perRequest = withDeadline(this.requestTimeoutMs, signal);
    try {
      /*
       * Emekli model listede bir sonrakine geçiriyor; başka her sonuç — başarı,
       * kota, anahtar reddi, sunucu hatası — döngüyü bitiriyor. Yalnızca
       * emeklilikte devam etmek önemli: her hatada sıradaki modeli denemek,
       * kotası dolmuş bir anahtarla aynı isteği iki katına çıkarırdı.
       */
      for (const model of models) {
        const outcome = await this.send(model, body, request, perRequest.signal);
        if (outcome.kind !== "emekli") {
          if (outcome.kind === "ok") resolvedModel = model;
          return outcome.kind === "ok" ? outcome.attributes : null;
        }

        console.warn(`[gemini] "${model}" emekli — listedeki bir sonraki model deneniyor`);
      }

      console.warn(
        `[gemini] denenen modellerin hepsi emekli (${models.join(", ")}) — ` +
          "GEMINI_MODEL ile güncel bir model verin",
      );
      return null;
    } finally {
      perRequest.dispose();
    }
  }

  /**
   * Loga yazılacak metinden anahtarı siliyor.
   *
   * Üretimde ölçüldü — ve tam da kapattığımı sandığım sınıftan:
   *
   *   [gemini] "Jeans" — HTTP 403: {"error":{"code":403,"message":
   *   "Permission denied: Consumer 'api_key:AQ.…' has been suspended."}}
   *
   * Anahtarı adresten çıkarıp `x-goog-api-key` başlığına taşımak **giden** yolu
   * kapatmıştı; bu **dönen** yol. Google hata gövdesinde anahtarı geri yazıyor
   * ve gövde olduğu gibi yazdırılıyordu. Sızıntının iki ucu var, ikisi de
   * kapatılmalı.
   *
   * İki tarama: yapılandırılmış anahtarın kendisi (kesin), ve Google'ın
   * biçimindeki her `api_key:…` (anahtar başka bir hesaba ait olsa bile —
   * mesela ara sunucununkine).
   */
  private redact(text: string): string {
    const withoutOwn = this.apiKey ? text.split(this.apiKey).join("«anahtar»") : text;
    return withoutOwn.replace(/api_key:[A-Za-z0-9._-]+/g, "api_key:«anahtar»");
  }

  /**
   * Tek gidiş dönüş: gönder, oku, doğrula. Asla fırlatmıyor.
   *
   * Sonuç `null` değil bir **etiket** dönüyor, çünkü çağıranın ayırması gereken
   * iki başarısızlık var: emekli model (listede devam et) ve başka her şey (dur).
   * `null` ikisini aynı gösterirdi ve döngü ya hiç ilerlemez ya da kotası dolmuş
   * bir anahtarla her modeli tek tek denerdi.
   */
  private async send(
    model: string,
    body: unknown,
    request: AttributeRequest,
    signal: AbortSignal,
  ): Promise<SendOutcome> {
    const url = `${this.baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      console.warn(
        `[gemini] "${request.itemType}" betimlenemedi: ` +
          this.redact(error instanceof Error ? error.message.slice(0, 80) : "istek başarısız"),
      );
      return { kind: "hata" };
    }

    if (!response.ok) {
      const text = (await response.text().catch(() => "")).slice(0, 200);
      console.warn(`[gemini] "${request.itemType}" — HTTP ${response.status}: ${this.redact(text)}`);

      /*
       * Kilit burada kuruluyor, dış döngüde değil: hatalar bu dalda `null`
       * dönüyor ve `allSettled` tarafına hiç ulaşmıyor. Dış döngüye yazılmış bir
       * kilit hiçbir zaman kurulmazdı — `attributeExtractor`'da bir kez ödenmiş
       * ders.
       */
      if (isRetiredModel(response.status, text)) return { kind: "emekli" };

      const kind = rejectionKind(response.status, text);
      if (kind) {
        geminiBlockedUntil = Date.now() + this.cooldownMs;
        geminiBlockKind = kind;
      }
      return { kind: "hata" };
    }

    try {
      const payload = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };

      const text = (payload.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? "")
        .join("")
        .trim();

      if (!text) return { kind: "hata" };

      // Çalıştı — varsa eski kilit kalkıyor.
      geminiBlockedUntil = 0;

      const attributes = normalizeAttributes(JSON.parse(text));

      /*
       * Model **cevap verdi**, yani emekli değil — betimlemesi reddedilmiş olsa
       * bile. `attributes` null olduğunda «hata» demek, çalışan bir modeli emekli
       * sayıp listede ilerletmezdi ama `resolvedModel`i de kurmazdı; sonraki her
       * tarama listeyi baştan sürerdi.
       */
      return { kind: "ok", attributes };
    } catch (error) {
      console.warn(
        `[gemini] "${request.itemType}" cevabı okunamadı: ` +
          this.redact(error instanceof Error ? error.message.slice(0, 80) : "ayrıştırılamadı"),
      );
      return { kind: "hata" };
    }
  }
}

export function geminiAttributesEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function getGeminiExtractor(): GeminiAttributeExtractor | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || process.env.ENABLE_VLM_ATTRIBUTES !== "true") return null;

  return new GeminiAttributeExtractor(apiKey, {
    model: process.env.GEMINI_MODEL?.trim() || undefined,
    baseUrl: process.env.GEMINI_BASE_URL?.trim() || undefined,
  });
}
