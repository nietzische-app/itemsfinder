import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Camera } from "lucide-react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Get The Look — Find any outfit or makeup look in seconds",
  description:
    "Upload a screenshot from Instagram or TikTok and instantly find the exact items — plus budget-friendly alternatives you can actually buy.",
  openGraph: {
    title: "Get The Look",
    description:
      "Screenshot any outfit or makeup look and shop the exact items or cheaper dupes.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans">
        <div className="flex min-h-dvh flex-col">
          <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
            <div className="container flex h-16 items-center justify-between">
              <Link href="/" className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-white shadow-md shadow-primary/25">
                  <Camera className="h-5 w-5" />
                </span>
                <span className="text-lg font-bold tracking-tight">
                  Get The <span className="text-gradient">Look</span>
                </span>
              </Link>

              <nav className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                <a href="/#how-it-works" className="rounded-full px-3 py-2 hover:text-foreground">
                  How it works
                </a>
                <Link href="/analyze" className="rounded-full px-3 py-2 hover:text-foreground">
                  Analyze
                </Link>
              </nav>
            </div>
          </header>

          <main className="flex-1">{children}</main>

          <footer className="border-t py-8">
            <div className="container flex flex-col items-center gap-2 text-center text-xs text-muted-foreground">
              <p>
                Get The Look — MVP. Product matches are illustrative demo data unless a
                live vision provider is configured.
              </p>
              <p>
                Some outbound links are affiliate links; we may earn a commission from
                qualifying purchases.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
