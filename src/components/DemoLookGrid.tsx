"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { EXAMPLE_IMAGES } from "@/lib/examples";
import { exampleToDataUrl } from "@/lib/imageSession";
import { cn } from "@/lib/utils";
import type { ExampleId, ExampleImage, UploadedImage } from "@/types";

interface DemoLookGridProps {
  onImageReady: (image: UploadedImage) => void;
  /** Defaults to every look; the page passes a filtered subset. */
  looks?: ExampleImage[];
}

/**
 * "Try Demo Look" — a staggered masonry of curated looks. Each card carries a
 * pulsing coral hotspot as a preview of what the scan produces.
 */
export function DemoLookGrid({ onImageReady, looks = EXAMPLE_IMAGES }: DemoLookGridProps) {
  const [busy, setBusy] = useState<ExampleId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(id: ExampleId, src: string, title: string) {
    setError(null);
    setBusy(id);

    try {
      const dataUrl = await exampleToDataUrl(src);
      onImageReady({ dataUrl, fileName: `${title}.svg`, exampleId: id });
    } catch {
      setError("Bu tarzı yükleyemedik. Bağlantını kontrol edip tekrar dene.");
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="grid gap-gutter sm:grid-cols-2 lg:grid-cols-4">
        {looks.map((example, index) => (
          <button
            key={example.id}
            type="button"
            disabled={busy !== null}
            onClick={() => handlePick(example.id, example.src, example.title)}
            className={cn(
              "group flex min-w-0 flex-col overflow-hidden rounded-2xl bg-surface-container-lowest text-left shadow-ambient transition-all duration-300 hover:-translate-y-2 hover:shadow-ambient-lg disabled:cursor-wait disabled:opacity-70",
              // Stagger the row so the grid reads organic rather than uniform.
              example.tall ? "lg:mt-0" : "lg:mt-10",
            )}
          >
            <span
              className={cn(
                "relative block overflow-hidden",
                example.tall ? "h-[380px]" : "h-[320px]",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={example.src}
                alt=""
                aria-hidden="true"
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
              />

              {/* Pulsing hotspot preview. */}
              <span
                aria-hidden="true"
                className="absolute flex h-4 w-4 items-center justify-center"
                style={{
                  top: `${[42, 30, 38, 34][index % 4]}%`,
                  left: `${[36, 62, 44, 58][index % 4]}%`,
                }}
              >
                <span className="absolute h-full w-full animate-pulse-ring rounded-full bg-secondary" />
                <span className="relative h-2.5 w-2.5 rounded-full bg-secondary shadow-hotspot" />
              </span>

              <span className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-6 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="label rounded-full border border-white/40 px-4 py-2 text-white backdrop-blur-sm">
                  {busy === example.id ? "Yükleniyor…" : "Bu tarzı dene"}
                </span>
              </span>

              {busy === example.id ? (
                <span className="absolute inset-0 flex items-center justify-center bg-surface/70">
                  <Loader2 className="h-6 w-6 animate-spin text-secondary" />
                </span>
              ) : null}
            </span>

            <span className="block min-w-0 p-6">
              <span className="label block text-secondary-deep">{example.category}</span>
              <span className="mt-1 block font-display text-headline-md text-primary">
                {example.title}
              </span>
              {/* line-clamp, not truncate: nowrap would inflate the card's
                  min-content width and stretch the grid track. No `block` —
                  it would override line-clamp's display: -webkit-box. */}
              <span className="mt-1 line-clamp-2 text-body-md text-on-surface-variant">
                {example.description}
              </span>
            </span>
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-center text-body-md text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
