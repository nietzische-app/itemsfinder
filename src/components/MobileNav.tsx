"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Home, ScanLine } from "lucide-react";

import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Ana Sayfa", icon: Home },
  { href: "/analyze", label: "Tarama", icon: ScanLine },
  // Replaces a "Profil" tab that pointed at nothing — there is no account
  // system, so it was a dead affordance.
  { href: "/kayitlilar", label: "Kayıtlılar", icon: Bookmark },
];

/** Bottom tab bar, mobile only — matches the design's mobile navigation. */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around rounded-t-md bg-surface-container-lowest/85 backdrop-blur-md px-gutter py-base shadow-[0_-4px_20px_rgba(0,0,0,0.05)] md:hidden">
      {ITEMS.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 px-4 py-1 transition-colors",
              isActive ? "text-secondary" : "text-outline",
            )}
          >
            <item.icon className="h-6 w-6" strokeWidth={isActive ? 2 : 1.5} />
            <span className="label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
