"use client";

import { useCallback, useEffect, useState } from "react";

import type { ProductMatch } from "@/types";
import { priceIsShowable } from "@/utils/affiliate";

/**
 * "Kaydet" list, persisted in localStorage.
 *
 * Deliberately local: there is no account system, so a server-side wishlist
 * would be a lie. Everything here degrades to a no-op when storage is
 * unavailable (private mode, quota) rather than throwing at the click site.
 */
const STORAGE_KEY = "markas:saved-products";

export interface SavedProduct {
  id: string;
  title: string;
  brand: string;
  merchant: string;
  price: number;
  currency: string;
  productUrl: string;
  /**
   * Kaydedildiği anda fiyat gösterilebilir miydi (`priceIsShowable`).
   *
   * Kaydedilenler listesi ürünü yeniden çözmüyor, kaydedildiği andaki kopyayı
   * gösteriyor — yani kuralı burada da uygulayabilmek için kararın kendisi
   * saklanıyor. Alanı olmayan eski kayıtlar gösterilebilir sayılıyor: bağlantılar
   * yazılmadan önce kaydedilmişler ve hiçbir mağazanın fiyatı gibi okunmuyorlardı.
   */
  priceShown?: boolean;
  savedAt: string;
}

/** Fired after any write so every mounted hook re-reads at once. */
const CHANGE_EVENT = "markas:saved-changed";

function read(): SavedProduct[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedProduct[]) : [];
  } catch {
    return [];
  }
}

function write(items: SavedProduct[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Nothing to do — the in-memory state below still reflects the click.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function toProductSummary(product: ProductMatch): SavedProduct {
  return {
    id: product.id,
    title: product.title,
    brand: product.brand,
    merchant: product.merchant,
    price: product.price,
    currency: product.currency,
    productUrl: product.productUrl,
    priceShown: priceIsShowable(product),
    savedAt: new Date().toISOString(),
  };
}

/**
 * Saved-products state. Returns `null` for `items` until the first client
 * read completes, so server and client markup agree on the initial paint.
 */
export function useSavedProducts() {
  const [items, setItems] = useState<SavedProduct[] | null>(null);

  useEffect(() => {
    const sync = () => setItems(read());
    sync();

    window.addEventListener(CHANGE_EVENT, sync);
    // Keep other tabs in step too.
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const isSaved = useCallback(
    (id: string) => (items ?? []).some((entry) => entry.id === id),
    [items],
  );

  /** Adds or removes a product. Returns the state it ended up in. */
  const toggle = useCallback((product: ProductMatch): "saved" | "removed" => {
    const current = read();
    const exists = current.some((entry) => entry.id === product.id);

    const next = exists
      ? current.filter((entry) => entry.id !== product.id)
      : [...current, toProductSummary(product)];

    write(next);
    setItems(next);
    return exists ? "removed" : "saved";
  }, []);

  const clear = useCallback(() => {
    write([]);
    setItems([]);
  }, []);

  return { items, count: items?.length ?? 0, isSaved, toggle, clear };
}
