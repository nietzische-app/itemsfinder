import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Our design tokens replace Tailwind's default colour and font-size scales, so
 * tailwind-merge has to be told about them. Without this it cannot tell
 * `text-on-primary` (a colour) from `text-body-md` (a size), treats them as
 * conflicting, and silently drops one — which is how white button labels end
 * up black-on-black.
 */
const COLORS = [
  "surface",
  "surface-dim",
  "surface-bright",
  "surface-variant",
  "surface-container",
  "surface-container-lowest",
  "surface-container-low",
  "surface-container-high",
  "surface-container-highest",
  "on-surface",
  "on-surface-variant",
  "inverse-surface",
  "inverse-on-surface",
  "outline",
  "outline-variant",
  "primary",
  "primary-container",
  "on-primary",
  "on-primary-container",
  "inverse-primary",
  "secondary",
  "secondary-container",
  "secondary-deep",
  "on-secondary",
  "on-secondary-container",
  "error",
  "error-container",
  "on-error",
  "on-error-container",
  "success",
];

const FONT_SIZES = [
  "display-lg",
  "display-lg-mobile",
  "headline-md",
  "body-lg",
  "body-md",
  "label-sm",
];

const twMerge = extendTailwindMerge({
  extend: {
    theme: { colors: COLORS },
    classGroups: { "font-size": [{ text: FONT_SIZES }] },
  },
});

/** Conditional classes + Tailwind conflict resolution. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
