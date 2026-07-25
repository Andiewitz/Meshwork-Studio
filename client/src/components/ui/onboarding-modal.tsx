import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MeshworkLogo } from "@/components/MeshworkLogo";
import { useAuth } from "@/hooks/use-auth";
import { secureFetch } from "@/lib/secure-fetch";
import { useQueryClient } from "@tanstack/react-query";

// eslint-disable-next-line no-secrets/no-secrets
const ONBOARDING_KEY = "meshwork_onboarding_complete";

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

const ROLES = [
  { id: "developer", label: "Developer" },
  { id: "devops", label: "DevOps / SRE" },
  { id: "architect", label: "Solutions Architect" },
  { id: "engineering-manager", label: "Engineering Manager" },
  { id: "designer", label: "Designer" },
  { id: "student", label: "Student" },
  { id: "other", label: "Other" },
];

const REFERRAL_SOURCES = [
  { id: "github", label: "GitHub" },
  { id: "twitter", label: "Twitter / X" },
  { id: "reddit", label: "Reddit" },
  { id: "search", label: "Google / Search" },
  { id: "friend", label: "Friend or colleague" },
  { id: "youtube", label: "YouTube" },
  { id: "other", label: "Other" },
];

const USE_CASES = [
  { id: "personal", label: "Personal projects" },
  { id: "work", label: "Work / Company" },
  { id: "learning", label: "Learning & education" },
  { id: "open-source", label: "Open source" },
];

export function OnboardingFlow() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [role, setRole] = useState("");
  const [source, setSource] = useState("");
  const [useCase, setUseCase] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const complete = async () => {
    setIsSaving(true);
    try {
      // Save name to server if changed
      if (firstName !== user?.firstName || lastName !== user?.lastName) {
        await secureFetch(`${API_BASE_URL}/api/user/profile`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firstName, lastName }),
        });
        // Update local cache
        queryClient.setQueryData(["/api/v1/auth/me"], (old: any) =>
          old ? { ...old, firstName, lastName } : old,
        );
      }

      // Save survey data locally
      localStorage.setItem(
        "meshwork_onboarding_data",
        JSON.stringify({
          role,
          source,
          useCase,
          completedAt: new Date().toISOString(),
        }),
      );
      localStorage.setItem(ONBOARDING_KEY, "true");

      // Auto-create workspace if prompt was submitted from landing page
      const pendingPrompt = localStorage.getItem("meshwork_pending_prompt");
      const pendingModel = localStorage.getItem("meshwork_pending_model");

      if (pendingPrompt) {
        try {
          const title =
            pendingPrompt
              .replace(/[^a-zA-Z0-9\s-_]/g, "")
              .trim()
              .slice(0, 16) || "AI Architecture";

          const res = await secureFetch(`${API_BASE_URL}/api/v1/workspaces`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title,
              description: pendingPrompt,
            }),
          });

          if (res.ok) {
            const ws = await res.json();
            localStorage.setItem("meshwork_auto_trigger_mosh", pendingPrompt);
            if (pendingModel) {
              localStorage.setItem("meshwork_auto_trigger_model", pendingModel);
            }
            localStorage.removeItem("meshwork_pending_prompt");
            localStorage.removeItem("meshwork_pending_model");

            window.dispatchEvent(new Event("onboarding-complete"));
            window.location.href = `/workspace/${ws.id}`;
            return;
          }
        } catch (err) {
          console.error(
            "Failed to create auto workspace after onboarding:",
            err,
          );
        }
      }
    } catch (err) {
      console.error("Failed to save onboarding data:", err);
      // Still mark as complete so user isn't stuck
      localStorage.setItem(ONBOARDING_KEY, "true");
    }
    setIsSaving(false);
    // Force re-render by triggering state change in parent
    window.dispatchEvent(new Event("onboarding-complete"));
  };

  const canProceed = () => {
    if (step === 0) return firstName.trim().length > 0;
    if (step === 1) return role !== "";
    if (step === 2) return source !== "";
    if (step === 3) return useCase !== "";
    return true;
  };

  const next = () => {
    if (step < 3) setStep(step + 1);
    else complete();
  };

  const steps = [
    // Step 0: Name
    <div key="name" className="space-y-6">
      <div>
        <h2
          className="text-xl font-semibold text-white mb-1"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          What should we call you?
        </h2>
        <p className="text-sm text-white/30">
          This is how you'll appear to your team.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-white/40 font-medium uppercase tracking-wider mb-1.5 block">
            First name
          </label>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Jane"
            autoFocus
            className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/15 focus:outline-none focus:border-primary/40 transition-colors"
          />
        </div>
        <div>
          <label className="text-[11px] text-white/40 font-medium uppercase tracking-wider mb-1.5 block">
            Last name
          </label>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Doe"
            className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/15 focus:outline-none focus:border-primary/40 transition-colors"
          />
        </div>
      </div>
    </div>,

    // Step 1: Role
    <div key="role" className="space-y-6">
      <div>
        <h2
          className="text-xl font-semibold text-white mb-1"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          What's your role?
        </h2>
        <p className="text-sm text-white/30">
          Help us personalize your experience.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {ROLES.map((r) => (
          <button
            key={r.id}
            onClick={() => setRole(r.id)}
            className={`text-left px-4 py-3 rounded-lg border text-sm transition-all ${
              role === r.id
                ? "border-primary/40 bg-primary/[0.06] text-white"
                : "border-white/[0.06] bg-white/[0.015] text-white/50 hover:border-white/[0.12] hover:text-white/70"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>,

    // Step 2: Referral source
    <div key="source" className="space-y-6">
      <div>
        <h2
          className="text-xl font-semibold text-white mb-1"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          How did you find us?
        </h2>
        <p className="text-sm text-white/30">
          We'd love to know how you discovered Meshwork.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {REFERRAL_SOURCES.map((s) => (
          <button
            key={s.id}
            onClick={() => setSource(s.id)}
            className={`text-left px-4 py-3 rounded-lg border text-sm transition-all ${
              source === s.id
                ? "border-primary/40 bg-primary/[0.06] text-white"
                : "border-white/[0.06] bg-white/[0.015] text-white/50 hover:border-white/[0.12] hover:text-white/70"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>,

    // Step 3: Use case
    <div key="usecase" className="space-y-6">
      <div>
        <h2
          className="text-xl font-semibold text-white mb-1"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          What will you use Meshwork for?
        </h2>
        <p className="text-sm text-white/30">
          This helps us build the right features for you.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {USE_CASES.map((u) => (
          <button
            key={u.id}
            onClick={() => setUseCase(u.id)}
            className={`text-left px-4 py-3 rounded-lg border text-sm transition-all ${
              useCase === u.id
                ? "border-primary/40 bg-primary/[0.06] text-white"
                : "border-white/[0.06] bg-white/[0.015] text-white/50 hover:border-white/[0.12] hover:text-white/70"
            }`}
          >
            {u.label}
          </button>
        ))}
      </div>
    </div>,
  ];

  return (
    <div className="fixed inset-0 z-[200] bg-[#0a0a0a] flex items-center justify-center">
      <div className="w-full max-w-md px-6">
        {/* Logo + progress */}
        <div className="flex items-center justify-between mb-10">
          <div className="w-8 h-8">
            <MeshworkLogo />
          </div>
          <div className="flex items-center gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i <= step ? "bg-primary w-6" : "bg-white/10 w-4"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {steps[step]}
          </motion.div>
        </AnimatePresence>

        {/* Footer */}
        <div className="flex items-center justify-between mt-8">
          <div>
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="text-xs text-white/30 hover:text-white/50 transition-colors"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                onClick={complete}
                className="text-xs text-white/20 hover:text-white/40 transition-colors"
              >
                Skip all
              </button>
            )}
            <button
              onClick={next}
              disabled={!canProceed() || isSaving}
              className="px-5 py-2.5 text-sm font-semibold bg-primary text-black rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {isSaving ? "Saving..." : step === 3 ? "Get started" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function useOnboardingComplete(
  user?: { createdAt?: Date | string | null } | null,
) {
  // If user has a pending prompt from landing page, onboarding must run first
  if (localStorage.getItem("meshwork_pending_prompt")) {
    localStorage.removeItem(ONBOARDING_KEY);
    return false;
  }

  // Already completed
  if (localStorage.getItem(ONBOARDING_KEY) === "true") return true;

  // Auto-skip for existing users whose accounts predate the onboarding feature.
  // Any account created before this cutoff is grandfathered in.
  const ONBOARDING_DEPLOY_DATE = new Date("2026-05-17T00:00:00Z");
  if (user?.createdAt) {
    const created = new Date(user.createdAt);
    if (created < ONBOARDING_DEPLOY_DATE) {
      localStorage.setItem(ONBOARDING_KEY, "true");
      return true;
    }
  }

  // Dev mock user — skip onboarding so the dashboard is usable in dev (unless pending prompt exists)
  if (import.meta.env.DEV && user) {
    localStorage.setItem(ONBOARDING_KEY, "true");
    return true;
  }

  return false;
}
