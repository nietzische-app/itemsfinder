"use client";

import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { AlertCircle, UploadCloud } from "lucide-react";

import { fileToDataUrl } from "@/lib/imageSession";
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
            ? "That screenshot is over 8 MB. Try a smaller export."
            : "Screenshots only, please — JPG, PNG or WebP.",
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
          "group relative flex h-[340px] cursor-pointer flex-col items-center justify-center gap-6 overflow-hidden rounded-md border-2 border-dashed border-outline-variant bg-surface-container-lowest p-12 text-center shadow-ambient transition-all hover:border-primary sm:h-[400px]",
          isDragActive && "border-primary bg-surface-container-low",
        )}
      >
        <input {...getInputProps()} aria-label="Upload a screenshot" />

        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Selected screenshot preview"
            className="max-h-full w-auto rounded object-contain"
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
                {isDragActive ? "Drop it right here" : "Drop your inspiration here"}
              </p>
              <p className="text-on-surface-variant">
                Drag and drop an image, or click to browse files
              </p>
            </div>

            <p className="label text-outline-variant">JPG • PNG • WEBP</p>

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
