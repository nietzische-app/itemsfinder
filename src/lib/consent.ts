"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Storage-consent state.
 *
 * Worth being precise about what this gates. Markas sets **no cookies** and
 * runs no analytics or advertising scripts. The only browser storage it uses
 * is strictly necessary for features the user asked for:
 *
 *   sessionStorage `markas:pending-image`   — the screenshot being analysed
 *   localStorage   `markas:saved-products`  — the "Kaydet" list
 *   localStorage   `markas:consent`         — this preference
 *
 * Under KVKK and GDPR, strictly-necessary storage does not require consent, so
 * declining does not break anything today. The flag exists so that if optional
 * measurement is ever added, it has a switch to sit behind from day one —
 * `hasOptionalConsent()` is the gate to check.
 */
const STORAGE_KEY = "markas:consent";

export type ConsentState = "accepted" | "declined";

/** Fired after a write so every mounted hook re-reads at once. */
const CHANGE_EVENT = "markas:consent-changed";

function read(): ConsentState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "accepted" || raw === "declined" ? raw : null;
  } catch {
    return null;
  }
}

/**
 * True only when the user has actively opted in. Any future optional script —
 * analytics, remarketing — must be behind this and nothing else.
 */
export function hasOptionalConsent(): boolean {
  return read() === "accepted";
}

export function useConsent() {
  /** `undefined` while unread, `null` once read and no choice was stored. */
  const [state, setState] = useState<ConsentState | null | undefined>(undefined);

  useEffect(() => {
    const sync = () => setState(read());
    sync();

    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const decide = useCallback((next: ConsentState) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode: the banner still closes for this session.
    }
    setState(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { state, decide };
}
