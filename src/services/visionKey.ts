import "server-only";

/**
 * Cloud Vision kimlik bilgisi — **tek okuma yeri**.
 *
 * İki yazım da kabul ediliyor: `GOOGLE_CLOUD_VISION_API_KEY` ve takma adı
 * `GOOGLE_VISION_API_KEY`.
 *
 * ## Neden ayrı bir dosya
 *
 * Ölçülmüş bir kusurdan doğdu. Dedektör ikisini de okuyordu; sonradan yazdığım
 * görsel arama yolu yalnızca uzun adı okuyordu. Kullanıcı kısa adı ayarlamıştı,
 * yani üretimde tespit çalışıyor ama görsel yol sessizce kapalı kalıyordu — ve
 * aynı taramanın logunda hem `source: "google-vision"` hem
 * `[lens] kapalı — GOOGLE_CLOUD_VISION_API_KEY yok` yan yana yazıyordu.
 *
 * Aynı kimliği iki yerde ayrı ayrı okumak, ikisinin zamanla ayrışmasına açık bir
 * davetiye. Artık tek kaynak var: bir yazım eklenirse her iki yol da aynı anda
 * öğreniyor.
 */
export function visionApiKey(): string | undefined {
  return (
    process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim() ||
    process.env.GOOGLE_VISION_API_KEY?.trim() ||
    undefined
  );
}
