"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "font-pixel text-[12px] uppercase tracking-[0.22em] text-black/55",
      className
    )}
    {...props}
  />
));

Label.displayName = "Label";

export { Label };
