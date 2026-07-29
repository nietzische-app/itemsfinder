"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { MousePointerClick, ScanSearch, ShoppingBag, Sparkles, Wallet } from "lucide-react";

import { ImageUploader } from "@/components/ImageUploader";
import { Badge } from "@/components/ui/badge";
import { saveUploadedImage } from "@/lib/imageSession";
import type { UploadedImage } from "@/types";

const STEPS = [
  {
    icon: ScanSearch,
    title: "Upload a screenshot",
    body: "Grab any outfit or makeup look from Instagram, TikTok or Pinterest and drop it in.",
  },
  {
    icon: MousePointerClick,
    title: "Tap what you want",
    body: "We box every item we spot — jacket, jeans, lipstick — so you can pick one and filter the results.",
  },
  {
    icon: Wallet,
    title: "Buy it, or its dupe",
    body: "Get the closest match plus cheaper alternatives from Trendyol, Zara, Sephora, Amazon and Mango.",
  },
];

const RETAILERS = ["Zara", "Trendyol", "Sephora", "Amazon", "Mango", "H&M", "ASOS"];

export default function HomePage() {
  const router = useRouter();

  const handleImageReady = useCallback(
    (image: UploadedImage) => {
      saveUploadedImage(image);
      router.push("/analyze");
    },
    [router],
  );

  return (
    <>
      {/* Hero + upload */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] bg-[radial-gradient(60%_60%_at_50%_50%,hsl(var(--primary)/0.18),transparent_70%)]"
        />

        <div className="container relative grid gap-12 py-14 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:py-20">
          <div className="min-w-0 text-center lg:text-left">
            <Badge variant="secondary" className="mx-auto gap-1.5 px-3 py-1.5 lg:mx-0">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Visual search for fashion &amp; beauty
            </Badge>

            <h1 className="mt-5 text-balance text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Find any outfit or makeup look{" "}
              <span className="text-gradient">in seconds</span>
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-pretty text-lg text-muted-foreground lg:mx-0">
              Screenshot it, drop it here, and we&apos;ll tell you exactly what she&apos;s
              wearing — with the real product and budget-friendly dupes you can buy right
              now.
            </p>

            <dl className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-4 lg:justify-start">
              {[
                { value: "< 3s", label: "Average scan" },
                { value: "7", label: "Retailers matched" },
                { value: "Up to 70%", label: "Saved with dupes" },
              ].map((stat) => (
                <div key={stat.label}>
                  <dt className="text-2xl font-bold">{stat.value}</dt>
                  <dd className="text-xs uppercase tracking-wider text-muted-foreground">
                    {stat.label}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="min-w-0 lg:pl-4">
            <ImageUploader onImageReady={handleImageReady} />
          </div>
        </div>
      </section>

      {/* Retailer strip */}
      <section className="border-y bg-secondary/40 py-6">
        <div className="container">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Matching across
          </p>
          <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {RETAILERS.map((retailer) => (
              <li
                key={retailer}
                className="text-lg font-bold tracking-tight text-muted-foreground/70"
              >
                {retailer}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="container scroll-mt-20 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Three taps from screenshot to checkout
          </h2>
          <p className="mt-3 text-muted-foreground">
            No reverse-image rabbit holes, no &quot;anyone know where this jacket is
            from?&quot; comments.
          </p>
        </div>

        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="relative rounded-[1.5rem] border bg-card p-6 shadow-sm"
            >
              <span className="absolute right-5 top-5 text-4xl font-black text-muted/70">
                {index + 1}
              </span>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-white shadow-md shadow-primary/20">
                <step.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.body}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <ShoppingBag className="h-4 w-4" />
          Works with clothing, accessories and cosmetics.
        </div>
      </section>
    </>
  );
}
