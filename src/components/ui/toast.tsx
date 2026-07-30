"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Check, Info, TriangleAlert, X } from "lucide-react";

import { cn } from "@/lib/utils";

type ToastTone = "success" | "info" | "error";

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DISMISS_AFTER_MS = 3200;

/**
 * Minimal toast stack — no dependency, no portal gymnastics.
 *
 * Actions that change state without navigating (saving an item, copying a
 * link) need to say so, otherwise the click reads as dead. That is what this
 * exists for.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const toast = useCallback((message: string, tone: ToastTone = "success") => {
    // `Date.now()` can collide inside one tick; the random suffix cannot.
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[130] flex flex-col items-center gap-2 px-4 md:bottom-8"
      >
        {toasts.map((entry) => (
          <ToastRow key={entry.id} toast={entry} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastRow({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const Icon =
    toast.tone === "success" ? Check : toast.tone === "error" ? TriangleAlert : Info;

  return (
    <div
      className={cn(
        "pointer-events-auto flex max-w-md items-center gap-3 rounded-full border px-4 py-2.5 shadow-ambient-lg backdrop-blur-md",
        toast.tone === "error"
          ? "border-error/25 bg-error/10 text-error"
          : "border-outline-variant/60 bg-primary/90 text-on-primary",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
      <p className="text-[14px] font-medium">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="ml-1 shrink-0 rounded-full p-0.5 opacity-70 transition-opacity hover:opacity-100"
        aria-label="Bildirimi kapat"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}

/**
 * Returns a `toast()` function. Safe outside the provider — it degrades to a
 * no-op rather than throwing, so a component can be rendered in isolation.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  return context ?? { toast: () => undefined };
}
