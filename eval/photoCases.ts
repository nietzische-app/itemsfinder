import type { BoundingBox } from "@/types";

import type { ColorBucket } from "./colorBucket";

/**
 * Hand-labelled photographs for the eval set.
 *
 * **Why this file exists separately from `SHOWCASE_LOOKS`.** A case used to need
 * three things: a `SHOWCASE_LOOKS` entry for its boxes, a `MOCK_SCENARIOS` entry
 * for its labels, and an `EXPECTATIONS` entry. The middle one is the demo
 * catalogue — full product cards with prices, merchants, exact matches and
 * alternatives. Adding thirty photographs that way would have meant inventing a
 * hundred fake products, which is the one thing this project refuses to do.
 *
 * So the eval set is decoupled: a case here carries everything it needs and
 * nothing it does not. No products, no prices, no demo scaffolding — a photograph,
 * some boxes, and what a person sees in them.
 *
 * **How these were measured.** Each photograph was rendered under a labelled 0..1
 * grid, the boxes read off it, then drawn back over the photograph and checked by
 * eye. Not eyeballed once and trusted: the render-and-look step is what catches a
 * box that is off by a tenth, and a box that is off by a tenth measures the wrong
 * pixels very precisely.
 *
 * **What is deliberately not labelled.** Garments that are mostly hidden behind
 * another one, items too small to frame honestly, and any attribute the photograph
 * does not settle. `material` and `pattern` are `null` far more often than not —
 * an unfalsifiable expectation is worse than a missing one, because it produces a
 * number that looks like evidence.
 *
 * Photographs are from Unsplash; the credit line travels with the case.
 */

export interface PhotoCaseItem {
  /** Stable id, prefixed per look. */
  id: string;
  /** Turkish descriptive label, as the catalogue would write it. */
  label: string;
  /** Turkish garment noun. */
  itemType: string;
  box: BoundingBox;
  /**
   * Colour family a person reading the photograph would name, or `null` when the
   * garment does not have one.
   *
   * `null` is for prints, not for hard cases. A black-and-rust houndstooth coat, a
   * tropical-leaf dress, a blue-and-pink floral blouse — these have no ground
   * colour a shopper would type, and picking one so the row can be scored would be
   * recording a preference as ground truth. Every one of them still carries a
   * `queryToken`, a `visionClass` and a `pattern`, so the case measures everything
   * the photograph actually settles and nothing it does not.
   *
   * A garment that is *hard* to measure keeps its colour. Dark bordo, dark indigo,
   * a trouser strip under a puffer — those have an answer a person can state, and
   * withdrawing them because the pipeline gets them wrong is how an eval stops
   * being able to tell anyone anything.
   */
  color: ColorBucket | null;
  /** Turkish token the generated query must carry to have a chance of finding it. */
  queryToken: string;
  /** The coarse English class Cloud Vision returns for this kind of item. */
  visionClass: string;
  /** Turkish token reachable from `visionClass` alone — deliberately weaker. */
  visionToken: string;
  /** Only when the photograph settles it. */
  material: string | null;
  /** Only when the photograph settles it; `"düz"` is a claim, not a shrug. */
  pattern: string | null;
}

export interface PhotoCase {
  id: string;
  /** Path under `public/`. */
  image: string;
  credit: string;
  items: PhotoCaseItem[];
}

export const PHOTO_CASES: PhotoCase[] = [
  {
    id: "yellow-colourblock",
    image: "/examples/adele-shafiee-58OynfcotZk-unsplash.jpg",
    credit: "Adele Shafiee / Unsplash",
    items: [
      {
        id: "yc-coat",
        label: "Sarı Renk Bloklu Yün Ceket",
        itemType: "Ceket",
        box: { x: 0.1, y: 0.21, width: 0.82, height: 0.79 },
        color: "sari",
        queryToken: "ceket",
        visionClass: "Outerwear",
        visionToken: "ceket",
        material: null,
        // Colour-blocked, which is not a fabric pattern; naming one either way
        // would be inventing an answer.
        pattern: null,
      },
      {
        id: "yc-scarf",
        label: "Siyah Uzun Şal",
        itemType: "Şal",
        box: { x: 0.22, y: 0.09, width: 0.46, height: 0.85 },
        color: "koyu",
        queryToken: "şal",
        visionClass: "Scarf",
        // The vocabulary turns "Scarf" into "fular", and that is the honest coarse
        // answer: Vision cannot tell a shawl from a neck scarf, so scoring it
        // against "şal" would be scoring it on a distinction it never saw.
        visionToken: "fular",
        material: null,
        pattern: "düz",
      },
    ],
  },
  {
    id: "purple-blazer",
    image: "/examples/adele-shafiee-vagr_XT9Cms-unsplash.jpg",
    credit: "Adele Shafiee / Unsplash",
    items: [
      {
        id: "pb-blazer",
        label: "Mor Oversize Blazer",
        itemType: "Blazer",
        box: { x: 0.19, y: 0.28, width: 0.53, height: 0.42 },
        color: "mor",
        queryToken: "blazer",
        visionClass: "Outerwear",
        visionToken: "ceket",
        material: null,
        pattern: "düz",
      },
      {
        id: "pb-jeans",
        label: "Koyu Yıkamalı Bol Paça Jean",
        itemType: "Jean",
        box: { x: 0.24, y: 0.62, width: 0.5, height: 0.36 },
        color: "koyu",
        queryToken: "jean",
        visionClass: "Jeans",
        visionToken: "jean",
        material: "denim",
        pattern: "düz",
      },
      {
        id: "pb-sneakers",
        label: "Beyaz Bilekli Sneaker",
        itemType: "Sneaker",
        box: { x: 0.3, y: 0.86, width: 0.3, height: 0.14 },
        color: "beyaz",
        queryToken: "sneaker",
        visionClass: "Footwear",
        visionToken: "ayakkabı",
        material: null,
        pattern: null,
      },
    ],
  },
  {
    id: "tan-leather",
    image: "/examples/amir-asghari-xoEb3kS_YoM-unsplash.jpg",
    credit: "Amir Asghari / Unsplash",
    items: [
      {
        id: "tl2-jacket",
        label: "Camel Deri Kısa Ceket",
        itemType: "Ceket",
        box: { x: 0.3, y: 0.28, width: 0.46, height: 0.24 },
        color: "kahve",
        queryToken: "ceket",
        visionClass: "Jacket",
        visionToken: "ceket",
        material: "deri",
        pattern: "düz",
      },
      /*
       * The patterned skirt in this photograph is deliberately *not* labelled.
       * It is rust and teal and black in roughly equal measure, and no single
       * colour family is one a person would agree on — I wrote "koyu", measured
       * grey, and looking at the crop it reads brown. An expectation I cannot
       * defend is not ground truth, and grading against one manufactures evidence.
       */
      {
        id: "tl2-bag",
        label: "Kahverengi Deri Omuz Çantası",
        itemType: "Çanta",
        box: { x: 0.36, y: 0.7, width: 0.24, height: 0.14 },
        color: "kahve",
        queryToken: "çanta",
        visionClass: "Handbag",
        visionToken: "çanta",
        material: "deri",
        pattern: "düz",
      },
    ],
  },
  {
    id: "red-studio-dress",
    image: "/examples/arto-suraj-h4MKq4c4oCM-unsplash.jpg",
    credit: "Arto Suraj / Unsplash",
    items: [
      {
        id: "rd-dress",
        label: "Siyah Askılı Mini Elbise",
        itemType: "Elbise",
        box: { x: 0.32, y: 0.34, width: 0.33, height: 0.38 },
        color: "koyu",
        queryToken: "elbise",
        visionClass: "Dress",
        visionToken: "elbise",
        material: null,
        pattern: "düz",
      },
    ],
  },
  {
    id: "checked-flannel",
    image: "/examples/dana-jm-W9oEn9hbR9s-unsplash.jpg",
    credit: "Dana JM / Unsplash",
    items: [
      {
        id: "cf-shirt",
        label: "Gri Ekose Oduncu Gömlek",
        itemType: "Gömlek",
        box: { x: 0.14, y: 0.28, width: 0.66, height: 0.44 },
        color: "gri",
        queryToken: "gömlek",
        visionClass: "Shirt",
        visionToken: "gömlek",
        material: null,
        // The second genuine pattern in the whole set. Without cases like this the
        // pattern metric only ever measures the absence of hallucination.
        pattern: "ekose",
      },
      {
        id: "cf-tee",
        label: "Beyaz Basic Tişört",
        itemType: "Tişört",
        box: { x: 0.33, y: 0.31, width: 0.19, height: 0.39 },
        color: "beyaz",
        queryToken: "tişört",
        visionClass: "Top",
        visionToken: "bluz",
        material: null,
        pattern: "düz",
      },
      {
        id: "cf-jeans",
        label: "Koyu Yıkamalı Jean",
        itemType: "Jean",
        box: { x: 0.08, y: 0.66, width: 0.52, height: 0.34 },
        color: "mavi",
        queryToken: "jean",
        visionClass: "Jeans",
        visionToken: "jean",
        material: "denim",
        pattern: "düz",
      },
    ],
  },
  {
    id: "pink-sweatshirt",
    image: "/examples/behrouz-sasani-mAJKEgz2j_Q-unsplash.jpg",
    credit: "Behrouz Sasani / Unsplash",
    items: [
      {
        id: "ps-sweat",
        label: "Pembe Yıkamalı Sweatshirt",
        itemType: "Sweatshirt",
        box: { x: 0.14, y: 0.29, width: 0.66, height: 0.61 },
        color: "pembe",
        queryToken: "sweatshirt",
        visionClass: "Top",
        visionToken: "bluz",
        material: null,
        pattern: "düz",
      },
    ],
  },
  {
    id: "black-oversize-tee",
    image: "/examples/behrouz-sasani-6OGml3UomZw-unsplash.jpg",
    credit: "Behrouz Sasani / Unsplash",
    items: [
      {
        id: "bo-tee",
        label: "Siyah Oversize Tişört",
        itemType: "Tişört",
        box: { x: 0.12, y: 0.3, width: 0.55, height: 0.52 },
        color: "koyu",
        queryToken: "tişört",
        visionClass: "Top",
        visionToken: "bluz",
        material: null,
        pattern: "düz",
      },
      {
        id: "bo-jeans",
        label: "Açık Mavi Yıkamalı Jean",
        itemType: "Jean",
        box: { x: 0.22, y: 0.78, width: 0.42, height: 0.22 },
        color: "mavi",
        queryToken: "jean",
        visionClass: "Jeans",
        visionToken: "jean",
        material: "denim",
        pattern: "düz",
      },
      {
        id: "bo-sunglasses",
        label: "Siyah Güneş Gözlüğü",
        itemType: "Güneş gözlüğü",
        box: { x: 0.46, y: 0.17, width: 0.22, height: 0.05 },
        color: "koyu",
        queryToken: "gözlük",
        visionClass: "Sunglasses",
        visionToken: "gözlüğü",
        material: null,
        pattern: null,
      },
    ],
  },
  {
    id: "navy-fur-puffer",
    image: "/examples/edoardo-cuoghi-_NrW6FV5LKc-unsplash.jpg",
    credit: "Edoardo Cuoghi / Unsplash",
    items: [
      {
        id: "nf-coat",
        label: "Lacivert Suni Kürk Mont",
        itemType: "Mont",
        box: { x: 0.11, y: 0.25, width: 0.79, height: 0.48 },
        color: "koyu",
        queryToken: "mont",
        visionClass: "Coat",
        visionToken: "kaban",
        material: null,
        pattern: "düz",
      },
      {
        id: "nf-top",
        label: "Krem Basic Üst",
        itemType: "Bluz",
        // Only the strip between the open zip is actually the top; the box I first
        // drew reached into the fur on both sides and measured it.
        box: { x: 0.355, y: 0.44, width: 0.075, height: 0.22 },
        color: "beyaz",
        queryToken: "bluz",
        visionClass: "Top",
        visionToken: "bluz",
        material: null,
        pattern: "düz",
      },
      {
        id: "nf-jeans",
        label: "Açık Mavi Yüksek Bel Jean",
        itemType: "Jean",
        box: { x: 0.19, y: 0.73, width: 0.5, height: 0.27 },
        color: "mavi",
        queryToken: "jean",
        visionClass: "Jeans",
        visionToken: "jean",
        material: "denim",
        pattern: "düz",
      },
    ],
  },
  {
    id: "cream-blouse",
    image: "/examples/engin-akyurt-jaZoffxg1yc-unsplash.jpg",
    credit: "Engin Akyurt / Unsplash",
    items: [
      {
        id: "cb-blouse",
        label: "Bej Kruvaze Bluz",
        itemType: "Bluz",
        box: { x: 0.11, y: 0.28, width: 0.55, height: 0.32 },
        color: "bej",
        queryToken: "bluz",
        visionClass: "Top",
        visionToken: "bluz",
        material: null,
        pattern: "düz",
      },
      {
        id: "cb-trousers",
        label: "Beyaz Yüksek Bel Pantolon",
        itemType: "Pantolon",
        box: { x: 0.25, y: 0.56, width: 0.58, height: 0.44 },
        color: "beyaz",
        queryToken: "pantolon",
        visionClass: "Trousers",
        visionToken: "pantolon",
        material: null,
        pattern: "düz",
      },
    ],
  },
  {
    id: "linen-shirt",
    image: "/examples/gilda-gonzalez-UJlPhr1uRNQ-unsplash.jpg",
    credit: "Gilda Gonzalez / Unsplash",
    items: [
      {
        id: "ls-shirt",
        label: "Bej Keten Kısa Kollu Gömlek",
        itemType: "Gömlek",
        box: { x: 0.28, y: 0.37, width: 0.42, height: 0.4 },
        color: "bej",
        queryToken: "gömlek",
        visionClass: "Shirt",
        visionToken: "gömlek",
        material: "keten",
        pattern: "düz",
      },
      /*
       * The trousers in this frame are not labelled: they are the bottom fifth of
       * a dim photograph and the box I drew for them was measuring the shirt hem.
       * A box that has to be argued for is not ground truth.
       */
    ],
  },
  {
    id: "field-dress",
    image: "/examples/iurii-melentsov-7iKuB62CQBU-unsplash.jpg",
    credit: "Iurii Melentsov / Unsplash",
    items: [
      {
        id: "fd-dress",
        label: "Krem Düğmeli Midi Elbise",
        itemType: "Elbise",
        // The skirt below the suitcase, not the whole figure: the wider box shared
        // its area with the suitcase and the model's legs, and what survived the
        // exclusions was shadow.
        box: { x: 0.4, y: 0.6, width: 0.2, height: 0.19 },
        color: "beyaz",
        queryToken: "elbise",
        visionClass: "Dress",
        visionToken: "elbise",
        material: null,
        pattern: "düz",
      },
      /*
       * The sun hat is not labelled. Its brim is a few pixels deep at this
       * distance and every box that contains it also contains the shadow under it,
       * which is what the measurement reads. This is the `bb-heels` class of
       * problem and adding a third instance of it teaches nothing new.
       */
      {
        id: "fd-case",
        label: "Siyah Vintage Bavul",
        itemType: "Bavul",
        box: { x: 0.25, y: 0.62, width: 0.16, height: 0.13 },
        color: "koyu",
        queryToken: "bavul",
        visionClass: "Briefcase",
        visionToken: "çanta",
        material: null,
        pattern: "düz",
      },
    ],
  },
  {
    id: "fuchsia-blazer",
    image: "/examples/karen-poniman-eEcav1jjXak-unsplash.jpg",
    credit: "Karen Poniman / Unsplash",
    items: [
      {
        id: "fb-blazer",
        label: "Fuşya Oversize Blazer",
        itemType: "Blazer",
        box: { x: 0.38, y: 0.44, width: 0.28, height: 0.28 },
        color: "pembe",
        queryToken: "blazer",
        visionClass: "Outerwear",
        visionToken: "ceket",
        material: null,
        pattern: "düz",
      },
      {
        id: "fb-jeans",
        label: "Açık Mavi Bol Paça Jean",
        itemType: "Jean",
        box: { x: 0.33, y: 0.7, width: 0.11, height: 0.09 },
        color: "mavi",
        queryToken: "jean",
        visionClass: "Jeans",
        visionToken: "jean",
        material: "denim",
        pattern: "düz",
      },
      /*
       * The white sunglasses are not labelled: at this distance the frame is a few
       * pixels deep and every box that holds it also holds hair. Third instance of
       * the `bb-heels` class; it teaches nothing the first two did not.
       */
    ],
  },
  {
    id: "beige-tailoring",
    image: "/examples/mark-adriane--uJ3N7HLiEg-unsplash.jpg",
    credit: "Mark Adriane / Unsplash",
    items: [
      {
        id: "bt-shirt",
        label: "Açık Mavi Saten Gömlek",
        itemType: "Gömlek",
        box: { x: 0.28, y: 0.05, width: 0.42, height: 0.28 },
        // Pale blue in open shade. My first label said "beyaz", which the label I
        // wrote on the very next line already contradicted.
        color: "gri",
        queryToken: "gömlek",
        visionClass: "Shirt",
        visionToken: "gömlek",
        material: null,
        pattern: "düz",
      },
      {
        id: "bt-trousers",
        label: "Bej Pileli Yüksek Bel Pantolon",
        itemType: "Pantolon",
        box: { x: 0.34, y: 0.33, width: 0.28, height: 0.62 },
        color: "bej",
        queryToken: "pantolon",
        visionClass: "Trousers",
        visionToken: "pantolon",
        material: null,
        pattern: "düz",
      },
    ],
  },
  {
    id: "navy-suit",
    image: "/examples/mohamad-khosravi--eb0moHDPBI-unsplash.jpg",
    credit: "Mohamad Khosravi / Unsplash",
    items: [
      {
        id: "ns-jacket",
        label: "Lacivert Takım Ceketi",
        itemType: "Ceket",
        box: { x: 0.3, y: 0.22, width: 0.38, height: 0.28 },
        // Navy, and navy is "mavi" here by an earlier deliberate decision: a dark
        // saturated blue keeps its hue. I wrote "koyu" out of habit.
        color: "mavi",
        queryToken: "ceket",
        visionClass: "Suit",
        visionToken: "takım",
        material: null,
        pattern: "düz",
      },
      {
        id: "ns-shirt",
        label: "Beyaz Klasik Gömlek",
        itemType: "Gömlek",
        box: { x: 0.4, y: 0.24, width: 0.12, height: 0.22 },
        color: "beyaz",
        queryToken: "gömlek",
        visionClass: "Shirt",
        visionToken: "gömlek",
        material: null,
        pattern: "düz",
      },
      {
        id: "ns-shoes",
        label: "Kahverengi Deri Oxford Ayakkabı",
        itemType: "Ayakkabı",
        box: { x: 0.45, y: 0.825, width: 0.13, height: 0.055 },
        color: "kahve",
        queryToken: "ayakkabı",
        visionClass: "Footwear",
        visionToken: "ayakkabı",
        material: "deri",
        pattern: "düz",
      },
    ],
  },
  {
    id: "violet-street",
    image: "/examples/navid-sohrabi-4w_U-zQtX3M-unsplash.jpg",
    credit: "Navid Sohrabi / Unsplash",
    items: [
      {
        id: "vs-blazer",
        label: "Mor Oversize Blazer",
        itemType: "Blazer",
        box: { x: 0.19, y: 0.2, width: 0.42, height: 0.34 },
        color: "mor",
        queryToken: "blazer",
        visionClass: "Outerwear",
        visionToken: "ceket",
        material: null,
        pattern: "düz",
      },
      {
        id: "vs-top",
        label: "Beyaz Askılı Büstiyer",
        itemType: "Büstiyer",
        box: { x: 0.36, y: 0.3, width: 0.11, height: 0.12 },
        color: "beyaz",
        queryToken: "büstiyer",
        visionClass: "Top",
        visionToken: "bluz",
        material: null,
        pattern: "düz",
      },
      {
        id: "vs-jeans",
        label: "Siyah Yüksek Bel Jean",
        itemType: "Jean",
        box: { x: 0.3, y: 0.44, width: 0.28, height: 0.28 },
        color: "koyu",
        queryToken: "jean",
        visionClass: "Jeans",
        visionToken: "jean",
        material: "denim",
        pattern: "düz",
      },
      {
        id: "vs-sneakers",
        label: "Mor Süet Sneaker",
        itemType: "Sneaker",
        box: { x: 0.37, y: 0.725, width: 0.21, height: 0.055 },
        color: "mor",
        queryToken: "sneaker",
        visionClass: "Footwear",
        visionToken: "ayakkabı",
        material: "süet",
        pattern: null,
      },
    ],
  },
  {
    id: "cream-puffer",
    image: "/examples/reynier-carl-87m1_NfKld4-unsplash.jpg",
    credit: "Reynier Carl / Unsplash",
    items: [
      {
        id: "cp-puffer",
        label: "Krem Oversize Şişme Mont",
        itemType: "Mont",
        box: { x: 0.1, y: 0.3, width: 0.8, height: 0.55 },
        color: "beyaz",
        queryToken: "mont",
        visionClass: "Jacket",
        visionToken: "ceket",
        material: null,
        pattern: "düz",
      },
      /*
       * The strip of trouser below the hem, and the one case in the set the
       * backdrop learner gets wrong on purpose: the jacket box covers the middle
       * of the frame, so everything the learner has left to learn from is grey
       * wall *and* dark floor, and it files the trousers under scenery. Sampling
       * the raw box measures #110b08 — the trousers are exactly where this says
       * they are. Kept because an eval that only carries cases the pipeline
       * survives stops being able to tell anyone anything.
       */
      {
        id: "cp-trousers",
        label: "Koyu Kahve Kadife Pantolon",
        itemType: "Pantolon",
        box: { x: 0.34, y: 0.91, width: 0.24, height: 0.09 },
        color: "koyu",
        queryToken: "pantolon",
        visionClass: "Trousers",
        visionToken: "pantolon",
        material: "kadife",
        pattern: "düz",
      },
    ],
  },
  {
    id: "white-shirt-flare",
    image: "/examples/vladimir-fedotov-NJAFmCuIx1s-unsplash.jpg",
    credit: "Vladimir Fedotov / Unsplash",
    items: [
      {
        id: "wf-shirt",
        label: "Beyaz Saten Gömlek",
        itemType: "Gömlek",
        box: { x: 0.36, y: 0.38, width: 0.26, height: 0.13 },
        color: "beyaz",
        queryToken: "gömlek",
        visionClass: "Top",
        visionToken: "bluz",
        material: null,
        pattern: "düz",
      },
      /*
       * The clearest demonstration in the set of why the foreground filter exists:
       * a dark trouser photographed against a white-on-white interior. The raw box
       * measures #d5d6d9 — the wall wins the modal bucket outright — and the same
       * box behind the filter measures #2d3649. Two answers, opposite families,
       * one box.
       */
      {
        id: "wf-trousers",
        label: "Lacivert İspanyol Paça Pantolon",
        itemType: "Pantolon",
        box: { x: 0.46, y: 0.55, width: 0.22, height: 0.33 },
        color: "koyu",
        queryToken: "pantolon",
        visionClass: "Trousers",
        visionToken: "pantolon",
        material: null,
        pattern: "düz",
      },
    ],
  },
  {
    id: "olive-utility",
    image: "/examples/oleg-ivanov-HvQTy1M8Z5M-unsplash.jpg",
    credit: "Oleg Ivanov / Unsplash",
    items: [
      /*
       * Only the trousers. The ribbed top above them measures #97a8ae, which is a
       * pale blue-grey sitting on the line between "gri" and "beyaz" — naming it
       * either way would be recording a preference as ground truth.
       */
      {
        id: "ou-trousers",
        label: "Haki Kadife Pantolon",
        itemType: "Pantolon",
        box: { x: 0.4, y: 0.69, width: 0.22, height: 0.07 },
        color: "koyu",
        queryToken: "pantolon",
        visionClass: "Trousers",
        visionToken: "pantolon",
        material: "kadife",
        pattern: "düz",
      },
    ],
  },
  {
    id: "burgundy-jacquard",
    image: "/examples/bulbul-ahmed-20XqbpJJn0U-unsplash.jpg",
    credit: "Bulbul Ahmed / Unsplash",
    items: [
      /*
       * Bordo, and the one colour in the set that falls through the crack the
       * dark-saturated escape hatch was cut for. #4b1b2a reports 0.31 saturation,
       * under the 0.55 that lets navy denim keep its hue, so it lands in "koyu".
       * Labelled by the word a shopper types — "bordo ceket" — rather than by the
       * bucket the rule happens to reach, which is the only way this can ever
       * report that the rule is short.
       */
      {
        id: "bj-blazer",
        label: "Bordo Jakarlı Blazer",
        itemType: "Blazer",
        box: { x: 0.28, y: 0.3, width: 0.12, height: 0.16 },
        color: "kirmizi",
        queryToken: "blazer",
        visionClass: "Outerwear",
        visionToken: "ceket",
        material: null,
        pattern: null,
      },
      {
        id: "bj-shirt",
        label: "Siyah Klasik Gömlek",
        itemType: "Gömlek",
        box: { x: 0.5, y: 0.3, width: 0.09, height: 0.14 },
        color: "koyu",
        queryToken: "gömlek",
        visionClass: "Top",
        visionToken: "bluz",
        material: null,
        pattern: "düz",
      },
      {
        id: "bj-trousers",
        label: "Siyah Klasik Pantolon",
        itemType: "Pantolon",
        box: { x: 0.26, y: 0.58, width: 0.09, height: 0.1 },
        color: "koyu",
        queryToken: "pantolon",
        visionClass: "Trousers",
        visionToken: "pantolon",
        material: null,
        pattern: "düz",
      },
    ],
  },
  {
    id: "orange-flares",
    image: "/examples/edward-howell-EAWKyzfXw44-unsplash.jpg",
    credit: "Edward Howell / Unsplash",
    items: [
      /*
       * Orange, which the family taxonomy files under "sari" — and that is not the
       * classifier flattering itself. `COLOR_NAMES` carries "Turuncu" at
       * rgb(235,130,40), and putting that swatch through the same rule also gives
       * "sari", so a listing titled "Turuncu Pantolon" and this measurement land in
       * the same bucket and never contradict each other. The generated query still
       * says "Turuncu" — the coarse family is only ever asked whether two colours
       * could be the same garment.
       *
       * The blouse above is a green-and-cream ditsy floral with no ground colour a
       * person could name, so it is not labelled.
       */
      {
        id: "of-trousers",
        label: "Turuncu İspanyol Paça Pantolon",
        itemType: "Pantolon",
        box: { x: 0.34, y: 0.48, width: 0.16, height: 0.35 },
        color: "sari",
        queryToken: "pantolon",
        visionClass: "Trousers",
        visionToken: "pantolon",
        material: null,
        pattern: "düz",
      },
    ],
  },
  {
    id: "rust-workwear",
    image: "/examples/emmanuel-akinte-XlcnwnD_1uw-unsplash.jpg",
    credit: "Emmanuel Akinte / Unsplash",
    items: [
      {
        id: "rw-jacket",
        label: "Kiremit Rengi İşçi Ceketi",
        itemType: "Ceket",
        box: { x: 0.385, y: 0.33, width: 0.085, height: 0.14 },
        color: "kirmizi",
        queryToken: "ceket",
        visionClass: "Jacket",
        visionToken: "ceket",
        material: null,
        pattern: "düz",
      },
      {
        id: "rw-trousers",
        label: "Kiremit Rengi Pantolon",
        itemType: "Pantolon",
        box: { x: 0.5, y: 0.6, width: 0.08, height: 0.19 },
        color: "kirmizi",
        queryToken: "pantolon",
        visionClass: "Trousers",
        visionToken: "pantolon",
        material: null,
        pattern: "düz",
      },
      {
        id: "rw-sneakers",
        label: "Beyaz Deri Sneaker",
        itemType: "Sneaker",
        box: { x: 0.51, y: 0.84, width: 0.09, height: 0.05 },
        color: "beyaz",
        queryToken: "sneaker",
        visionClass: "Footwear",
        visionToken: "ayakkabı",
        material: null,
        pattern: null,
      },
    ],
  },
  {
    id: "houndstooth-coat",
    image: "/examples/ethan-rougon-9wz3oPSZb8s-unsplash.jpg",
    credit: "Ethan Rougon / Unsplash",
    items: [
      /*
       * The first case in the set with no colour to grade. A black-rust-cream
       * houndstooth averages to #99948d, a warm grey that names neither of the two
       * yarns it is woven from, and no shopper types "gri kazayağı". The pattern is
       * the whole point of the garment and it is unambiguous, so that is what this
       * row asserts.
       *
       * Recorded as "ekose" rather than the narrower "kazayağı" because ekose is
       * the only check word `retailVocabulary` can reach — plaid, checked and
       * tartan all map to it. Expecting a term the vocabulary cannot produce would
       * score a correct answer as a hallucination.
       */
      {
        id: "hc-coat",
        label: "Ekose Desenli Uzun Ceket",
        itemType: "Ceket",
        box: { x: 0.44, y: 0.3, width: 0.14, height: 0.12 },
        color: null,
        queryToken: "ceket",
        visionClass: "Coat",
        visionToken: "kaban",
        material: null,
        pattern: "ekose",
      },
      {
        id: "hc-turtleneck",
        label: "Krem Balıkçı Yaka Kazak",
        itemType: "Kazak",
        box: { x: 0.33, y: 0.45, width: 0.16, height: 0.14 },
        color: "beyaz",
        queryToken: "kazak",
        visionClass: "Top",
        visionToken: "bluz",
        material: "triko",
        pattern: "düz",
      },
      /*
       * Dark indigo, and a second look at the escape hatch that keeps navy denim
       * out of "koyu". #112a36 reports 0.52 saturation against the 0.55 the rule
       * asks for — the swatch the hatch was cut for (#011b2a) reports 0.94, so the
       * gap is wide and this sits in it. A person looking at this photograph sees
       * blue jeans, which is what is recorded.
       */
      {
        id: "hc-jeans",
        label: "Koyu Mavi Yüksek Bel Jean",
        itemType: "Jean",
        box: { x: 0.36, y: 0.66, width: 0.16, height: 0.12 },
        color: "mavi",
        queryToken: "jean",
        visionClass: "Jeans",
        visionToken: "jean",
        material: "denim",
        pattern: "düz",
      },
    ],
  },
  {
    id: "mustard-bandeau",
    image: "/examples/ethan-smith-XTfkVNU5DX4-unsplash.jpg",
    credit: "Ethan Smith / Unsplash",
    items: [
      {
        id: "mb-jacket",
        label: "Siyah Denim Ceket",
        itemType: "Ceket",
        box: { x: 0.31, y: 0.6, width: 0.07, height: 0.12 },
        color: "koyu",
        queryToken: "ceket",
        visionClass: "Jacket",
        visionToken: "ceket",
        material: "denim",
        pattern: "düz",
      },
      {
        id: "mb-top",
        label: "Hardal Straplez Büstiyer",
        itemType: "Büstiyer",
        box: { x: 0.4, y: 0.65, width: 0.18, height: 0.08 },
        color: "sari",
        queryToken: "büstiyer",
        visionClass: "Top",
        visionToken: "bluz",
        material: null,
        pattern: "düz",
      },
      {
        id: "mb-skirt",
        label: "Siyah Uzun Etek",
        itemType: "Etek",
        box: { x: 0.36, y: 0.82, width: 0.24, height: 0.12 },
        color: "koyu",
        queryToken: "etek",
        visionClass: "Skirt",
        visionToken: "etek",
        material: null,
        pattern: "düz",
      },
      /*
       * The straw fedora above is not labelled: hat straw measures #946f53, which
       * the Kovač rules classify as skin, so the foreground filter removes the
       * garment and the row would be measuring the filter rather than the hat.
       */
    ],
  },
  {
    id: "navy-suit-tie",
    image: "/examples/gregory-hayes-h5cd51KXmRQ-unsplash.jpg",
    credit: "Gregory Hayes / Unsplash",
    items: [
      /*
       * "Lacivert Takım Ceketi" appears twice in this file with two different
       * colours, and that is on purpose. `ns-jacket` is photographed in daylight
       * and is unmistakably blue cloth; this one is lit so low it measures #08060a
       * — four units of channel spread, which is black. The label records what the
       * *photograph* shows, not what the garment is called in a catalogue, because
       * what the photograph shows is the only thing the pipeline is ever given.
       * Both crops were put side by side and looked at before either was written.
       */
      {
        id: "nt-suit",
        label: "Lacivert Takım Ceketi",
        itemType: "Ceket",
        box: { x: 0.24, y: 0.5, width: 0.12, height: 0.2 },
        color: "koyu",
        queryToken: "ceket",
        visionClass: "Outerwear",
        visionToken: "ceket",
        material: null,
        pattern: "düz",
      },
      {
        id: "nt-shirt",
        label: "Açık Mavi Klasik Gömlek",
        itemType: "Gömlek",
        box: { x: 0.425, y: 0.37, width: 0.06, height: 0.045 },
        color: "mavi",
        queryToken: "gömlek",
        visionClass: "Top",
        visionToken: "bluz",
        material: null,
        pattern: "düz",
      },
      /*
       * A navy ground under pale blue flowers — unlike the houndstooth, the ground
       * colour here is nameable, so this row asserts both. It is the only item in
       * the set carrying a pattern that is neither "düz" nor the leopard scarf, and
       * "çiçekli" is a term `retailVocabulary` reaches from "floral".
       */
      {
        id: "nt-tie",
        label: "Mavi Çiçek Desenli Kravat",
        itemType: "Kravat",
        box: { x: 0.49, y: 0.48, width: 0.05, height: 0.15 },
        color: "mavi",
        queryToken: "kravat",
        visionClass: "Tie",
        visionToken: "kravat",
        material: null,
        pattern: "çiçekli",
      },
    ],
  },
  {
    id: "white-tee-culottes",
    image: "/examples/jonas-horsch-ni2uHFtetzE-unsplash.jpg",
    credit: "Jonas Horsch / Unsplash",
    items: [
      /*
       * A white tee whose box is over half arm and shoulder: the raw box measures
       * #b9988c, a skin tone, and behind the filter it measures #e4eef6. The second
       * demonstration in the set of the skin rule paying for itself.
       */
      {
        id: "wt-tee",
        label: "Beyaz Kolsuz Tişört",
        itemType: "Tişört",
        box: { x: 0.3, y: 0.24, width: 0.16, height: 0.14 },
        color: "beyaz",
        queryToken: "tişört",
        visionClass: "Top",
        visionToken: "bluz",
        material: null,
        pattern: "düz",
      },
      /*
       * Tailored navy, recorded as "koyu" rather than "mavi" — the mirror of
       * `hc-jeans`. At #040c12 the lightness is 4%, and a hue read off a spread of
       * fourteen units at that lightness is arithmetic, not a colour anyone can
       * see; the garment reads black in the photograph. Denim keeps "mavi" because
       * denim reads blue. The rule is what a person sees, not what the hue says.
       */
      {
        id: "wt-skirt",
        label: "Lacivert Uzun Etek",
        itemType: "Etek",
        box: { x: 0.3, y: 0.52, width: 0.2, height: 0.15 },
        color: "koyu",
        queryToken: "etek",
        visionClass: "Skirt",
        visionToken: "etek",
        material: null,
        pattern: "düz",
      },
    ],
  },
  {
    id: "ringer-tee",
    image: "/examples/joshua-rawson-harris-7mfSzu6_qvA-unsplash.jpg",
    credit: "Joshua Rawson-Harris / Unsplash",
    items: [
      /*
       * White cloth in open shade, and the tightest near-miss in the set: #c6d2da
       * is lightness 0.816 against the 0.82 the near-white gate asks for, and
       * saturation 0.21 against the 0.20 the neutral gate allows. Four thousandths
       * short in one direction and one hundredth over in the other, so a white
       * tee-shirt comes out blue.
       *
       * The denim shorts below are not labelled — washed indigo in shadow measures
       * #899aa4, and whether that is "açık mavi" or "gri" is a preference.
       */
      {
        id: "rt-tee",
        label: "Beyaz Bisiklet Yaka Tişört",
        itemType: "Tişört",
        box: { x: 0.4, y: 0.47, width: 0.1, height: 0.1 },
        color: "beyaz",
        queryToken: "tişört",
        visionClass: "Top",
        visionToken: "bluz",
        material: null,
        pattern: null,
      },
    ],
  },
  {
    id: "red-graphic-sweat",
    image: "/examples/katsiaryna-endruszkiewicz-BteCp6aq4GI-unsplash.jpg",
    credit: "Katsiaryna Endruszkiewicz / Unsplash",
    items: [
      {
        id: "rg-sweat",
        label: "Kırmızı Baskılı Sweatshirt",
        itemType: "Sweatshirt",
        box: { x: 0.24, y: 0.5, width: 0.14, height: 0.1 },
        color: "kirmizi",
        queryToken: "sweatshirt",
        visionClass: "Top",
        visionToken: "bluz",
        material: null,
        pattern: null,
      },
      {
        id: "rg-jacket",
        label: "Siyah Oversize Ceket",
        itemType: "Ceket",
        box: { x: 0.64, y: 0.55, width: 0.14, height: 0.2 },
        color: "koyu",
        queryToken: "ceket",
        visionClass: "Jacket",
        visionToken: "ceket",
        material: null,
        pattern: "düz",
      },
    ],
  },
];
