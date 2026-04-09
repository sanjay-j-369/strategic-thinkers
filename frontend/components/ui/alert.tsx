import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva("border-2 border-black p-4 shadow-[4px_4px_0_0_#000]", {
  variants: {
    variant: {
      default: "bg-white text-black",
      info: "bg-[#dff2ff] text-black",
      success: "bg-[#d8ff8f] text-black",
      warning: "bg-[#ffe28a] text-black",
      destructive: "bg-[#ffb0a8] text-black",
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
