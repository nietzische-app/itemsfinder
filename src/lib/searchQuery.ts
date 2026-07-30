/**
 * Search query construction — colour naming lives here; query assembly for the
 * two-stage Lens pipeline lives in `searchQueryBuilder.ts`.
 *
 * Re-exports keep older call sites compiling while the pipeline migrates.
 */

export { colorNameFromHex } from "./searchQueryColors";
export {
  buildExactMatchQuery,
  buildBudgetAlternativeQuery,
  buildSearchQuery,
  generateAlternativeQuery,
  type ExactQueryInput,
} from "./searchQueryBuilder";
