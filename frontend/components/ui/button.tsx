import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap border-2 border-black text-sm font-pixel transition-colors active:translate-y-1 active:translate-x-1 outline-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[4px_4px_0_0_#000] hover:bg-primary/90 active:shadow-none",
        destructive: "bg-destructive text-destructive-foreground shadow-[4px_4px_0_0_#000] hover:bg-destructive/90 active:shadow-none",
        outline: "bg-background text-foreground shadow-[4px_4px_0_0_#000] hover:bg-accent hover:text-accent-foreground active:shadow-none",
        secondary: "bg-secondary text-secondary-foreground shadow-[4px_4px_0_0_#000] hover:bg-secondary/80 active:shadow-none",
        ghost: "border-transparent bg-transparent hover:bg-accent hover:text-accent-foreground active:translate-y-0 active:translate-x-0",
        link: "text-primary underline-offset-4 hover:underline active:translate-y-0 active:translate-x-0",
      },
      size: {
        default: "h-10 px-4 py-2 uppercase tracking-widest",
        sm: "h-9 px-3 uppercase tracking-widest text-xs",
        lg: "h-11 px-8 uppercase tracking-widest text-base",
        icon: "h-10 w-10 shadow-[4px_4px_0_0_#000] active:shadow-none",
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
