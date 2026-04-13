import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(" border border-border p-4", {
  variants: {
    variant: {
      default: "bg-card text-card-foreground",
      info: "bg-card text-card-foreground",
      success: "bg-primary text-primary-foreground",
      warning: "bg-primary text-primary-foreground",
      destructive: "bg-primary text-primary-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

function Alert({ className, variant, ...props }: AlertProps) {
  return <div className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h5
      className={cn(
        "font-sans text-sm font-black uppercase tracking-[0.1em]",
        className
      )}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-2 text-sm leading-7", className)} {...props} />;
}

export { Alert, AlertTitle, AlertDescription };
