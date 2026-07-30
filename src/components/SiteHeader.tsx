"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bookmark, Upload } from "lucide-react";

import { MarkasLogo } from "@/components/MarkasLogo";
import { Button } from "@/components/ui/button";
import { useSavedProducts } from "@/lib/savedItems";

/**
 * Deliberately two elements: the logo and the one action that starts a scan.
 *
 * The category segmented control that used to sit here is gone. It wrote
 * `?kategori=` and did filter the old demo grid, but as a permanent fixture in
 * the chrome it implied the whole site was browsable by category, which it is
 * not — Markas has one entry point, and that is uploading an image. Filtering
 * now lives where there is actually something to filter: the results rail on
 * `/analyze`. `?kategori=` still works as a deep link.
 *
 * Nothing here reads the query string, so the header no longer needs a Suspense
 * boundary to stay statically prerenderable.
 *
 * A third control appears **only once something is saved**. An always-visible empty
 * bookmark would add chrome to a two-element header for a list that has nothing in
 * it, and the footer already links there for the empty case; showing it the moment
 * the list stops being empty puts the affordance exactly where it starts to mean
 * something. `useSavedProducts` reads localStorage in an effect, so the server
 * renders the two-element header and the link arrives on the client — no hydration
 * mismatch, and the prerender stays static.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { count } = useSavedProducts();

  function goToUpload() {
    if (pathname === "/") {
      document.getElementById("upload")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    router.push("/#upload");
  }

  return (
    <header className="sticky top-0 z-50 border-b border-outline-variant/40 bg-surface-container-lowest/70 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex h-16 w-full max-w-shell items-center gap-3 px-margin-mobile md:h-[72px] md:px-margin-desktop">
        <Link
          href="/"
          className="min-w-0 shrink-0 text-primary"
          aria-label="Markas — ana sayfa"
        >
          <MarkasLogo size="header" />
        </Link>

        {count > 0 ? (
          <Link
            href="/kayitlilar"
            aria-label={`Kaydedilenler — ${count} ürün`}
            className="ml-auto flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-primary transition-colors hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
          >
            <Bookmark strokeWidth={1.75} className="h-[18px] w-[18px]" />
            <span className="text-[13px] font-semibold tabular-nums">{count}</span>
          </Link>
        ) : null}

        <Button
          size="sm"
          className={`h-9 shrink-0 gap-1.5 px-4 ${count > 0 ? "" : "ml-auto"}`}
          onClick={goToUpload}
        >
          <Upload strokeWidth={1.75} />
          <span className="hidden sm:inline">Görsel Yükle</span>
          <span className="sm:hidden">Yükle</span>
        </Button>
      </div>
    </header>
  );
}
