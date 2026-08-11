import "server-only";

import {
  getAttributeExtractor,
  vlmCreditExhausted,
  type AttributeExtractor,
} from "@/services/attributeExtractor";
import { geminiBlocked, geminiBlockReason, getGeminiExtractor } from "@/services/geminiAttributes";

/**
 * Öznitelik betimlemesini hangi sağlayıcının yapacağı.
 *
 * ## Neden ayrı bir dosya
 *
 * İki sağlayıcı var ve tarama akışının hangisi olduğunu bilmesi gerekmiyor —
 * ihtiyacı olan tek şey `extract`. Seçim mantığı `visualSearch` içine
 * yazılsaydı, orada zaten uzun olan bir fonksiyona yapılandırma dalları
 * eklenirdi; buradaysa tek başına ölçülebiliyor.
 *
 * ## Sıra
 *
 * Anthropic önce: ölçülmüş ve bu projede sürülmüş yol o. Gemini, o anahtar
 * yokken **ya da kredisi bittiğinde** devreye giriyor — ikincisi önemli, çünkü
 * bugün üretimde tam olarak o durum var (`docs/BULUNAMADI.md`: `describedItems:
 * 0`, her taramada 330–1460 ms boşa). Kredisi bitmiş bir anahtarın çalışan bir
 * sağlayıcıyı engellemesi için hiçbir gerekçe yok.
 *
 * Not: kilit süreç-yerel, yani sunucusuz bir dağıtımda ilk soğuk taramada
 * Anthropic yine bir kez denenip başarısız oluyor. Bu kabul edilen bir maliyet —
 * kalıcı çözüm, kredisi bitmiş anahtarı ortamdan kaldırmak.
 */

export type AttributeProviderName = "anthropic" | "gemini";

export interface SelectedAttributeProvider {
  name: AttributeProviderName;
  extractor: AttributeExtractor;
}

/** Bu tarama için sağlayıcı, ya da aşama kapalıysa `null`. */
export function selectAttributeProvider(): SelectedAttributeProvider | null {
  const anthropic = getAttributeExtractor();
  const gemini = getGeminiExtractor();

  // Anthropic kilitli ve elde çalışan bir alternatif varsa, alternatife geç.
  if (anthropic && !(vlmCreditExhausted() && gemini && !geminiBlocked())) {
    return { name: "anthropic", extractor: anthropic };
  }
  if (gemini) return { name: "gemini", extractor: gemini };
  if (anthropic) return { name: "anthropic", extractor: anthropic };

  return null;
}

/**
 * Tarama başına tek satır: hangi sağlayıcı, neden.
 *
 * `[cse]`, `[mağaza]`, `[dizin]`, `[ratelimit]` ile aynı gerekçe — üç ayrı
 * üretim çalıştırmasında `describedItems: 0` görüldü ve sebebini her seferinde
 * tahmin etmek zorunda kaldık. Anahtar asla yazılmıyor; yalnızca **var mı** ve
 * **hangisi seçildi**.
 */
export function attributeProviderStatus(): string {
  const provider = selectAttributeProvider();
  if (!provider) return `kapalı — ${attributeProviderOffReason()}`;

  const model =
    provider.name === "anthropic"
      ? process.env.VLM_MODEL?.trim() || "claude-opus-5"
      : process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";

  const other = provider.name === "anthropic" ? "gemini" : "anthropic";
  const fallback =
    provider.name === "anthropic" && process.env.GEMINI_API_KEY?.trim()
      ? `, ${other} yedekte`
      : "";

  /*
   * Kilit açıksa **neden** açık olduğu yazılıyor. «Kilitli» tek başına, bir
   * dakika bekleyip geçecek bir kota ile hiç geçmeyecek bir anahtar reddini aynı
   * kelimeye indirirdi — ve ikisine bakarken yapılacak iş farklı.
   */
  const lock = !attributeProviderExhausted(provider.name)
    ? ""
    : provider.name === "gemini"
      ? ` — kilitli (${geminiBlockReason() ?? "ret"})`
      : " — kilitli (kredi)";

  return `${provider.name} (${model})${fallback}${lock}`;
}

/**
 * Aşama neden kapalı?
 *
 * Tek kelimelik «kapalı», kurulumu yapan kişiyi iki ayrı ortam değişkenini de
 * kontrol etmeye gönderir. Eksik olan koşul tek tek yazılıyor — ve artık
 * ücretsiz seçenek de adıyla anılıyor, çünkü bu projede ödeme bir kısıt.
 */
export function attributeProviderOffReason(): string {
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());

  if (!hasAnthropic && !hasGemini) {
    return "anahtar yok — GEMINI_API_KEY (ücretsiz kademe) ya da ANTHROPIC_API_KEY gerekli";
  }
  return "ENABLE_VLM_ATTRIBUTES=true değil";
}

/** Seçilen sağlayıcının kotası/kredisi bitmiş mi — gerileme notu için. */
export function attributeProviderExhausted(name: AttributeProviderName): boolean {
  return name === "anthropic" ? vlmCreditExhausted() : geminiBlocked();
}

/**
 * Kotası bitmiş sağlayıcı için ne yapılacağını söyleyen not.
 *
 * «Betimlenemedi» bir gözlem; «şunu yap» bir iş. İki sağlayıcının çözümü farklı:
 * Anthropic'te kredi yüklemek ya da bayrağı kapatmak, Gemini'de günlük ücretsiz
 * kotanın dolması — ikincisi kendiliğinden geçiyor.
 */
export function attributeProviderRemedy(name: AttributeProviderName): string {
  if (name === "anthropic") {
    return (
      " (Anthropic kredisi bitti — GEMINI_API_KEY tanımlayın ya da " +
      "boşa harcamayı durdurmak için ENABLE_VLM_ATTRIBUTES=false)"
    );
  }

  /*
   * Gemini'nin iki susma sebebi var ve **çözümleri zıt**.
   *
   * Üretimde ölçüldü: `403 … Consumer 'api_key:…' has been suspended`. Bu not
   * o sırada «kota doldu, bir süre sonra açılıyor» diyordu — yani askıya alınmış
   * bir anahtar için operatörü beklemeye gönderiyordu. Hiç gelmeyecek bir şeyi
   * beklemek, aşamayı süresiz kapalı bırakırdı ve panelde her şey normal
   * görünürdü.
   */
  return geminiBlockReason() === "kota"
    ? " (Gemini günlük ücretsiz kotası doldu — bir süre sonra kendiliğinden açılıyor)"
    : " (Gemini anahtarı reddedildi: askıya alınmış ya da geçersiz — kendiliğinden " +
        "düzelmez, aistudio.google.com/apikey adresinde yeni bir anahtar oluşturun)";
}
