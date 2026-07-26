import { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { motion } from "framer-motion";
import { MeshworkLogo } from "@/components/MeshworkLogo";
import { AnimatedSpinner } from "@/components/ui/animated-spinner";
import { Monitor, ArrowLeft } from "lucide-react";

export function MobileGate() {
  const [mounted, setMounted] = useState(false);
  const [screenWidth, setScreenWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 0,
  );

  useEffect(() => {
    setMounted(true);
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (!mounted) return null;

  const content = (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-[#0d0d0d] text-white p-6 select-none font-body">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-sm rounded-xl border border-white/10 bg-white/[0.03] p-7 text-center backdrop-blur-2xl shadow-2xl flex flex-col items-center"
      >
        {/* Logo & Spinner */}
        <div className="relative mb-5 flex items-center justify-center">
          <AnimatedSpinner size="5rem" />
          <div className="absolute w-8 h-8 flex items-center justify-center pointer-events-none">
            <MeshworkLogo />
          </div>
        </div>

        {/* Badge */}
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-medium text-white/50 uppercase tracking-wider">
          <Monitor className="h-3 w-3" />
          <span>Desktop Only</span>
        </div>

        {/* Title */}
        <h2 className="mb-2 text-lg font-bold tracking-tight text-white">
          Desktop view required
        </h2>

        {/* Description - clean & direct */}
        <p className="mb-5 text-xs text-white/50 leading-relaxed">
          Meshwork Studio is optimized for larger screens. Please open it on a
          desktop or laptop.
        </p>

        {/* Screen size info */}
        <div className="mb-5 flex items-center justify-between w-full rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-white/40">
          <span>Screen width</span>
          <span className="font-mono text-white/70">{screenWidth}px</span>
        </div>

        {/* Action */}
        <a
          href="/"
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-white/[0.06] border border-white/10 px-4 py-2 text-xs font-medium text-white hover:bg-white/10 transition-colors cursor-figma-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to home
        </a>
      </motion.div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
}
