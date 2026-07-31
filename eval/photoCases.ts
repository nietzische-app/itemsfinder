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
  /** Colour family a person reading the photograph would name. */
  color: ColorBucket;
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
];
