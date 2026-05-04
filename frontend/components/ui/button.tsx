import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-on-primary hover:shadow-soft-md active:scale-[0.98] active:shadow-soft",
        "default-tonal": "bg-primary-container text-on-primary-container hover:opacity-80 active:scale-[0.98]",
        destructive: "bg-error text-on-error hover:shadow-soft-md active:scale-[0.98] active:shadow-soft",
        "destructive-tonal": "bg-error-container text-on-error-container hover:opacity-80 active:scale-[0.98]",
        outline: "border border-outline text-on-surface hover:shadow-soft active:scale-[0.98]",
        secondary: "bg-secondary-container text-on-secondary-container hover:opacity-80 active:scale-[0.98]",
        ghost: "text-on-surface-variant hover:bg-state-layer-base active:scale-[0.98]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-6 py-2",
        sm: "h-9 px-5 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
