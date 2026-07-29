"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { ArrowRight, MoveRight } from "lucide-react";

import { DemoLookGrid } from "@/components/DemoLookGrid";
import { ImageUploader } from "@/components/ImageUploader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { saveUploadedImage } from "@/lib/imageSession";
import type { UploadedImage } from "@/types";

export default function HomePage() {
  const router = useRouter();

  const handleImageReady = useCallback(
    (image: UploadedImage) => {
      saveUploadedImage(image);
      router.push("/analyze");
    },
    [router],
  );

  function scrollToDemos() {
    document.getElementById("demo-looks")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="mx-auto max-w-shell px-margin-mobile py-12 md:px-margin-desktop">
      {/* Hero — copy on the left, upload zone on the right */}
      <section className="mb-24 grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-8">
          <div className="space-y-4">
            <Badge variant="coral">Spot the look. Mark as yours.</Badge>

            <h1 className="font-display text-display-lg-mobile leading-tight text-primary md:text-display-lg">
              Find any outfit or makeup look in seconds
            </h1>

            <p className="max-w-xl text-body-lg text-on-surface-variant">
              Upload any outfit or makeup screenshot. Markas finds the exact items and
              budget-friendly alternatives with live buy links.
            </p>
          </div>

          <div className="flex flex-wrap gap-4">
            <Button size="lg" onClick={scrollToDemos}>
              Get started
              <ArrowRight strokeWidth={1.5} />
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="#how-it-works">How it works</a>
            </Button>
          </div>
        </div>

        <div className="min-w-0">
          <ImageUploader onImageReady={handleImageReady} />
        </div>
      </section>

      {/* Curated demo looks */}
      <section id="demo-looks" className="mb-24 scroll-mt-24">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-headline-md text-primary">Try a demo look</h2>
            <p className="text-on-surface-variant">
              Don&apos;t have a photo? Pick one of our curated styles to see the magic.
            </p>
          </div>
          <a
            href="#how-it-works"
            className="label flex items-center gap-1 text-primary hover:underline"
          >
            How matching works
            <MoveRight className="h-4 w-4" strokeWidth={1.5} />
          </a>
        </div>

        <DemoLookGrid onImageReady={handleImageReady} />
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-24 border-t border-outline-variant pt-16">
        <h2 className="font-display text-headline-md text-primary">
          Three taps from screenshot to checkout
        </h2>
        <p className="mt-1 max-w-xl text-on-surface-variant">
          No reverse-image rabbit holes, no &quot;anyone know where this jacket is
          from?&quot; comments.
        </p>

        <ol className="mt-12 grid gap-gutter md:grid-cols-3">
          {[
            {
              step: "01",
              title: "Upload a screenshot",
              body: "Grab any outfit or makeup look and drop it in. JPG, PNG or WebP.",
            },
            {
              step: "02",
              title: "Tap a hotspot",
              body: "We mark every item we spot — jacket, trousers, lipstick — so you can pick one.",
            },
            {
              step: "03",
              title: "Buy it, or its dupe",
              body: "The closest match plus cheaper alternatives from Trendyol, Zara, Sephora, Amazon and Mango.",
            },
          ].map((item) => (
            <li key={item.step} className="min-w-0 border-t border-primary pt-5">
              <span className="label text-secondary-deep">{item.step}</span>
              <h3 className="mt-3 font-display text-[20px] font-semibold text-primary">
                {item.title}
              </h3>
              <p className="mt-2 text-on-surface-variant">{item.body}</p>
            </li>
          ))}
        </ol>

        <p className="label mt-16 border-t border-outline-variant pt-8 text-center text-outline">
          Matches across Zara · Trendyol · Sephora · Amazon · Mango · H&amp;M · ASOS
        </p>
        <p className="mt-3 text-center text-body-md text-outline">
          Markas — product matches are illustrative demo data unless live engines are
          configured. Some outbound links are affiliate links.
        </p>
      </section>
    </div>
  );
}
