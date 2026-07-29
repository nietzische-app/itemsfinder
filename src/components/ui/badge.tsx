import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Utility/metadata labels. Per the design system these are uppercase Inter
 * with widened tracking — "AI POWERED LOOKS", "IDENTIFIED", "STREETWEAR".
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 text-label-sm uppercase tracking-[0.05em]",
  {
    variants: {
      variant: {
        coral: "rounded-full bg-secondary px-4 py-1 text-on-secondary",
        dark: "rounded-full bg-primary px-4 py-1 text-on-primary",
        outline:
          "rounded-full border border-outline-variant px-3 py-1 text-on-surface-variant",
        success: "rounded-full bg-success/10 px-3 py-1 text-success",
        /** Bare text label, e.g. the category eyebrow above a card title. */
        text: "text-secondary-deep",
        muted: "text-outline",
      },
    },
    defaultVariants: {
      variant: "coral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
