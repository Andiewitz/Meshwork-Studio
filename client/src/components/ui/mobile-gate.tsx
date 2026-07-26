import { motion } from "framer-motion";
import { MeshworkLogo } from "@/components/MeshworkLogo";
import { AnimatedSpinner } from "@/components/ui/animated-spinner";
import { Monitor, ArrowLeft, ShieldAlert } from "lucide-react";
import { useState, useEffect } from "react";

export function MobileGate() {
  const [screenWidth, setScreenWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 0,
  );

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0a0a0a] text-white p-6 select-none overflow-hidden font-body technical-gradient">
      {/* Ambient background glow orbs */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 translate-y-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Main glass card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center backdrop-blur-3xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col items-center"
      >
        {/* Top subtle highlight */}
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

        {/* Logo & Spinner Header */}
        <div className="relative mb-6 flex items-center justify-center">
          <AnimatedSpinner size="6rem" />
          <div className="absolute w-9 h-9 flex items-center justify-center pointer-events-none">
            <MeshworkLogo />
          </div>
        </div>

        {/* Badge */}
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary uppercase tracking-widest">
          <Monitor className="h-3.5 w-3.5" />
          <span>Desktop Required</span>
        </div>

        {/* Title */}
        <h2
          className="mb-3 text-xl font-bold tracking-tight text-white"
          style={{ fontFamily: "var(--font-headline)" }}
        >
          Designed for Larger Screens
        </h2>

        {/* Description */}
        <p className="mb-6 text-xs text-white/50 leading-relaxed max-w-xs">
          Meshwork Studio is a high-performance system architecture IDE built
          for multi-pane diagramming, node composition, and live canvas editing.
          Please switch to a desktop or laptop for the full experience.
        </p>

        {/* Screen size indicator box */}
        <div className="mb-6 flex items-center justify-between w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-[11px]">
          <span className="text-white/40 flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-primary/70" />
            Current width
          </span>
          <span className="font-mono text-white/80 font-medium">
            {screenWidth}px{" "}
            <span className="text-white/30">(Required ≥ 1024px)</span>
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 w-full">
          <a
            href="/"
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-white/[0.05] border border-white/10 px-4 py-2.5 text-xs font-medium text-white hover:bg-white/10 transition-all cursor-figma-pointer active:scale-95"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to landing page
          </a>
        </div>
      </motion.div>
    </div>
  );
}
