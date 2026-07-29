import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Buttons are always fully rounded pills — the design system uses shape to
 * separate "actionable" from the rectangular nature of fashion imagery.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** Matte black — primary navigation and core CTAs. */
        primary: "bg-primary text-on-primary shadow-sm hover:bg-black hover:shadow-md",
        /** Coral — conversion points only ("Buy", "View curated look"). */
        coral: "bg-secondary text-on-secondary hover:opacity-90",
        outline:
          "border border-primary bg-transparent text-primary hover:bg-surface-container-low",
        subtle:
          "border border-outline-variant bg-surface-container-lowest text-on-surface hover:border-primary",
        ghost: "text-on-surface-variant hover:bg-surface-container-low hover:text-primary",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-4 text-label-sm [&_svg]:size-4",
        default: "h-11 px-6 text-body-md [&_svg]:size-5",
        lg: "h-14 px-8 text-body-md [&_svg]:size-5",
        block: "h-14 w-full px-6 text-label-sm uppercase [&_svg]:size-5",
        icon: "h-10 w-10 [&_svg]:size-5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
