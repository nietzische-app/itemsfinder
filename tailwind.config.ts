import type { Config } from "tailwindcss";

/**
 * Design tokens for Markas — the editorial "quiet luxury" system from
 * `design/DESIGN.md`, anchored on the three brand colours:
 *
 *   #111111  Matte Black   — navigation, core CTAs, the logo mark
 *   #FAFAFA  Off-white     — the page canvas
 *   #E05638  Coral         — scan hotspots, active states, conversion
 *
 * Token names mirror the design doc (surface / on-surface / outline /
 * secondary …) so design and code stay one vocabulary.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#fafafa",
          dim: "#dcdcdc",
          bright: "#fafafa",
          variant: "#e4e4e4",
        },
        // Neutral ramp, tuned to the #FAFAFA canvas: pure white cards lift off
        // it, and each step is a perceptible but quiet increment.
        "surface-container": {
          lowest: "#ffffff",
          low: "#f5f5f5",
          DEFAULT: "#efefef",
          high: "#e9e9e9",
          highest: "#e4e4e4",
        },
        "on-surface": {
          DEFAULT: "#1b1b1b",
          variant: "#454545",
        },
        "inverse-surface": "#2e2e2e",
        "inverse-on-surface": "#f1f1f1",

        outline: {
          DEFAULT: "#757575",
          variant: "#c6c6c6",
        },

        // Matte black — primary navigation, core CTAs, the logo mark.
        primary: {
          DEFAULT: "#111111",
          container: "#1b1b1b",
        },
        "on-primary": {
          DEFAULT: "#ffffff",
          container: "#858383",
        },
        "inverse-primary": "#c8c6c5",

        // Signature coral — hotspots, active states, conversion.
        secondary: {
          DEFAULT: "#e05638",
          container: "#ff8a6d",
          /**
           * Darkened coral for small text on light surfaces. Brand coral on
           * #FAFAFA is 3.8:1, which reads poorly at the 10–12px label sizes
           * this system uses; this shade is 5.1:1 and visually near-identical.
           */
          deep: "#c0451f",
        },
        "on-secondary": {
          DEFAULT: "#ffffff",
          container: "#681000",
        },

        error: {
          DEFAULT: "#ba1a1a",
          container: "#ffdad6",
        },
        "on-error": {
          DEFAULT: "#ffffff",
          container: "#93000a",
        },

        success: "#1a7f45",
      },
      fontFamily: {
        display: ["var(--font-display)", "Plus Jakarta Sans", "sans-serif"],
        sans: ["var(--font-body)", "Inter", "sans-serif"],
      },
      fontSize: {
        "display-lg": [
          "48px",
          { lineHeight: "56px", letterSpacing: "-0.02em", fontWeight: "700" },
        ],
        "display-lg-mobile": [
          "32px",
          { lineHeight: "40px", letterSpacing: "-0.02em", fontWeight: "700" },
        ],
        "headline-md": [
          "24px",
          { lineHeight: "32px", letterSpacing: "-0.01em", fontWeight: "600" },
        ],
        "body-lg": ["18px", { lineHeight: "28px", fontWeight: "400" }],
        "body-md": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "label-sm": [
          "12px",
          { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "600" },
        ],
      },
      spacing: {
        base: "8px",
        gutter: "24px",
        "margin-mobile": "16px",
        "margin-desktop": "64px",
      },
      maxWidth: {
        shell: "1440px",
      },
      borderRadius: {
        sm: "0.25rem",
        DEFAULT: "0.5rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.5rem",
      },
      boxShadow: {
        // Ambient, extra-diffused: white cards lift off the off-white canvas
        // without the weight of a traditional drop shadow.
        ambient: "0 4px 20px rgba(0,0,0,0.05)",
        "ambient-lg": "0 12px 36px rgba(0,0,0,0.10)",
        hotspot: "0 2px 12px rgba(0,0,0,0.35)",
      },
      keyframes: {
        "pulse-ring": {
          "0%": { transform: "scale(1)", opacity: "0.7" },
          "50%": { transform: "scale(2.2)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "0" },
        },
        "scan-move": {
          "0%": { top: "0%" },
          "50%": { top: "100%" },
          "100%": { top: "0%" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.6)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 2s cubic-bezier(0.455,0.03,0.515,0.955) infinite",
        "scan-move": "scan-move 3s ease-in-out infinite",
        "fade-up": "fade-up 0.45s ease-out both",
        "pop-in": "pop-in 0.35s cubic-bezier(0.34,1.56,0.64,1) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
