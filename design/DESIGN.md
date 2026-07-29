---
name: Get The Look
colors:
  surface: '#fcf9f8'
  surface-dim: '#dcd9d9'
  surface-bright: '#fcf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f2'
  surface-container: '#f0eded'
  surface-container-high: '#eae7e7'
  surface-container-highest: '#e5e2e1'
  on-surface: '#1c1b1b'
  on-surface-variant: '#444748'
  inverse-surface: '#313030'
  inverse-on-surface: '#f3f0ef'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  surface-tint: '#5f5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1c1b1b'
  on-primary-container: '#858383'
  inverse-primary: '#c8c6c5'
  secondary: '#ad3217'
  on-secondary: '#ffffff'
  secondary-container: '#ff6d4d'
  on-secondary-container: '#681000'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#1a1c1c'
  on-tertiary-container: '#838484'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c8c6c5'
  on-primary-fixed: '#1c1b1b'
  on-primary-fixed-variant: '#474646'
  secondary-fixed: '#ffdad3'
  secondary-fixed-dim: '#ffb4a4'
  on-secondary-fixed: '#3d0600'
  on-secondary-fixed-variant: '#8b1901'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c7'
  on-tertiary-fixed: '#1a1c1c'
  on-tertiary-fixed-variant: '#454747'
  background: '#fcf9f8'
  on-background: '#1c1b1b'
  surface-variant: '#e5e2e1'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 64px
  max-width: 1440px
---

## Brand & Style
The design system embodies a high-fashion, editorial aesthetic that merges the utilitarian precision of SSENSE with the discovery-driven fluidness of Pinterest. It is built to feel premium yet accessible, focusing on high-quality imagery and a sophisticated, "quiet luxury" interface.

The style is **Modern Minimalism** with a focus on high-contrast accents. It prioritizes generous whitespace, allowing visual content—clothing, textures, and street-style photography—to be the primary interface element. The aesthetic is punctuated by sharp Matte Black and Vibrant Coral Pink accents to guide user intent and highlight interactive "hotspots."

## Colors
This design system utilizes a high-contrast palette to drive hierarchy. The **Primary Background** (#FAFAFA) provides a soft, warm canvas that prevents the clinical feel of pure white, while **Surface Cards** (#FFFFFF) use pure white to pop against the background.

**Matte Black** is used for primary navigation and core CTAs to maintain a high-fashion authority. **Vibrant Coral Pink** is reserved for high-energy interactions: visual search hotspots, primary conversion points, and active states. Text remains strictly charcoal for readability, with muted zinc-grays for metadata and secondary labels.

## Typography
The typography system uses a pairing of **Plus Jakarta Sans** for headlines to provide a modern, geometric character, and **Inter** for body text to ensure maximum legibility at smaller scales.

Headlines should utilize tight letter-spacing to mimic fashion editorial layouts. Labels and utility text (like "NEW ARRIVALS" or "SIZE") should be set in uppercase Inter with increased letter spacing for a sophisticated, systematic feel.

## Layout & Spacing
The layout follows a **Fluid Grid** model with a maximum container width of 1440px. A 12-column system is used for desktop, transitioning to a 2-column or single-column stack on mobile. 

We utilize a 8px baseline grid to maintain rhythm. Negative space is a functional tool here—generous margins (64px) on desktop ensure the interface feels "premium" and uncrowded. Product feeds should use a masonry-style or staggered grid (reminiscent of Pinterest) to keep the visual flow organic.

## Elevation & Depth
Depth is signaled through **Ambient Shadows** and tonal layering. Since the background is off-white (#FAFAFA), the pure white (#FFFFFF) cards naturally "lift" off the page.

To enhance this, cards utilize a soft, extra-diffused shadow (`0 4px 20px rgba(0,0,0,0.05)`). This creates a subtle physical presence without the weight of traditional drop shadows. Interactive elements, when hovered, may increase in shadow spread to signify lift.

## Shapes
The shape language is a mix of high-fashion sharpness and accessible softness. 
- **Standard Cards/Zones:** Use a 16px radius for a modern, friendly feel.
- **Large Content Blocks:** Use a 24px radius (`rounded-xl`).
- **Interactive Pills:** Buttons and search bars use a fully rounded (pill) radius to distinguish them as actionable elements against the rectangular nature of fashion imagery.

## Components

### Buttons
- **Primary:** Matte Black (#111111) background, White text, fully rounded pill shape.
- **Secondary:** Transparent background, Matte Black 1px border, fully rounded pill shape.
- **CTA (Coral):** Used for "Buy Now" or "Find Similar," using #E05638.

### Visual Search Hotspots
Pulsing dots that appear over images. 
- **Style:** 12px circle in #E05638 with a 50% opacity outer ring that pulses from 12px to 24px.
- **Interaction:** On hover, the dot expands slightly, and a "Quick Look" card appears.

### Upload Zones
- **Style:** Use a `1px` dashed or dotted border in #71717A against a #FFFFFF background.
- **Iconography:** Use thin-stroke (1.5pt) linear icons to maintain the sleek aesthetic.

### Cards
- **Product Card:** Pure white background, 16px corner radius, subtle shadow. Typography inside cards should be left-aligned with price points in bold.
- **Image Aspect Ratio:** Use 3:4 (Portrait) for most fashion imagery to mirror industry standards.

### Input Fields
- **Search Bar:** Fully rounded pill with a light gray stroke (#E4E4E7) that darkens to Matte Black on focus. Use Inter 16px for placeholder text.