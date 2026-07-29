"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Bookmark, Link2, Menu, Plus, Share2, Upload, X } from "lucide-react";

import { MarkasLogo, MarkasMark } from "@/components/MarkasLogo";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { UI_CATEGORIES, parseUiCategory } from "@/lib/categories";
import { useSavedProducts } from "@/lib/savedItems";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Ana Sayfa" },
  { href: "/analyze", label: "Tarama" },
];

/**
 * Compact workspace header: logo lockup, category switcher, and a primary
 * "Görsel Yükle" action — the Canva pattern of keeping the one action that
 * starts a project permanently reachable.
 *
 * The category switcher writes to `?kategori=`, so it is shareable, survives a
 * refresh, and is read by both the home grid and the analysis rail rather than
 * being a tab that filters nothing.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { count } = useSavedProducts();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const activeCategory = parseUiCategory(searchParams.get("kategori"));

  function setCategory(next: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("kategori", next);
    else params.delete("kategori");

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  async function handleShare() {
    const url = typeof window === "undefined" ? "" : window.location.href;

    // The Web Share sheet is the right affordance on mobile; clipboard is the
    // dependable fallback everywhere else.
    try {
      if (navigator.share) {
        await navigator.share({ title: "Markas", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast("Bağlantı kopyalandı");
    } catch {
      // A cancelled share sheet lands here too — say nothing rather than
      // reporting an error the user caused on purpose.
    }
  }

  function goToUpload() {
    setDrawerOpen(false);
    if (pathname === "/") {
      document.getElementById("upload")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    router.push("/#upload");
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-outline-variant/40 bg-surface-container-lowest/70 backdrop-blur-md backdrop-saturate-150">
        <div className="mx-auto flex h-16 w-full max-w-shell items-center gap-3 px-margin-mobile md:h-[72px] md:gap-6 md:px-margin-desktop">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="-ml-1 shrink-0 rounded-full p-2 text-primary transition-colors hover:bg-surface-container active:scale-95"
            aria-label="Menüyü aç"
            aria-expanded={drawerOpen}
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          </button>

          <Link
            href="/"
            className="min-w-0 shrink-0 text-primary"
            aria-label="Markas — ana sayfa"
          >
            <MarkasLogo size="sm" />
          </Link>

          {/* Category switcher — a segmented control, hidden on phones where the
              drawer carries the same options. */}
          <nav
            aria-label="Kategori"
            className="ml-2 hidden items-center gap-1 rounded-full bg-surface-container p-1 lg:flex"
          >
            <CategoryChip
              label="Tümü"
              active={activeCategory === null}
              onClick={() => setCategory(null)}
            />
            {UI_CATEGORIES.map((entry) => (
              <CategoryChip
                key={entry.id}
                label={entry.label}
                active={activeCategory === entry.id}
                onClick={() => setCategory(entry.id)}
              />
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 md:gap-3">
            <Link
              href="/kayitlilar"
              className="flex items-center gap-1.5 rounded-full px-2.5 py-2 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
              aria-label={`Kaydedilenler${count > 0 ? ` (${count})` : ""}`}
            >
              <Bookmark className="h-5 w-5" strokeWidth={1.75} />
              {count > 0 ? (
                <span className="text-label-sm tabular-nums">{count}</span>
              ) : null}
            </Link>

            <button
              type="button"
              onClick={handleShare}
              className="hidden rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary sm:block"
              aria-label="Paylaş"
            >
              <Share2 className="h-5 w-5" strokeWidth={1.75} />
            </button>

            <Button size="sm" className="h-9 gap-1.5 px-4" onClick={goToUpload}>
              <Upload strokeWidth={1.75} />
              <span className="hidden sm:inline">Görsel Yükle</span>
              <span className="sm:hidden">Yükle</span>
            </Button>
          </div>
        </div>
      </header>

      <WorkspaceDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        pathname={pathname}
        activeCategory={activeCategory}
        onCategory={(next) => {
          setCategory(next);
          setDrawerOpen(false);
        }}
        onUpload={goToUpload}
        savedCount={count}
      />
    </>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-label-sm uppercase tracking-[0.05em] transition-all",
        active
          ? "bg-surface-container-lowest text-primary shadow-sm"
          : "text-on-surface-variant hover:text-primary",
      )}
    >
      {label}
    </button>
  );
}

/** Slide-in workspace menu: navigation, categories and the saved list. */
function WorkspaceDrawer({
  open,
  onClose,
  pathname,
  activeCategory,
  onCategory,
  onUpload,
  savedCount,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
  activeCategory: string | null;
  onCategory: (next: string | null) => void;
  onUpload: () => void;
  savedCount: number;
}) {
  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-[60] bg-inverse-surface/40 backdrop-blur-sm transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        aria-label="Çalışma alanı menüsü"
        aria-hidden={!open}
        className={cn(
          "fixed left-0 top-0 z-[70] flex h-dvh w-[300px] max-w-[85vw] flex-col gap-6 border-r border-outline-variant/60 bg-surface-container-lowest p-5 shadow-ambient-lg transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-primary">
            <MarkasMark variant="compact" className="h-7 w-7" />
            <span className="font-display text-[18px] font-extrabold tracking-tight">
              MARKAS
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container"
            aria-label="Menüyü kapat"
            tabIndex={open ? 0 : -1}
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>

        <Button size="block" onClick={onUpload} tabIndex={open ? 0 : -1}>
          <Plus strokeWidth={1.75} />
          Yeni tarama
        </Button>

        <nav className="flex flex-col gap-1">
          <p className="label mb-1 text-outline">Sayfalar</p>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              tabIndex={open ? 0 : -1}
              className={cn(
                "rounded-xl px-3 py-2.5 text-body-md transition-colors",
                pathname === link.href
                  ? "bg-surface-container font-semibold text-primary"
                  : "text-on-surface-variant hover:bg-surface-container-low",
              )}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/kayitlilar"
            onClick={onClose}
            tabIndex={open ? 0 : -1}
            className={cn(
              "flex items-center justify-between rounded-xl px-3 py-2.5 text-body-md transition-colors",
              pathname === "/kayitlilar"
                ? "bg-surface-container font-semibold text-primary"
                : "text-on-surface-variant hover:bg-surface-container-low",
            )}
          >
            Kaydedilenler
            {savedCount > 0 ? (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold tabular-nums text-on-primary">
                {savedCount}
              </span>
            ) : null}
          </Link>
        </nav>

        <div className="flex flex-col gap-1">
          <p className="label mb-1 text-outline">Kategori</p>
          <div className="flex flex-wrap gap-2">
            <DrawerChip
              label="Tümü"
              active={activeCategory === null}
              onClick={() => onCategory(null)}
              tabIndex={open ? 0 : -1}
            />
            {UI_CATEGORIES.map((entry) => (
              <DrawerChip
                key={entry.id}
                label={entry.label}
                active={activeCategory === entry.id}
                onClick={() => onCategory(entry.id)}
                tabIndex={open ? 0 : -1}
              />
            ))}
          </div>
        </div>

        <p className="mt-auto flex items-start gap-2 text-[12px] leading-relaxed text-outline">
          <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          Ürün bağlantıları mağaza aramalarına yönlendirir; bazıları iş ortaklığı
          bağlantısıdır.
        </p>
      </aside>
    </>
  );
}

function DrawerChip({
  label,
  active,
  onClick,
  tabIndex,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tabIndex: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      tabIndex={tabIndex}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-label-sm uppercase tracking-[0.05em] transition-all",
        active
          ? "border-primary bg-primary text-on-primary"
          : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary",
      )}
    >
      {label}
    </button>
  );
}
