import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] text-xs font-semibold font-sans focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 transition-all duration-150 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-[#F0521E] text-[#0C0C0E] font-bold hover:bg-[#F26E41] shadow-sm",
        secondary:
          "bg-[#242430] text-[#FAFAFA] border border-[#2A2A36] hover:bg-[#2E2E3C]",
        ghost:
          "bg-transparent text-[#A0A0B0] hover:bg-[#242430] hover:text-[#FAFAFA]",
        destructive: "bg-[#EF4444] text-[#FAFAFA] hover:bg-[#DC2626]",
        mosh: "bg-[rgba(0,229,160,0.10)] text-[#00E5A0] border border-[rgba(0,229,160,0.22)] hover:bg-[rgba(0,229,160,0.18)]",
        outline:
          "border border-[#1E1E24] bg-transparent text-[#FAFAFA] hover:bg-[#242430]",
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
