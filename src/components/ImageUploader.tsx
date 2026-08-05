"use client";

import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { AlertCircle, UploadCloud } from "lucide-react";

import { createUploadedImage, fileToDataUrl } from "@/lib/imageSession";
import { cn } from "@/lib/utils";
import type { UploadedImage } from "@/types";

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

/**
 * Upload zone: white surface, dashed outline, thin-stroke iconography.
 * The whole card is the drop target and the click target.
 */
export function ImageUploader({ onImageReady }: ImageUploaderProps) {
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleDrop = useCallback(
    async (accepted: File[], rejections: FileRejection[]) => {
      setError(null);

      if (rejections.length > 0) {
        const reason = rejections[0]?.errors[0]?.code;
        setError(
          reason === "file-too-large"
            ? "Bu görsel 8 MB'ın üzerinde. Daha küçük bir dosya dene."
            : "Yalnızca görsel yükleyebilirsin — JPG, PNG veya WEBP.",
        );
        return;
      }

      const file = accepted[0];
      if (!file) return;

      try {
        const dataUrl = await fileToDataUrl(file);
        setPreview(dataUrl);
        onImageReady(createUploadedImage({ dataUrl, fileName: file.name }));
      } catch {
        setError("Bu dosyayı okuyamadık. Başka bir görsel dene.");
      }
    },
    [onImageReady],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    maxSize: MAX_FILE_BYTES,
  });

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={cn(
          "group relative flex h-[340px] cursor-pointer flex-col items-center justify-center gap-6 overflow-hidden rounded-3xl border border-dashed border-outline-variant/70 bg-surface-container-lowest/80 p-12 text-center shadow-ambient backdrop-blur-sm transition-all duration-300 hover:border-secondary hover:shadow-[0_0_0_4px_rgba(224,86,56,0.08),0_12px_36px_rgba(0,0,0,0.08)] sm:h-[400px]",
          isDragActive &&
            "border-secondary bg-secondary/[0.03] shadow-[0_0_0_6px_rgba(224,86,56,0.12),0_12px_36px_rgba(0,0,0,0.10)]",
        )}
      >
        <input {...getInputProps()} aria-label="Ekran görüntüsü yükle" />

        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Seçilen görselin önizlemesi"
            className="max-h-full w-auto rounded-2xl object-contain"
          />
        ) : (
          <>
            <span
              className={cn(
                "flex h-16 w-16 items-center justify-center rounded-full bg-surface-container transition-colors",
                isDragActive && "bg-secondary/10",
              )}
            >
              <UploadCloud
                className={cn(
                  "h-8 w-8 text-outline transition-colors group-hover:text-primary",
                  isDragActive && "text-secondary",
                )}
                strokeWidth={1.5}
              />
            </span>

            <div>
              <p className="mb-2 font-display text-headline-md text-primary">
                {isDragActive ? "Bırak yeter" : "Ekran görüntüsünü buraya sürükle"}
              </p>
              <p className="text-on-surface-variant">
                Sürükleyip bırak veya dosya seç
              </p>
            </div>

            <p className="label text-outline">JPG • PNG • WEBP · en fazla 8 MB</p>

            {/* Decorative depth, per the design's upload zone. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-10 top-10 h-24 w-24 rounded-full bg-secondary-container/10 blur-2xl"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-10 left-10 h-32 w-32 rounded-full bg-primary/5 blur-2xl"
            />
          </>
        )}
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 flex items-center justify-center gap-2 text-body-md text-error"
        >
          <AlertCircle className="h-4 w-4" strokeWidth={1.5} />
          {error}
        </p>
      ) : null}
    </div>
  );
}
