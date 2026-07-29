"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Plus, Share2, User } from "lucide-react";

import { MarkasLogo } from "@/components/MarkasLogo";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Ana Sayfa" },
  { href: "/analyze", label: "Tarama" },
];

/**
 * Top app bar — sticky and frosted, so editorial imagery scrolls underneath it
 * rather than being cut off by a solid band. On the analysis workspace the nav
 * collapses into session actions the way the design's scanning screen does.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const isWorkspace = pathname === "/analyze";

  return (
    <header className="sticky top-0 z-50 border-b border-outline-variant/40 bg-surface-container-lowest/70 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex h-20 w-full max-w-shell items-center justify-between px-margin-mobile md:px-margin-desktop">
      <div className="flex min-w-0 items-center gap-4">
        <button
          type="button"
          className="hidden text-primary transition-transform active:scale-95 sm:block"
          aria-label="Menüyü aç"
        >
          <Menu className="h-6 w-6" strokeWidth={1.5} />
        </button>

        <Link href="/" className="min-w-0 text-primary" aria-label="Markas — ana sayfa">
          <MarkasLogo />
        </Link>
      </div>

      {isWorkspace ? (
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-outline transition-opacity hover:opacity-70"
          >
            <Plus className="h-5 w-5" strokeWidth={1.5} />
            <span className="label hidden sm:inline">Yeni Arama</span>
          </Link>
          <button
            type="button"
            className="hidden items-center gap-2 text-outline transition-opacity hover:opacity-70 sm:flex"
          >
            <Share2 className="h-5 w-5" strokeWidth={1.5} />
            <span className="label">Paylaş</span>
          </button>
          <Avatar />
        </div>
      ) : (
        <div className="flex items-center gap-8">
          <nav className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "label py-1 transition-opacity hover:opacity-70",
                    isActive
                      ? "border-b-2 border-primary text-primary"
                      : "text-outline",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <Avatar />
        </div>
      )}
      </div>
    </header>
  );
}

/** Neutral placeholder — no real account system in the MVP. */
function Avatar() {
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant bg-surface-container-high text-on-surface-variant">
      <User className="h-5 w-5" strokeWidth={1.5} />
      <span className="sr-only">Hesap</span>
    </span>
  );
}
