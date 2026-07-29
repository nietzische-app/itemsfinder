"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ScanLine, User } from "lucide-react";

import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/analyze", label: "Scan", icon: ScanLine },
];

/** Bottom tab bar, mobile only — matches the design's mobile navigation. */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around rounded-t-md bg-surface px-gutter py-base shadow-[0_-4px_20px_rgba(0,0,0,0.05)] md:hidden">
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
      <span className="flex flex-col items-center justify-center gap-0.5 px-4 py-1 text-outline">
        <User className="h-6 w-6" strokeWidth={1.5} />
        <span className="label">Profile</span>
      </span>
    </nav>
  );
}
