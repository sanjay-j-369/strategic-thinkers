import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.24em] transition-colors",
  {
    variants: {
      variant: {
        default: "border-white/15 bg-white/[0.08] text-zinc-100",
        secondary: "border-white/8 bg-white/[0.04] text-zinc-400",
        outline: "border-white/12 bg-transparent text-zinc-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
