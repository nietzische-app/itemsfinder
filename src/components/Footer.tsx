import Link from "next/link";
import { Mail } from "lucide-react";

import { AffiliateNotice } from "@/components/AffiliateNotice";
import { MarkasLogo } from "@/components/MarkasLogo";

const SUPPORT_EMAIL = "destek@markas.app";

/** Feature links point at the sections that explain them, not dead anchors. */
const PRODUCT_LINKS = [
  { label: "Görsel arama", href: "/#upload" },
  { label: "Bütçe dostu muadiller", href: "/#nasil-calisir" },
  { label: "Kombin tespiti", href: "/#demo-looks" },
  { label: "Makyaj ve cilt tonu", href: "/#demo-looks" },
];

const LEGAL_LINKS = [
  { label: "Gizlilik ve Çerez Politikası", href: "/gizlilik-politikasi" },
  { label: "Kullanım Koşulları", href: "/kullanim-kosullari" },
  { label: "KVKK Aydınlatma Metni", href: "/yasal-bildirim" },
  { label: "Affiliate Bildirimi", href: "/kullanim-kosullari#affiliate" },
];

/** Four-column site footer, stacking to one column on phones. */
export function Footer() {
  return (
    <footer className="border-t border-outline-variant/60 bg-surface-container-lowest">
      <div className="mx-auto max-w-shell px-margin-mobile py-14 md:px-margin-desktop">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {/* Brand */}
          <div className="min-w-0">
            <span className="text-primary">
              <MarkasLogo size="sm" />
            </span>
            <p className="mt-4 text-body-md text-on-surface-variant">
              Gördüğün stili markala.
            </p>
            <p className="mt-6 text-[13px] text-outline">
              © 2026 Markas. Tüm hakları saklıdır.
            </p>
          </div>

          <FooterColumn title="Ürün ve Özellikler" links={PRODUCT_LINKS} />
          <FooterColumn title="Kurumsal ve Yasal" links={LEGAL_LINKS} />

          {/* Support */}
          <div className="min-w-0">
            <h3 className="label text-outline">Destek ve İletişim</h3>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link
                  href="/#sss"
                  className="text-body-md text-on-surface-variant transition-colors hover:text-primary"
                >
                  Sıkça Sorulan Sorular
                </Link>
              </li>
              <li>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="flex items-center gap-1.5 text-body-md text-on-surface-variant transition-colors hover:text-primary"
                >
                  <Mail className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  {SUPPORT_EMAIL}
                </a>
              </li>
              <li>
                <Link
                  href="/yasal-bildirim"
                  className="text-body-md text-on-surface-variant transition-colors hover:text-primary"
                >
                  Yasal bildirim
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 space-y-3 border-t border-outline-variant/60 pt-8">
          <AffiliateNotice />
          <p className="text-[13px] leading-relaxed text-outline">
            Ürün eşleşmeleri, canlı motorlar yapılandırılmadığı sürece örnek veridir.
            Fiyatlar mağaza sitelerinde değişebilir; bağlayıcı olan mağazanın kendi
            sayfasındaki bilgidir.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; href: string }>;
}) {
  return (
    <div className="min-w-0">
      <h3 className="label text-outline">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={`${link.href}-${link.label}`}>
            <Link
              href={link.href}
              className="text-body-md text-on-surface-variant transition-colors hover:text-primary"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
