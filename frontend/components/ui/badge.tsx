import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center px-3 py-1 font-sans font-black text-[11px] uppercase tracking-[0.1em] transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary text-on-primary",
        secondary: "bg-[#F7F2EB] text-on-surface",
        outline: "bg-transparent border border-outline text-on-surface",
        amber: "bg-[#FFDDB3] text-[#8B5000]",
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
  const darkModeClasses = getBadgeClasses(variant);
  return <div className={cn(badgeVariants({ variant }), darkModeClasses, className)} {...props} />;
}

export { Badge, badgeVariants };

export function getBadgeClasses(variant: string | null | undefined) {
  if (variant === "secondary") {
    return "dark:bg-[#2A2520] dark:text-[#E8E0D5]";
  }
  if (variant === "amber") {
    return "dark:bg-[#5C3D1A] dark:text-[#FFDDB3]";
  }
  return "";
}
