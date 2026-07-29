import type { DetectedItem } from "@/types";

/**
 * Shopper-facing categories.
 *
 * The data model has two buckets (`clothing` / `beauty`) because that is what
 * the detector can tell apart. Shoppers think in three, and accessories are the
 * ones they filter for most, so "aksesuar" is derived from the item type rather
 * than being a decorative third tab that filters nothing.
 */
export type UiCategory = "moda" | "guzellik" | "aksesuar";

export const UI_CATEGORIES: Array<{ id: UiCategory; label: string }> = [
  { id: "moda", label: "Moda" },
  { id: "guzellik", label: "Güzellik" },
  { id: "aksesuar", label: "Aksesuar" },
];

/** Item types that are accessories rather than garments. */
const ACCESSORY_TYPES = new Set([
  "kolye",
  "küpe",
  "çanta",
  "fular",
  "kemer",
  "şapka",
  "gözlük",
  "saat",
  "bileklik",
  "yüzük",
]);

export function uiCategoryOf(item: Pick<DetectedItem, "category" | "itemType">): UiCategory {
  if (item.category === "beauty") return "guzellik";
  return ACCESSORY_TYPES.has(item.itemType.toLocaleLowerCase("tr"))
    ? "aksesuar"
    : "moda";
}

/** Parses a `?kategori=` value, ignoring anything unrecognised. */
export function parseUiCategory(value: string | null | undefined): UiCategory | null {
  return UI_CATEGORIES.some((entry) => entry.id === value)
    ? (value as UiCategory)
    : null;
}
