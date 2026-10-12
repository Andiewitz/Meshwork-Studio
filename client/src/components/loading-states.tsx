import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MeshworkLogo } from "@/components/MeshworkLogo";
import { AnimatedSpinner } from "@/components/ui/animated-spinner";
import { Spinner } from "@/components/ui/spinner";
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
            <p className="text-xs font-medium text-white/70 tracking-wider uppercase">
              {message}
            </p>
            {subMessage && (
              <p className="text-[11px] text-white/30">{subMessage}</p>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

const DEFAULT_MESSAGES = [
  "Lollygagging...",
  "Fetching from the server...",
  "Securing your data...",
  "Synchronizing cloud infrastructure...",
  "Calibrating real-time canvas...",
  "Synthesizing architecture nodes...",
  "Almost ready...",
];

export interface DefaultLoadingProps {
  /** Optional custom static message or dynamic message list */
  message?: string;
  messages?: string[];
  /** Message rotation interval in ms (default: 2200ms) */
  interval?: number;
  /** Spinner size variant */
  size?: "sm" | "default" | "md" | "lg";
  /** Optional container class */
  className?: string;
  /** Whether to render as fixed full screen overlay (default: true) */
  fullScreen?: boolean;
}

/**
 * DefaultLoading
 * Deep black background with a delicate hint of purple/blue/magenta ambient gradient.
 * Features the white SpellUI spinner and rotating non-boring status text.
 */
export function DefaultLoading({
  message,
  messages = DEFAULT_MESSAGES,
  interval = 2200,
  size = "lg",
  className = "",
  fullScreen = true,
}: DefaultLoadingProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (message) return; // If static message provided, skip cycling
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % messages.length);
    }, interval);
    return () => clearInterval(timer);
  }, [message, messages, interval]);

  const currentText = message ?? messages[index];

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center bg-[#09090b] text-white overflow-hidden select-none",
        fullScreen
          ? "fixed inset-0 z-[100] min-h-screen w-screen"
          : "w-full min-h-[360px] py-12",
        className,
      )}
    >
      {/* Subtle, delicate ambient background gradient: hint of purple, blue, magenta */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden="true"
      >
        {/* Soft top-right purple glow */}
        <div className="absolute -top-[20%] -right-[10%] w-[550px] h-[550px] rounded-full bg-purple-600/[0.09] blur-[140px]" />
        {/* Soft center-left blue glow */}
        <div className="absolute top-[30%] -left-[10%] w-[500px] h-[500px] rounded-full bg-blue-600/[0.09] blur-[140px]" />
        {/* Soft bottom-center magenta glow */}
        <div className="absolute -bottom-[20%] left-[25%] w-[550px] h-[550px] rounded-full bg-fuchsia-600/[0.08] blur-[150px]" />
        {/* Dark radial vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,#09090b_90%)]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="flex flex-col items-center gap-5 text-center px-6 relative z-10"
      >
        {/* White Spinner */}
        <Spinner size={size} speed="normal" className="text-white" />

        {/* Dynamic cycling status message */}
        <div className="h-7 flex items-center justify-center min-w-[220px]">
          <AnimatePresence mode="wait">
            <motion.p
              key={currentText}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}
              className="text-[13px] font-medium tracking-tight text-white/75 font-sans"
            >
              {currentText}
            </motion.p>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

export default DefaultLoading;
