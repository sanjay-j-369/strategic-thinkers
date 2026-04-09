import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center border-2 border-black px-3 py-1 font-sans font-black text-[11px] uppercase tracking-[0.1em] transition-colors",
  {
    variants: {
      variant: {
        default: "bg-[#ffde59] text-black",
        secondary: "bg-[#dff2ff] text-black",
        outline: "bg-white text-black",
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
