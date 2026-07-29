import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Affiliate transparency notice.
 *
 * Both the FTC-style disclosure and Turkish consumer-protection practice want
 * this near the links it describes, not buried in a policy page — so it appears
 * in the footer and again at the foot of the analysis rail.
 */
export function AffiliateNotice({
  className,
  variant = "block",
}: {
  className?: string;
  /** `inline` is the compact single-line form used inside the rail. */
  variant?: "block" | "inline";
}) {
  const text =
    "Markas, e-ticaret sitelerindeki bağımsız ürün muadillerini listeler. " +
    "Yönlendirilen bağlantılar üzerinden yapılan satın alımlardan komisyon kazanabiliriz.";

  if (variant === "inline") {
    return (
      <p className={cn("text-[11px] leading-relaxed text-outline", className)}>{text}</p>
    );
  }

  return (
    <p
      className={cn(
        "flex items-start gap-2 text-[13px] leading-relaxed text-on-surface-variant",
        className,
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
      <span>{text}</span>
    </p>
  );
}
