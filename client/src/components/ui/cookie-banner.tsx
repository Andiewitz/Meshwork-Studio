import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import {
  ChevronDownIcon as ChevronDown,
  ChevronUpIcon as ChevronUp,
  CheckIcon as Check,
  AdjustmentsHorizontalIcon as Sliders,
} from "@heroicons/react/24/outline";

export const COOKIE_CONSENT_KEY = "meshwork_cookie_consent";
export const COOKIE_PREFERENCES_KEY = "meshwork_cookie_preferences";

export interface CookiePreferences {
  necessary: boolean;
  performance: boolean;
  analytics: boolean;
  personalization: boolean;
}

const DEFAULT_PREFERENCES: CookiePreferences = {
  necessary: true,
  performance: true,
  analytics: false,
  personalization: true,
};

export function CookieBanner() {
  const [show, setShow] = useState(false);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [preferences, setPreferences] =
    useState<CookiePreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    // Check if user has already made a consent choice
    const savedConsent = localStorage.getItem(COOKIE_CONSENT_KEY);
    const savedPrefs = localStorage.getItem(COOKIE_PREFERENCES_KEY);

    if (savedPrefs) {
      try {
        setPreferences(JSON.parse(savedPrefs));
      } catch {
        setPreferences(DEFAULT_PREFERENCES);
      }
    }

    if (!savedConsent) {
      const timer = setTimeout(() => setShow(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  // Listen for programmatic open requests (e.g. from Privacy Policy page or Footer)
  useEffect(() => {
    const handleOpenPreferences = () => {
      const savedPrefs = localStorage.getItem(COOKIE_PREFERENCES_KEY);
      if (savedPrefs) {
        try {
          setPreferences(JSON.parse(savedPrefs));
        } catch {
          // keep current
        }
      }
      setIsCustomizing(true);
      setShow(true);
    };

    window.addEventListener(
      "meshwork:open-cookie-preferences",
      handleOpenPreferences,
    );
    return () => {
      window.removeEventListener(
        "meshwork:open-cookie-preferences",
        handleOpenPreferences,
      );
    };
  }, []);

  const saveConsent = (
    status: "accepted" | "essential_only" | "customized",
    prefs: CookiePreferences,
  ) => {
    localStorage.setItem(COOKIE_CONSENT_KEY, status);
    localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify(prefs));
    window.dispatchEvent(
      new CustomEvent("meshwork:consent-updated", {
        detail: { status, preferences: prefs },
      }),
    );
    setShow(false);
    setIsCustomizing(false);
  };

  const handleAcceptAll = () => {
    const allEnabled: CookiePreferences = {
      necessary: true,
      performance: true,
      analytics: true,
      personalization: true,
    };
    setPreferences(allEnabled);
    saveConsent("accepted", allEnabled);
  };

  const handleEssentialOnly = () => {
    const essentialOnly: CookiePreferences = {
      necessary: true,
      performance: false,
      analytics: false,
      personalization: false,
    };
    setPreferences(essentialOnly);
    saveConsent("essential_only", essentialOnly);
  };

  const handleSaveCustom = () => {
    saveConsent("customized", preferences);
  };

  const toggleCategory = (category: keyof CookiePreferences) => {
    if (category === "necessary") return; // cannot disable necessary
    setPreferences((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.aside
          initial={{ opacity: 0, y: "100%" }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: "100%" }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-0 left-0 right-0 z-50 pointer-events-auto rounded-none"
          aria-label="Cookie and Privacy Consent Banner"
          role="dialog"
          aria-modal="false"
        >
          {/* Main Square Banner Container with Sharp Edges */}
          <div className="w-full bg-surface/95 backdrop-blur-2xl border-t border-border shadow-[0_-10px_35px_rgba(0,0,0,0.9)] rounded-none text-foreground">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
              {/* Header & Status Indicator */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-border">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-none bg-emerald-400 shrink-0 inline-block" />
                  <span className="text-xs font-mono font-bold tracking-widest uppercase text-foreground/90">
                    Cookie &amp; Privacy Preferences
                  </span>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 border border-border text-muted-foreground rounded-none bg-foreground/[0.04]">
                    GDPR / CCPA Compliant
                  </span>
                </div>

                <div className="text-xs text-muted-foreground font-mono flex items-center gap-3">
                  <span>
                    Review our{" "}
                    <Link
                      href="/privacy"
                      className="text-foreground underline underline-offset-4 decoration-white/40 hover:decoration-white font-medium transition-colors"
                    >
                      Privacy Policy
                    </Link>
                  </span>
                  <span className="text-muted-foreground">|</span>
                  <span>
                    <Link
                      href="/terms"
                      className="text-foreground underline underline-offset-4 decoration-white/40 hover:decoration-white font-medium transition-colors"
                    >
                      Terms of Service
                    </Link>
                  </span>
                </div>
              </div>

              {/* Notice Body */}
              <div className="py-3">
                <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground font-sans">
                  Meshwork Studio uses essential cookies and browser storage to
                  maintain secure authentication tokens and cache your workspace
                  diagrams. With your permission, we also collect diagnostics
                  and telemetry to optimize node canvas render performance. We
                  never sell your personal data or track you across third-party
                  websites.
                </p>
              </div>

              {/* Expandable "Customize your.." Section */}
              <AnimatePresence>
                {isCustomizing && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="overflow-hidden border-t border-border my-3 pt-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-mono font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                          <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                          Customize your tracking permissions
                        </h4>
                        <span className="text-[11px] font-mono text-zinc-400">
                          Toggle categories below to choose what you allow us to
                          track:
                        </span>
                      </div>

                      {/* 4 Granular Tracking Categories (All rounded-none) */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        {/* 1. Strictly Necessary (Locked) */}
                        <div className="p-3.5 bg-foreground/[0.03] border border-border rounded-none flex items-start justify-between gap-3">
                          <div className="space-y-1 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-foreground uppercase font-mono tracking-wide">
                                1. Strictly Necessary
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-none uppercase">
                                Always Required
                              </span>
                            </div>
                            <p className="text-[11.5px] leading-relaxed text-zinc-400">
                              Authentication cookies, CSRF protection, and local
                              canvas save state. Essential for the workspace to
                              operate.
                            </p>
                          </div>
                          <div className="shrink-0 pt-0.5">
                            <div className="w-5 h-5 bg-emerald-400/20 border border-emerald-400 flex items-center justify-center rounded-none text-emerald-400 cursor-not-allowed">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                          </div>
                        </div>

                        {/* 2. Canvas Performance & Diagnostics */}
                        <div
                          onClick={() => toggleCategory("performance")}
                          className="p-3.5 bg-foreground/[0.03] border border-border hover:border-border rounded-none flex items-start justify-between gap-3 cursor-pointer transition-colors"
                        >
                          <div className="space-y-1 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-foreground uppercase font-mono tracking-wide">
                                2. Canvas Performance
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-none uppercase">
                                Diagnostics
                              </span>
                            </div>
                            <p className="text-[11.5px] leading-relaxed text-zinc-400">
                              Frame rate benchmarks, node rendering latency, and
                              error diagnostics to maintain fluid 60fps canvas
                              interactions.
                            </p>
                          </div>
                          <div className="shrink-0 pt-0.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCategory("performance");
                              }}
                              className={`w-5 h-5 border flex items-center justify-center rounded-none transition-colors ${
                                preferences.performance
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-transparent border-border hover:border-border"
                              }`}
                              aria-label="Toggle Canvas Performance"
                            >
                              {preferences.performance && (
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* 3. Product & Feature Analytics */}
                        <div
                          onClick={() => toggleCategory("analytics")}
                          className="p-3.5 bg-foreground/[0.03] border border-border hover:border-border rounded-none flex items-start justify-between gap-3 cursor-pointer transition-colors"
                        >
                          <div className="space-y-1 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-foreground uppercase font-mono tracking-wide">
                                3. Feature Analytics
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-none uppercase">
                                Telemetry
                              </span>
                            </div>
                            <p className="text-[11.5px] leading-relaxed text-zinc-400">
                              Anonymous telemetry regarding template selection,
                              tool frequency, and export formats to guide
                              feature development.
                            </p>
                          </div>
                          <div className="shrink-0 pt-0.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCategory("analytics");
                              }}
                              className={`w-5 h-5 border flex items-center justify-center rounded-none transition-colors ${
                                preferences.analytics
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-transparent border-border hover:border-border"
                              }`}
                              aria-label="Toggle Feature Analytics"
                            >
                              {preferences.analytics && (
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* 4. Personalization & Layout State */}
                        <div
                          onClick={() => toggleCategory("personalization")}
                          className="p-3.5 bg-foreground/[0.03] border border-border hover:border-border rounded-none flex items-start justify-between gap-3 cursor-pointer transition-colors"
                        >
                          <div className="space-y-1 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-foreground uppercase font-mono tracking-wide">
                                4. Personalization
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-none uppercase">
                                UI State
                              </span>
                            </div>
                            <p className="text-[11.5px] leading-relaxed text-zinc-400">
                              Remembers your custom grid snapping, zoom levels,
                              minimap visibility, and panel layouts between
                              visits.
                            </p>
                          </div>
                          <div className="shrink-0 pt-0.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCategory("personalization");
                              }}
                              className={`w-5 h-5 border flex items-center justify-center rounded-none transition-colors ${
                                preferences.personalization
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-transparent border-border hover:border-border"
                              }`}
                              aria-label="Toggle Personalization"
                            >
                              {preferences.personalization && (
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action Buttons Bar — All strictly rounded-none */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-border">
                {/* "Customize your.." toggle button */}
                <button
                  type="button"
                  onClick={() => setIsCustomizing((prev) => !prev)}
                  className="px-4 py-2.5 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground bg-foreground/[0.05] hover:bg-foreground/[0.1] border border-border rounded-none flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                  <span>
                    {isCustomizing
                      ? "Hide preferences"
                      : "Customize your preferences..."}
                  </span>
                  {isCustomizing ? (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </button>

                {/* Main Consent Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 justify-end">
                  {isCustomizing && (
                    <button
                      type="button"
                      onClick={handleSaveCustom}
                      className="px-5 py-2.5 bg-primary text-primary-foreground border border-primary hover:brightness-110 active:brightness-90 text-xs font-mono font-bold uppercase tracking-wider rounded-none transition-all cursor-pointer shadow-md"
                    >
                      Save my preferences
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleEssentialOnly}
                    className="px-4 py-2.5 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground bg-transparent hover:bg-foreground/5 border border-border rounded-none transition-colors cursor-pointer"
                  >
                    Essential only
                  </button>

                  <button
                    type="button"
                    onClick={handleAcceptAll}
                    className="px-5 py-2.5 bg-white text-zinc-950 hover:bg-zinc-100 active:bg-zinc-200 text-xs font-mono font-bold uppercase tracking-wider rounded-none transition-all cursor-pointer shadow-lg"
                  >
                    Accept all
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
