import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";

import { Suspense } from "react";

import { MobileNav } from "@/components/MobileNav";
import { SiteHeader } from "@/components/SiteHeader";
import { ToastProvider } from "@/components/ui/toast";

import "./globals.css";

/**
 * Plus Jakarta Sans for headlines (geometric, editorial), Inter for body
 * (legible at small sizes). Both are self-hosted by `next/font` at build time,
 * so there is no runtime request to Google.
 */
const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

const DESCRIPTION =
  "Instagram veya TikTok'ta beğendiğin kombin ve makyaj görsellerini yükle; " +
  "yapay zeka tam muadillerini ve en uygun fiyatlı seçeneklerini anında bulsun.";

export const metadata: Metadata = {
  title: "Markas — Görsel Stil ve Kombin Arama Motoru",
  description: DESCRIPTION,
  applicationName: "Markas",
  openGraph: {
    siteName: "Markas",
    title: "Markas — Görsel Stil ve Kombin Arama Motoru",
    description: DESCRIPTION,
    locale: "tr_TR",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#fafafa",
  width: "device-width",
  initialScale: 1,
};

/** Inline paper-grain noise — adds tactility without an external asset. */
const GRAIN =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
      <filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/></filter>
      <rect width="160" height="160" filter="url(#n)"/>
    </svg>`,
  );

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" className={`${display.variable} ${body.variable}`}>
      <body>
        <ToastProvider>
          <div className="flex min-h-dvh flex-col">
            {/* The header reads `?kategori=` via useSearchParams, which needs a
                boundary so the static shell can still be prerendered. */}
            <Suspense fallback={<div className="h-16 md:h-[72px]" />}>
              <SiteHeader />
            </Suspense>
            <main className="flex-1 pb-20 md:pb-0">{children}</main>
          </div>

          <MobileNav />
        </ToastProvider>

        {/* Subtle paper grain over the whole canvas. */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[100] opacity-[0.035]"
          style={{ backgroundImage: `url("${GRAIN}")` }}
        />
      </body>
    </html>
  );
}
