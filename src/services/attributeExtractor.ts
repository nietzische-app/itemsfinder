import "server-only";

/**
 * Back-compat shim — the VLM engine lives in `vlmService.ts` (Google Gemini Flash only).
 *
 * Existing imports (`getAttributeExtractor`, `GarmentAttributes`, …) keep working
 * so eval scripts and the visual-search pipeline do not need a wholesale rename.
 */
export {
  GeminiVlmService as ClaudeAttributeExtractor,
  GeminiVlmService,
  createAttributeExtractor,
  createVlmService,
  getAttributeExtractor,
  getVlmService,
  isGenericGarment,
  normalizeAttributes,
  GENERIC_GARMENTS,
  type AttributeRequest,
  type GarmentAttributes,
  type VlmServiceOptions,
  type VlmServiceOptions as AttributeExtractorOptions,
} from "@/services/vlmService";
