"use client";

import { Bookmark, Filter, RotateCcw, Shirt, Sparkles, Watch } from "lucide-react";

import { EngineBadge } from "@/components/EngineBadge";
import { ScanDiagnostics } from "@/components/ScanDiagnostics";
import { cn } from "@/lib/utils";
import { UI_CATEGORIES, type UiCategory } from "@/lib/categories";
import { formatPrice } from "@/utils/affiliate";
import type { DetectionResult } from "@/types";

const CATEGORY_ICONS: Record<UiCategory, typeof Shirt> = {
  moda: Shirt,
  guzellik: Sparkles,
  aksesuar: Watch,
};

export interface AnalyzeFilters {
  category: UiCategory | null;
  /** Upper price bound, or `null` for no cap. */
  maxPrice: number | null;
}

interface AnalyzeSidebarProps {
  result: DetectionResult;
  filters: AnalyzeFilters;
  onFiltersChange: (next: AnalyzeFilters) => void;
  /** Detections available per category, for the counts on each toggle. */
  categoryCounts: Record<UiCategory, number>;
  /** Highest exact-match price in the result — the slider's ceiling. */
  priceCeiling: number;
  currency: string;
  savedCount: number;
  /** Detections passing the current filters. */
  visibleCount: number;
  onReset: () => void;
}

/**
 * The workspace tool rail — the Canva pattern of parking the controls that
 * shape the canvas in a fixed left column instead of scattering them over it.
 *
 * Everything here is live: the category toggles and the budget slider both
 * filter the detections rail, and the counts update as they do.
 */
export function AnalyzeSidebar({
  result,
  filters,
  onFiltersChange,
  categoryCounts,
  priceCeiling,
  currency,
  savedCount,
  visibleCount,
  onReset,
}: AnalyzeSidebarProps) {
  const isFiltered = filters.category !== null || filters.maxPrice !== null;

  return (
    <aside className="flex shrink-0 flex-col gap-6 border-outline-variant/60 bg-surface-container-lowest p-5 lg:w-[248px] lg:border-r">
      <div>
        <p className="label flex items-center gap-1.5 text-outline">
          <Filter className="h-3.5 w-3.5" strokeWidth={2} />
          Kategori
        </p>

        <div className="mt-3 flex flex-wrap gap-2 lg:flex-col">
          <FilterRow
            label="Tümü"
            count={Object.values(categoryCounts).reduce((sum, n) => sum + n, 0)}
            active={filters.category === null}
            onClick={() => onFiltersChange({ ...filters, category: null })}
          />
          {UI_CATEGORIES.map((entry) => {
            const Icon = CATEGORY_ICONS[entry.id];
            return (
              <FilterRow
                key={entry.id}
                label={entry.label}
                icon={<Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />}
                count={categoryCounts[entry.id]}
                active={filters.category === entry.id}
                disabled={categoryCounts[entry.id] === 0}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    // Tapping the active chip clears it — no dead end.
                    category: filters.category === entry.id ? null : entry.id,
                  })
                }
              />
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="label text-outline">Bütçe</p>
          <span className="font-display text-[14px] font-bold text-primary">
            {filters.maxPrice === null
              ? "Sınırsız"
              : `≤ ${formatPrice(filters.maxPrice, currency)}`}
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={priceCeiling}
          step={Math.max(1, Math.round(priceCeiling / 100))}
          value={filters.maxPrice ?? priceCeiling}
          aria-label="En yüksek fiyat"
          onChange={(event) => {
            const next = Number(event.target.value);
            onFiltersChange({
              ...filters,
              // Sliding to the ceiling means "no cap", not "exactly the max".
              maxPrice: next >= priceCeiling ? null : next,
            });
          }}
          className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-container-high accent-primary"
        />

        <div className="mt-1.5 flex justify-between text-[11px] text-outline">
          <span>{formatPrice(0, currency)}</span>
          <span>{formatPrice(priceCeiling, currency)}</span>
        </div>
      </div>

      <div className="rounded-xl bg-surface-container-low p-3">
        <p className="text-[13px] text-on-surface-variant">
          <strong className="font-semibold text-primary">{visibleCount}</strong> parça
          gösteriliyor
          {savedCount > 0 ? (
            <>
              {" · "}
              <span className="inline-flex items-center gap-1">
                <Bookmark className="h-3 w-3" strokeWidth={2} />
                {savedCount} kayıtlı
              </span>
            </>
          ) : null}
        </p>

        {isFiltered ? (
          <button
            type="button"
            onClick={onReset}
            className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-secondary-deep hover:underline"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
            Filtreleri sıfırla
          </button>
        ) : null}
      </div>

      <div className="mt-auto hidden lg:block">
        <EngineBadge result={result} />
        {/*
          Below the badge, collapsed. The badge says *what* ran; this says what it
          did and how long each part took. Renders nothing at all when the response
          carries no trace, so nothing appears on paths that predate it.
        */}
        <ScanDiagnostics result={result} />
      </div>
    </aside>
  );
}

function FilterRow({
  label,
  count,
  active,
  disabled,
  icon,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-2 rounded-xl px-3 py-2 text-body-md transition-all lg:w-full",
        active
          ? "bg-primary text-on-primary"
          : "text-on-surface-variant hover:bg-surface-container",
        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
      <span
        className={cn(
          "ml-auto shrink-0 text-[12px] tabular-nums",
          active ? "opacity-80" : "text-outline",
        )}
      >
        {count}
      </span>
    </button>
  );
}
