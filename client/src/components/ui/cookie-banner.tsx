import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";

const COOKIE_CONSENT_KEY = "meshwork_cookie_consent";

export function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
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
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-0 left-0 right-0 z-50"
          aria-label="Cookie consent"
        >
          {/* Sharp top border accent */}
          <div className="h-[2px] w-full bg-white/20" />

          <div className="bg-zinc-950 border-t-0 border-b border-l border-r border-white/10 px-5 py-4 sm:px-8 sm:py-5">
            <div className="max-w-screen-xl mx-auto flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
              {/* Text — stretches to fill horizontal space */}
              <p className="flex-1 text-sm leading-relaxed text-white/55 font-sans">
                We use essential cookies for authentication and session
                management. By continuing you agree to our{" "}
                <Link
                  href="/privacy"
                  className="text-white font-semibold underline underline-offset-2 decoration-white/40 hover:decoration-white transition-colors"
                >
                  Privacy Policy
                </Link>{" "}
                and{" "}
                <Link
                  href="/terms"
                  className="text-white font-semibold underline underline-offset-2 decoration-white/40 hover:decoration-white transition-colors"
                >
                  Terms of Service
                </Link>
                .
              </p>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleDecline}
                  className="py-2 px-5 text-xs font-medium text-white/50 hover:text-white/80 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Essential only
                </button>
                <button
                  onClick={handleAccept}
                  className="py-2 px-5 bg-white text-black text-xs font-semibold hover:bg-white/90 active:scale-[0.98] transition-all duration-150 cursor-pointer whitespace-nowrap"
                >
                  Accept all
                </button>
              </div>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
