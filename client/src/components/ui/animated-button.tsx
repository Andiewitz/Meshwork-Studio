"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-medium text-base outline-none transition-shadow before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-9 px-3",
        lg: "h-10 px-4",
      },
      variant: {
        default:
          "border-primary bg-primary text-black shadow-sm hover:bg-primary/90",
        ghost: "border-transparent text-foreground hover:bg-white/5",
      },
    },
  },
);

interface BaseButtonProps extends useRender.ComponentProps<"button"> {
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
}

function BaseButton({
  className,
  variant,
  size,
  render,
  ...props
}: BaseButtonProps) {
  const typeValue: React.ButtonHTMLAttributes<HTMLButtonElement>["type"] =
    render ? undefined : "button";

  const defaultProps = {
    className: cn(buttonVariants({ className, size, variant })),
    "data-slot": "button",
    type: typeValue,
  };

  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render,
  });
}

// ─── Animated Pill Button ────────────────────────────────────────────────────
// The pill-style CTA from the component demo, adapted for the Meshwork Studio
// dark/blue theme. Primary background uses the app's Google blue (#1a73e8).

interface AnimatedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
}

export function AnimatedButton({
  label = "New Workspace",
  className,
  ...props
}: AnimatedButtonProps) {
  return (
    <BaseButton
      className={cn(
        "group mx-auto flex cursor-pointer items-center justify-center gap-0 rounded-full border-none bg-transparent px-0 py-5 font-normal shadow-none hover:bg-transparent",
        className,
      )}
      {...props}
    >
      {/* Label pill */}
      <span className="rounded-full bg-primary px-6 py-3 text-white font-sans font-bold tracking-wide duration-500 ease-in-out group-hover:bg-white/10 group-hover:text-primary group-hover:transition-colors">
        {label}
      </span>

      {/* Arrow icon pill */}
      <div className="relative flex h-fit cursor-pointer items-center overflow-hidden rounded-full bg-primary p-5 text-white duration-500 ease-in-out group-hover:bg-white/10 group-hover:text-primary group-hover:transition-colors">
        <ArrowUpRight className="absolute h-5 w-5 -translate-x-1/2 transition-all duration-500 ease-in-out group-hover:translate-x-10" />
        <ArrowUpRight className="absolute h-5 w-5 -translate-x-10 transition-all duration-500 ease-in-out group-hover:-translate-x-1/2" />
      </div>
    </BaseButton>
  );
}

export { BaseButton as Button, buttonVariants };
