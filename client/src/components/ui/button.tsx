import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none text-sm font-medium focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 transition-all",
  {
    variants: {
      variant: {
        default:
          "bg-primary/90 text-primary-foreground border border-primary/50 hover:bg-primary hover:shadow-[0_0_15px_rgba(26,115,232,0.3)] backdrop-blur-md",
        destructive:
          "bg-destructive/90 text-destructive-foreground border border-destructive/50 hover:bg-destructive hover:shadow-[0_0_15px_rgba(239,68,68,0.5)] backdrop-blur-md",
        outline:
          "border border-border/50 bg-background/30 backdrop-blur-md hover:bg-muted/50 text-foreground",
        secondary:
          "bg-secondary/60 text-secondary-foreground border border-secondary/50 backdrop-blur-md hover:bg-secondary/80",
        ghost: "border border-transparent hover:bg-muted/50 backdrop-blur-sm",
      },
      // Heights are set as "min" heights, because sometimes Ai will place large amount of content
      // inside buttons. With a min-height they will look appropriate with small amounts of content,
      // but will expand to fit large amounts of content.
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
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
