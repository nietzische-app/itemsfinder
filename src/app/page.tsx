"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { ArrowRight } from "lucide-react";

import { FaqSection } from "@/components/FaqSection";
import { ImageUploader } from "@/components/ImageUploader";
import { LiveScanPreview } from "@/components/LiveScanPreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { saveUploadedImage } from "@/lib/imageSession";
import type { UploadedImage } from "@/types";

const STEPS = [
  {
    step: "01",
    title: "Ekran görüntüsünü yükle",
    body: "Beğendiğin kombin veya makyaj karesini sürükle bırak. JPG, PNG ya da WEBP.",
  },
  {
    step: "02",
    title: "Noktaya dokun",
    body: "Gördüğümüz her parçayı işaretliyoruz — ceket, pantolon, ruj. Birini seç, yeter.",
  },
  {
    step: "03",
    title: "Al ya da muadilini bul",
    body: "Birebir eşleşmenin yanında Trendyol, Zara, Sephora, Amazon ve Mango'dan uygun fiyatlı alternatifler.",
  },
];

export default function HomePage() {
  const router = useRouter();

  const handleImageReady = useCallback(
    (image: UploadedImage) => {
      saveUploadedImage(image);
      router.push("/analyze");
    },
    [router],
  );

  function scrollToUpload() {
    document.getElementById("upload")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="relative">
      {/* Ambient warmth behind the hero — keeps the canvas from reading as
          flat clinical white without introducing a hard colour block. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[820px] overflow-hidden"
      >
        <div className="absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-[#E05638]/10 blur-3xl" />
        <div className="absolute -right-32 top-10 h-[620px] w-[620px] rounded-full bg-[#D8C3A5]/25 blur-3xl" />
        <div className="absolute left-1/3 top-40 h-[420px] w-[420px] rounded-full bg-[#E05638]/[0.06] blur-3xl" />
      </div>

      <div className="mx-auto max-w-shell px-margin-mobile py-12 md:px-margin-desktop">
        {/* Hero — copy on the left, a look being scanned on the right. The demo
            does the explaining; the copy just names it. */}
        <section
          id="canli-tarama"
          className="mb-24 grid scroll-mt-28 grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16"
        >
          <div className="flex min-w-0 flex-col gap-8">
            <div className="space-y-5">
              <Badge variant="coral">Yapay zeka destekli stil araması</Badge>

              <h1 className="font-display text-display-lg-mobile leading-[1.05] text-primary md:text-display-lg">
                Gördüğün stili markala.
              </h1>

              <p className="max-w-xl text-body-lg text-on-surface-variant">
                Instagram veya TikTok&apos;ta beğendiğin kombin ve makyaj görsellerini
                yükle; yapay zeka tam muadillerini ve en uygun fiyatlı seçeneklerini
                anında bulsun.
              </p>
            </div>

            <div className="flex flex-wrap gap-4">
              <Button size="lg" onClick={scrollToUpload}>
                Görselini yükle
                <ArrowRight strokeWidth={1.5} />
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href="#nasil-calisir">Nasıl çalışır?</a>
              </Button>
            </div>

            <p className="label text-outline">
              Zara · Trendyol · Sephora · Amazon · Mango · H&amp;M · ASOS
            </p>
          </div>

          <div className="min-w-0">
            <LiveScanPreview onOpenScan={handleImageReady} />
          </div>
        </section>

        {/* Upload */}
        <section id="upload" className="mb-24 scroll-mt-28">
          <div className="mx-auto max-w-3xl">
            <div className="mb-8 text-center">
              <h2 className="font-display text-headline-md text-primary">
                Şimdi kendi görselinle dene
              </h2>
              <p className="mt-1 text-on-surface-variant">
                Ekran görüntüsünü bırak, saniyeler içinde parçalara ayıralım.
              </p>
            </div>

            <ImageUploader onImageReady={handleImageReady} />
          </div>
        </section>

        {/* How it works */}
        <section
          id="nasil-calisir"
          className="scroll-mt-28 border-t border-outline-variant pt-16"
        >
          <h2 className="font-display text-headline-md text-primary">
            Ekran görüntüsünden sepete üç adım
          </h2>
          <p className="mt-1 max-w-xl text-on-surface-variant">
            Ters görsel arama derdi yok, &laquo;bu ceket nereden?&raquo; yorumları yok.
          </p>

          <ol className="mt-12 grid gap-gutter md:grid-cols-3">
            {STEPS.map((item) => (
              <li key={item.step} className="min-w-0 border-t border-primary pt-5">
                <span className="label text-secondary-deep">{item.step}</span>
                <h3 className="mt-3 font-display text-[20px] font-semibold text-primary">
                  {item.title}
                </h3>
                <p className="mt-2 text-on-surface-variant">{item.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-24">
          <FaqSection />
        </div>
      </div>
    </div>
  );
}
