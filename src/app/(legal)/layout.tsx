import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const LEGAL_NAV = [
  { href: "/gizlilik-politikasi", label: "Gizlilik ve Çerez" },
  { href: "/kullanim-kosullari", label: "Kullanım Koşulları" },
  { href: "/yasal-bildirim", label: "Yasal Bildirim" },
];

/**
 * Shared shell for the legal pages: a narrow measure for long-form reading,
 * cross-links between the three documents, and prose styling applied once here
 * rather than repeated per page.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-shell px-margin-mobile py-12 md:px-margin-desktop">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-body-md text-on-surface-variant transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Ana sayfaya dön
      </Link>

      <nav
        aria-label="Yasal belgeler"
        className="mt-6 flex flex-wrap gap-2 border-b border-outline-variant/60 pb-6"
      >
        {LEGAL_NAV.map((entry) => (
          <Link
            key={entry.href}
            href={entry.href}
            className="rounded-full border border-outline-variant px-3.5 py-1.5 text-label-sm uppercase tracking-[0.05em] text-on-surface-variant transition-all hover:border-primary hover:text-primary"
          >
            {entry.label}
          </Link>
        ))}
      </nav>

      {/*
        Long-form styling for the documents. Applied on a wrapper so each page
        is plain semantic markup with no per-element class noise.
      */}
      <article
        className="
          mt-10 max-w-3xl
          [&_a]:font-semibold [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2
          [&_h1]:font-display [&_h1]:text-display-lg-mobile [&_h1]:leading-tight [&_h1]:text-primary
          [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-[20px] [&_h2]:font-semibold [&_h2]:text-primary
          [&_h3]:mt-6 [&_h3]:font-display [&_h3]:text-[16px] [&_h3]:font-semibold [&_h3]:text-primary
          [&_li]:mt-1.5 [&_li]:text-body-md [&_li]:leading-relaxed [&_li]:text-on-surface-variant
          [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-5
          [&_p]:mt-3 [&_p]:text-body-md [&_p]:leading-relaxed [&_p]:text-on-surface-variant
          [&_table]:mt-4 [&_table]:w-full [&_table]:border-collapse
          [&_td]:border-t [&_td]:border-outline-variant/60 [&_td]:py-2.5 [&_td]:pr-4 [&_td]:align-top [&_td]:text-[14px] [&_td]:leading-relaxed [&_td]:text-on-surface-variant
          [&_th]:border-b [&_th]:border-outline-variant [&_th]:pb-2 [&_th]:pr-4 [&_th]:text-left [&_th]:text-label-sm [&_th]:uppercase [&_th]:tracking-[0.05em] [&_th]:text-outline
          [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5
        "
      >
        {children}
      </article>
    </div>
  );
}
