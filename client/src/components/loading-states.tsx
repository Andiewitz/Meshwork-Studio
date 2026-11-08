import React from "react";
import { motion } from "framer-motion";
import { MeshworkLogo } from "@/components/MeshworkLogo";
import { AnimatedSpinner } from "@/components/ui/animated-spinner";
import { cn } from "@/lib/utils";

export interface RedirectLoadingProps {
  message?: string;
  subMessage?: string;
  className?: string;
}

/**
 * RedirectLoading (brand dark redirect loading screen)
 * Full-screen centered brand spinner with Meshwork logo and animated status.
 */
export function RedirectLoading({
  message = "Redirecting...",
  subMessage,
  className = "",
}: RedirectLoadingProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center min-h-screen bg-background fixed inset-0 z-[100]",
        className,
      )}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="flex flex-col items-center gap-6"
      >
        <div className="relative flex items-center justify-center">
          <AnimatedSpinner size="5.5rem" />
          <div className="absolute w-8 h-8 flex items-center justify-center pointer-events-none">
            <MeshworkLogo />
          </div>
        </div>
        {message && (
          <div className="flex flex-col items-center gap-1">
            <p className="text-xs font-medium text-foreground/70 tracking-wider uppercase">
              {message}
            </p>
            {subMessage && (
              <p className="text-[11px] text-muted-foreground">{subMessage}</p>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

export interface DefaultLoadingProps {
  message?: string;
  messages?: string[];
  interval?: number;
  size?: "sm" | "default" | "md" | "lg";
  className?: string;
  fullScreen?: boolean;
}

/** A quiet page-shaped placeholder while the next view is loading. */
export function DefaultLoading({
  message = "Loading…",
  className = "",
  fullScreen = true,
}: DefaultLoadingProps) {
  return (
    <div
      role="status"
      aria-label={message}
      className={cn(
        "bg-background text-foreground p-4 sm:p-6",
        fullScreen
          ? "fixed inset-0 z-[100] min-h-screen"
          : "min-h-[360px] w-full",
        className,
      )}
    >
      <span className="sr-only">{message}</span>
      <div
        aria-hidden="true"
        className="mx-auto flex h-full max-w-7xl gap-4 motion-safe:animate-pulse"
      >
        <div className="hidden w-48 shrink-0 space-y-4 rounded-2xl border border-border p-4 md:block">
          <div className="h-7 w-3/4 rounded-lg bg-muted" />
          <div className="h-8 rounded-lg bg-muted" />
          <div className="h-8 rounded-lg bg-muted" />
          <div className="h-8 rounded-lg bg-muted" />
        </div>
        <div className="flex-1 rounded-2xl border border-border p-5 sm:p-8">
          <div className="mx-auto mt-8 h-8 w-2/3 max-w-sm rounded-lg bg-muted" />
          <div className="mx-auto mt-3 h-4 w-1/2 max-w-xs rounded bg-muted" />
          <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-40 rounded-xl border border-border bg-muted/50"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DefaultLoading;
