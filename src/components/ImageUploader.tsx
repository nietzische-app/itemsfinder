"use client";

import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { AlertCircle, ImageIcon, Loader2, Sparkles, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EXAMPLE_IMAGES } from "@/lib/examples";
import { exampleToDataUrl, fileToDataUrl } from "@/lib/imageSession";
import { cn } from "@/lib/utils";
import type { ExampleId, UploadedImage } from "@/types";

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB — plenty for a phone screenshot.

const ACCEPTED_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

interface ImageUploaderProps {
  /** Called once an image is ready; the parent decides where to go next. */
  onImageReady: (image: UploadedImage) => void;
}

export function ImageUploader({ onImageReady }: ImageUploaderProps) {
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busyExample, setBusyExample] = useState<ExampleId | null>(null);

  const handleDrop = useCallback(
    async (accepted: File[], rejections: FileRejection[]) => {
      setError(null);

      if (rejections.length > 0) {
        const reason = rejections[0]?.errors[0]?.code;
        setError(
          reason === "file-too-large"
            ? "That screenshot is over 8 MB. Try a smaller export."
            : "Screenshots only, please — .jpg, .png or .webp.",
        );
        return;
      }

      const file = accepted[0];
      if (!file) return;

      try {
        const dataUrl = await fileToDataUrl(file);
        setPreview(dataUrl);
        onImageReady({ dataUrl, fileName: file.name });
      } catch {
        setError("We couldn't read that file. Try another screenshot.");
      }
    },
    [onImageReady],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: handleDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    maxSize: MAX_FILE_BYTES,
    noClick: true,
    noKeyboard: true,
  });

  async function handleExample(id: ExampleId, src: string, label: string) {
    setError(null);
    setBusyExample(id);

    try {
      const dataUrl = await exampleToDataUrl(src);
      setPreview(dataUrl);
      onImageReady({ dataUrl, fileName: `${label}.svg`, exampleId: id });
    } catch {
      setError("We couldn't load that example. Check your connection and retry.");
    } finally {
      setBusyExample(null);
    }
  }

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={cn(
          "group relative overflow-hidden rounded-[1.75rem] border-2 border-dashed border-border bg-card/60 p-8 text-center transition-all sm:p-12",
          isDragActive && "border-primary bg-primary/5 ring-4 ring-primary/10",
        )}
      >
        <input {...getInputProps()} aria-label="Upload a screenshot" />

        {preview ? (
          // Preview of the accepted file — the parent navigates away right
          // after, so this mostly matters on slow transitions.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Selected screenshot preview"
            className="mx-auto max-h-64 w-auto rounded-2xl object-contain shadow-lg"
          />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div
              className={cn(
                "flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-white shadow-lg shadow-primary/25 transition-transform",
                isDragActive ? "scale-110" : "group-hover:scale-105",
              )}
            >
              {isDragActive ? (
                <ImageIcon className="h-7 w-7" />
              ) : (
                <UploadCloud className="h-7 w-7" />
              )}
            </div>

            <div className="space-y-1.5">
              <p className="text-lg font-semibold">
                {isDragActive ? "Drop it right here" : "Drop your screenshot"}
              </p>
              <p className="text-sm text-muted-foreground">
                Drag and drop, or browse — .jpg, .png, .webp up to 8 MB
              </p>
            </div>

            <Button type="button" variant="gradient" size="lg" onClick={open}>
              <Sparkles className="h-4 w-4" />
              Choose a screenshot
            </Button>
          </div>
        )}
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 flex items-center justify-center gap-2 text-sm font-medium text-destructive"
        >
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      ) : null}

      <div className="mt-8">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Or try an example image
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {EXAMPLE_IMAGES.map((example) => (
            <button
              key={example.id}
              type="button"
              disabled={busyExample !== null}
              onClick={() => handleExample(example.id, example.src, example.label)}
              className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md disabled:cursor-wait disabled:opacity-60"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={example.src}
                alt=""
                aria-hidden="true"
                className="h-16 w-14 shrink-0 rounded-xl object-cover"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {example.label}
                  {busyExample === example.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  ) : null}
                </span>
                {/* line-clamp rather than truncate: `truncate` implies
                    white-space: nowrap, which inflates the button's min-content
                    width and stretches the grid track on narrow screens. */}
                <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                  {example.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
