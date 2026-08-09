"use client";

import { useState } from "react";

import type { DetectionResult } from "@/types";

/**
 * What the scan actually did, for whoever is debugging it.
 *
 * Collapsed by default and plain-looking on purpose — this is not a product
 * surface, it is the answer to "why did this scan give that result", which until
 * now could only be guessed at from a screenshot. That guessing is exactly how a
 * global dominant colour labelled black shorts "pudra" for months.
 *
 * It renders whatever the response carries and nothing more. Timings and
 * degradation notes always arrive; the box-by-box detail only when the server has
 * `ENABLE_SCAN_DETAIL` set, so on a normal deployment this shows the short version
 * and says so rather than implying the pipeline dropped nothing.
 *
 * Doubles as the labelling aid for the eval set (`docs/ROADMAP.md` 1.1): reading
 * the boxes and families off a live scan beats hand-transcribing them.
 */
export function ScanDiagnostics({ result }: { result: DetectionResult }) {
  const [open, setOpen] = useState(false);
  const trace = result.trace;

  if (!trace) return null;

  const stages = Object.entries(trace.timings)
    .filter(([name]) => name !== "total")
    .sort((a, b) => b[1] - a[1]);
  const total = trace.timings.total ?? result.durationMs;
  const hasDetail = trace.dropped.length > 0 || trace.rejected.length > 0;

  return (
    <section className="mt-6 rounded-lg border border-neutral-200 text-xs dark:border-neutral-800">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left font-medium text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-900"
      >
        <span>
          Tarama teşhisi
          {trace.degraded.length > 0 ? (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {trace.degraded.length} aşama geriledi
            </span>
          ) : null}
        </span>
        <span className="tabular-nums text-neutral-500">{total} ms</span>
      </button>

      {open ? (
        <div className="space-y-4 border-t border-neutral-200 px-3 py-3 dark:border-neutral-800">
          <div>
            <h3 className="mb-1 font-medium text-neutral-500">Süreler</h3>
            {stages.length === 0 ? (
              <p className="text-neutral-500">Aşama süresi kaydedilmedi.</p>
            ) : (
              <ul className="space-y-0.5">
                {stages.map(([name, ms]) => (
                  <li key={name} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-neutral-500">{STAGE_NAMES[name] ?? name}</span>
                    {/*
                      A bar rather than a number alone: the useful question is
                      "which stage owns the latency", and that is a comparison,
                      not a reading.
                    */}
                    <span className="h-1.5 flex-1 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800">
                      <span
                        className="block h-full rounded bg-neutral-400 dark:bg-neutral-600"
                        style={{ width: `${total > 0 ? Math.min(100, (ms / total) * 100) : 0}%` }}
                      />
                    </span>
                    <span className="w-14 shrink-0 text-right tabular-nums text-neutral-500">
                      {ms} ms
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-neutral-500">
            <span>ham tespit: {trace.counts.rawDetections}</span>
            <span>kalan: {trace.counts.keptDetections}</span>
            <span>betimlenen: {trace.counts.describedItems}</span>
          </div>

          {trace.degraded.length > 0 ? (
            <div>
              <h3 className="mb-1 font-medium text-neutral-500">Gerileyen aşamalar</h3>
              <ul className="space-y-0.5">
                {trace.degraded.map((entry, index) => (
                  <li key={`${entry.stage}-${index}`} className="text-amber-700 dark:text-amber-400">
                    <span className="font-medium">{STAGE_NAMES[entry.stage] ?? entry.stage}</span>{" "}
                    — {entry.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/*
            Harcanan arama kredisi.

            Ayrıntı bayrağının arkasında değil, çünkü sorduğu soru hata ayıklama
            değil maliyet: gevşeyen her basamak bir `web.search` kredisi ve bu
            liste, o kredinin karşılığını görmenin tek yolu. «0 yeni aday» dönen
            bir basamak, boşa harcanmış paranın kendisi.
          */}
          {trace.searches.length > 0 ? (
            <div>
              <h3 className="mb-1 font-medium text-neutral-500">
                Canlı aramalar ({trace.searches.length})
              </h3>
              <ul className="space-y-0.5">
                {trace.searches.map((entry, index) => (
                  <li
                    key={`${entry.itemId}-${entry.tier}-${entry.rung}-${index}`}
                    className="flex flex-wrap gap-x-2 text-neutral-500"
                  >
                    <span className="font-medium text-neutral-600 dark:text-neutral-300">
                      {entry.source === "görsel"
                        ? "Görsel"
                        : entry.source === "cse"
                          ? "Google"
                          : entry.tier === "tr"
                            ? "TR"
                            : "Global"}
                    </span>
                    {/* Basamak metin merdiveninin kavramı; görsel yolda karşılığı yok. */}
                    {entry.source === "metin" ? (
                      <span className="tabular-nums text-neutral-400">basamak {entry.rung}</span>
                    ) : null}
                    <span>«{entry.query}»</span>
                    <span className="tabular-nums text-neutral-400">{entry.ms} ms</span>
                    {/*
                      Hata, sıfır sonuçtan farklı bir şey söylüyor: «o mağazalarda
                      yok» değil «soramadık». İkisini aynı görünüme sıkıştırmak,
                      düzeltilecek bir arızayı normal bir sonuç gibi gösterirdi.
                    */}
                    {entry.error ? (
                      <span className="text-red-700 dark:text-red-400">
                        → çağrı başarısız: {entry.error}
                      </span>
                    ) : (
                      <span
                        className={
                          entry.found > 0
                            ? "tabular-nums"
                            : "tabular-nums text-amber-700 dark:text-amber-400"
                        }
                      >
                        → {entry.found} yeni aday
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {trace.dropped.length > 0 ? (
            <div>
              <h3 className="mb-1 font-medium text-neutral-500">
                Elenen tespitler ({trace.dropped.length})
              </h3>
              <ul className="space-y-0.5">
                {trace.dropped.map((entry, index) => (
                  <li key={`${entry.name}-${index}`} className="flex flex-wrap gap-x-2 text-neutral-500">
                    <span className="font-medium text-neutral-600 dark:text-neutral-300">
                      {entry.name}
                    </span>
                    <span className="tabular-nums">%{Math.round(entry.score * 100)}</span>
                    <span className="tabular-nums text-neutral-400">
                      {entry.box.x.toFixed(3)} {entry.box.y.toFixed(3)} {entry.box.width.toFixed(3)}{" "}
                      {entry.box.height.toFixed(3)}
                    </span>
                    <span>— {entry.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {trace.rejected.length > 0 ? (
            <div>
              <h3 className="mb-1 font-medium text-neutral-500">
                Elenen ürün satırları ({trace.rejected.length})
              </h3>
              <ul className="space-y-0.5">
                {trace.rejected.map((entry, index) => (
                  <li key={`${entry.title}-${index}`} className="text-neutral-500">
                    <span className="text-neutral-600 dark:text-neutral-300">«{entry.title}»</span> —{" "}
                    {entry.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!hasDetail ? (
            <p className="text-neutral-400">
              Kutu ve satır dökümü kapalı. Sunucuda{" "}
              <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
                ENABLE_SCAN_DETAIL=true
              </code>{" "}
              ile açılır.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

const STAGE_NAMES: Record<string, string> = {
  decode: "çözme",
  vision: "Vision",
  foreground: "ön plan",
  regionColor: "bölge rengi",
  crop: "kırpma",
  vlm: "model",
  products: "ürünler",
  images: "görseller",
  total: "toplam",
};
