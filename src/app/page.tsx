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

  function scrollToDemos() {
    document.getElementById("demo-looks")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="relative">
      {/* Ambient warmth behind the hero — keeps the canvas from reading as
          flat clinical white without introducing a hard colour block. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px] overflow-hidden"
      >
        <div className="absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-[#E05638]/[0.07] blur-3xl" />
        <div className="absolute -right-32 top-10 h-[620px] w-[620px] rounded-full bg-[#D8C3A5]/25 blur-3xl" />
        <div className="absolute left-1/3 top-40 h-[420px] w-[420px] rounded-full bg-[#E05638]/[0.04] blur-3xl" />
      </div>

      <div className="mx-auto max-w-shell px-margin-mobile py-12 md:px-margin-desktop">
        {/* Hero */}
        <section className="mb-24 grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
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
              <Button size="lg" onClick={scrollToDemos}>
                Hemen başla
                <ArrowRight strokeWidth={1.5} />
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href="#how-it-works">Nasıl çalışır?</a>
              </Button>
            </div>
          </div>

          <div className="min-w-0">
            <ImageUploader onImageReady={handleImageReady} />
          </div>
        </section>

        {/* Demo looks */}
        <section id="demo-looks" className="mb-24 scroll-mt-28">
          <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-display text-headline-md text-primary">
                Veya örnek bir tarzı hemen dene
              </h2>
              <p className="text-on-surface-variant">
                Elinde görsel yok mu? Hazır tarzlardan birini seç, nasıl çalıştığını gör.
              </p>
            </div>
            <a
              href="#how-it-works"
              className="label flex items-center gap-1 text-primary hover:underline"
            >
              Eşleştirme nasıl çalışır
              <MoveRight className="h-4 w-4" strokeWidth={1.5} />
            </a>
          </div>

          <DemoLookGrid onImageReady={handleImageReady} />
        </section>

        {/* How it works */}
        <section
          id="how-it-works"
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

          <p className="label mt-16 border-t border-outline-variant pt-8 text-center text-outline">
            Zara · Trendyol · Sephora · Amazon · Mango · H&amp;M · ASOS
          </p>
          <p className="mt-3 text-center text-body-md text-outline">
            Markas — canlı motorlar yapılandırılmadığı sürece ürün eşleşmeleri örnek
            veridir. Bazı bağlantılar iş ortaklığı bağlantısıdır.
          </p>
        </section>
      </div>
    </div>
  );
}
