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
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-3 left-3 right-3 sm:bottom-6 sm:left-auto sm:right-6 sm:max-w-lg z-50 pointer-events-auto"
          aria-label="Cookie consent"
        >
          <div className="bg-zinc-950/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl p-4 sm:p-5">
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <h4 className="text-xs font-semibold text-white tracking-wide uppercase font-mono">
                    Privacy & Storage Notice
                  </h4>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-zinc-400 font-sans">
                We store essential secure session tokens and local workspace
                preferences to keep you signed in and preserve your diagram
                state. We do not use third-party advertising or tracking
                cookies. Learn more in our{" "}
                <Link
                  href="/privacy"
                  className="text-white underline underline-offset-2 decoration-white/40 hover:decoration-white font-medium transition-colors"
                >
                  Privacy Policy
                </Link>{" "}
                and{" "}
                <Link
                  href="/terms"
                  className="text-white underline underline-offset-2 decoration-white/40 hover:decoration-white font-medium transition-colors"
                >
                  Terms of Service
                </Link>
                .
              </p>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleDecline}
                  className="px-3.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  Essential only
                </button>
                <button
                  type="button"
                  onClick={handleAccept}
                  className="px-4 py-1.5 bg-white text-zinc-950 rounded-lg text-xs font-semibold hover:bg-zinc-100 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap shadow-sm"
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
