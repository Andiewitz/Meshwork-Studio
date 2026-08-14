import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { ShieldCheckIcon, XMarkIcon } from "@heroicons/react/24/outline";

const COOKIE_CONSENT_KEY = "meshwork_cookie_consent";

export function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Check if user already made a choice
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      // Delay showing slightly for smoother UX
      const timer = setTimeout(() => setShow(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    setShow(false);
  };

  const handleDecline = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "essential_only");
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.aside
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.95 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-5 right-5 left-5 sm:left-auto sm:max-w-md z-50 p-5 rounded-2xl bg-zinc-950/95 border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.8)] backdrop-blur-xl font-sans"
          aria-label="Cookie consent banner"
        >
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0 text-orange-400 mt-0.5">
              <ShieldCheckIcon className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <h3 className="text-sm font-semibold text-white tracking-tight">
                  Cookie &amp; Privacy Notice
                </h3>
                <button
                  onClick={handleDecline}
                  className="text-white/40 hover:text-white transition-colors p-1 -mr-1 -mt-1 rounded-lg"
                  aria-label="Close cookie banner"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs leading-relaxed text-white/60 mb-3.5">
                We use essential cookies for authentication and session
                management. By continuing to browse, you agree to our{" "}
                <Link
                  href="/privacy"
                  className="text-white/90 underline decoration-white/30 hover:decoration-white transition-colors"
                >
                  Privacy Policy
                </Link>{" "}
                and{" "}
                <Link
                  href="/terms"
                  className="text-white/90 underline decoration-white/30 hover:decoration-white transition-colors"
                >
                  Terms of Service
                </Link>
                .
              </p>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleAccept}
                  className="flex-1 py-2 px-3.5 rounded-lg bg-white text-black hover:bg-white/90 text-xs font-semibold tracking-tight transition-all duration-150 cursor-pointer shadow-sm active:scale-[0.98]"
                >
                  Accept All
                </button>
                <button
                  onClick={handleDecline}
                  className="py-2 px-3.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white/70 hover:text-white text-xs font-medium transition-all duration-150 cursor-pointer active:scale-[0.98]"
                >
                  Essential Only
                </button>
              </div>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
