"use client";

import Link from "next/link";
import { Cookie } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useConsent } from "@/lib/consent";

/**
 * Storage-consent banner.
 *
 * The copy deliberately says "çerez ve yerel depolama" and does not claim
 * personalisation: Markas sets no cookies, runs no analytics and personalises
 * nothing, so the usual "we use cookies for personalised content" wording would
 * misdescribe the processing — the one thing a consent notice must not do.
 *
 * It only renders once the stored choice has been read, so it never flashes on
 * a return visit.
 */
export function CookieBanner() {
  const { state, decide } = useConsent();

  if (state === undefined || state !== null) return null;

  return (
    <div
      role="region"
      aria-label="Çerez ve depolama bildirimi"
      className="fixed bottom-24 left-4 right-4 z-[105] animate-fade-up md:bottom-6 md:right-auto md:max-w-[420px]"
    >
      <div className="rounded-2xl border border-outline-variant/70 bg-surface-container-lowest/90 p-4 shadow-ambient-lg backdrop-blur-md">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-container">
            <Cookie className="h-4 w-4 text-on-surface-variant" strokeWidth={1.75} />
          </span>

          <div className="min-w-0">
            <p className="text-[14px] leading-relaxed text-on-surface-variant">
              Markas, yalnızca çalışması için gerekli olan çerez ve yerel depolamayı
              kullanır: analiz ettiğin görsel ve kaydettiğin ürünler tarayıcında
              tutulur. Reklam veya izleme çerezi kullanmıyoruz. Ayrıntılar için{" "}
              <Link
                href="/gizlilik-politikasi"
                className="font-semibold text-primary underline underline-offset-2"
              >
                Gizlilik ve Çerez Politikamızı
              </Link>{" "}
              inceleyebilirsin.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => decide("accepted")}>
                Kabul et
              </Button>
              <Button variant="ghost" size="sm" onClick={() => decide("declined")}>
                Reddet
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
