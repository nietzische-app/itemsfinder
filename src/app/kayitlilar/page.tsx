"use client";

import Link from "next/link";
import { ArrowUpRight, Bookmark, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useSavedProducts } from "@/lib/savedItems";
import { formatPrice } from "@/utils/affiliate";

/** The "Kaydet" list. Local to the browser — there is no account system. */
export default function SavedPage() {
  const { items, count, toggle, clear } = useSavedProducts();
  const { toast } = useToast();

  return (
    <div className="mx-auto max-w-shell px-margin-mobile py-12 md:px-margin-desktop">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-headline-md text-primary">Kaydedilenler</h1>
          <p className="mt-1 text-on-surface-variant">
            {items === null
              ? "Yükleniyor…"
              : count === 0
                ? "Henüz kaydettiğin bir ürün yok."
                : `${count} ürün kaydettin. Liste yalnızca bu tarayıcıda saklanır.`}
          </p>
        </div>

        {count > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              clear();
              toast("Kayıtlı ürünler temizlendi");
            }}
          >
            <Trash2 strokeWidth={1.75} />
            Listeyi temizle
          </Button>
        ) : null}
      </div>

      {items !== null && count === 0 ? (
        <div className="mt-12 flex flex-col items-center rounded-2xl border border-dashed border-outline-variant/70 bg-surface-container-lowest py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container">
            <Bookmark className="h-6 w-6 text-outline" strokeWidth={1.5} />
          </span>
          <p className="mt-5 font-display text-[18px] font-semibold text-primary">
            Liste boş
          </p>
          <p className="mt-1 max-w-sm text-on-surface-variant">
            Bir tarama yapıp beğendiğin ürünlerde &laquo;Kaydet&raquo;e dokun.
          </p>
          <Button asChild className="mt-6">
            <Link href="/">Taramaya başla</Link>
          </Button>
        </div>
      ) : null}

      {items && items.length > 0 ? (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((product) => (
            <li
              key={product.id}
              className="flex min-w-0 flex-col gap-3 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-4 shadow-sm transition-all duration-300 hover:shadow-xl"
            >
              <div className="min-w-0">
                <p className="label truncate text-outline">
                  {product.brand === product.merchant
                    ? product.brand
                    : `${product.brand} · ${product.merchant}`}
                </p>
                <p className="mt-1 font-display text-[16px] font-semibold leading-tight text-primary">
                  {product.title}
                </p>
              </div>

              <div className="mt-auto flex items-center justify-between gap-2">
                <span className="font-display text-[18px] font-bold text-primary">
                  {formatPrice(product.price, product.currency)}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      toggle({ ...product, id: product.id } as never);
                      toast("Kayıtlılardan çıkarıldı");
                    }}
                    className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-error"
                    aria-label="Kayıtlılardan çıkar"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  {product.productUrl ? (
                    <Button asChild size="sm">
                      <a
                        href={product.productUrl}
                        target="_blank"
                        rel="noopener noreferrer sponsored nofollow"
                      >
                        Aç
                        <ArrowUpRight strokeWidth={1.75} />
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
