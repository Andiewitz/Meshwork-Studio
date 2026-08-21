import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowPathIcon as Loader2,
  EyeIcon as Eye,
  EyeSlashIcon as EyeOff,
  ExclamationTriangleIcon as AlertCircle,
} from "@heroicons/react/24/outline";
import { MeshworkLogo } from "@/components/MeshworkLogo";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatUserErrorMessage } from "@/lib/error-utils";
import { refreshCsrfToken } from "@/lib/csrf-init";
import { PASSWORD_POLICY, validatePasswordStrength } from "@shared/auth";
import { motion, AnimatePresence } from "framer-motion";
import { Helmet } from "react-helmet-async";
import ReCAPTCHA from "react-google-recaptcha";

interface ApiLoginResponse {
  user: { email: string };
}

async function handlePendingPromptAndRedirect(
  setLocation: (path: string) => void,
) {
  const pendingPrompt = localStorage.getItem("meshwork_pending_prompt");
  const pendingModel = localStorage.getItem("meshwork_pending_model");
  if (pendingPrompt) {
    try {
      const { secureFetch } = await import("@/lib/secure-fetch");
      const cleanTitle =
        pendingPrompt
          .replace(/[^a-zA-Z0-9\s-_]/g, "")
          .trim()
          .slice(0, 16) || "AI Architecture";
      const res = await secureFetch("/api/v1/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: cleanTitle, description: pendingPrompt }),
      });
      if (res.ok) {
        const ws = await res.json();
        localStorage.setItem("meshwork_auto_trigger_mosh", pendingPrompt);
        if (pendingModel)
          localStorage.setItem("meshwork_auto_trigger_model", pendingModel);
        localStorage.removeItem("meshwork_pending_prompt");
        localStorage.removeItem("meshwork_pending_model");
        localStorage.setItem("meshwork_onboarding_complete", "true");
        window.location.href = `/workspace/${ws.id}`;
        return;
      }
    } catch (err) {
      console.error("Failed to auto-create workspace on auth:", err);
    }
  }
  setLocation("/home");
}

const inputBase =
  "h-11 w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3.5 text-white placeholder:text-white/25 text-sm focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/25 transition-all duration-150";

function GithubIcon() {
  return (
    <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function SocialButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full h-10 flex items-center justify-center gap-2.5 rounded-lg border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.07] text-white/80 text-sm font-medium transition-all duration-150 cursor-pointer"
    >
      {icon}
      {label}
    </button>
  );
}

function LoginForm() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<"email" | "password">("email");
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [formErrors, setFormErrors] = useState<{
    email?: string;
    password?: string;
    general?: string;
  }>({});
  const [oauthError, setOauthError] = useState<string | null>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reason = params.get("reason");
    const err = params.get("error");

    if (reason === "session_expired") {
      setOauthError(
        "Your session has expired. Please sign in again to continue.",
      );
      toast({
        title: "Session Expired",
        description:
          "Your security session has expired. Please sign in again to continue.",
        variant: "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (err === "google") {
      setOauthError(
        "Google sign-in failed. Your account may not be linked, or access was denied.",
      );
      window.history.replaceState({}, "", window.location.pathname);
    } else if (err === "google_not_configured") {
      setOauthError(
        "Google sign-in is not configured on this server. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file.",
      );
      window.history.replaceState({}, "", window.location.pathname);
    } else if (err === "github") {
      setOauthError(
        "GitHub sign-in failed. Your account may not be linked, or access was denied.",
      );
      window.history.replaceState({}, "", window.location.pathname);
    } else if (err === "github_not_configured") {
      setOauthError(
        "GitHub sign-in is not configured on this server. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in your .env file.",
      );
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast]);

  useEffect(() => {
    if (step === "password") {
      setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 50);
    }
  }, [step]);

  const isEmailValid =
    email.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});

    if (step === "email") {
      setTouched((prev) => ({ ...prev, email: true }));
      if (!isEmailValid) {
        setFormErrors({ email: "Please enter a valid email address." });
        return;
      }
      setStep("password");
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/v1/auth/login", {
        email,
        password,
      });
      const data = (await res.json()) as ApiLoginResponse;
      // Sync a fresh CSRF token with the new server session to prevent
      // stale-token 403s (e.g. after server restart wipes the CSRF secret)
      await refreshCsrfToken();
      toast({
        title: "Welcome back!",
        description: `Logged in as ${data.user.email}`,
      });
      queryClient.setQueryData(["/api/v1/auth/me"], data.user);
      await handlePendingPromptAndRedirect(setLocation);
    } catch (err: unknown) {
      const userMessage = formatUserErrorMessage(
        err,
        "Invalid credentials. Please check your email and password.",
      );
      setFormErrors({ general: userMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGithubLogin = () => {
    window.location.href = "/api/v1/auth/github";
  };

  const handleGoogleLogin = () => {
    window.location.href = "/api/v1/auth/google";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="w-full"
    >
      {(oauthError || formErrors.general) && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium flex items-start gap-2"
        >
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {oauthError || formErrors.general}
        </motion.div>
      )}
      <div className="space-y-2.5 mb-5">
        <SocialButton
          icon={<GithubIcon />}
          label="Continue with GitHub"
          onClick={handleGithubLogin}
        />
        <SocialButton
          icon={<GoogleIcon />}
          label="Continue with Google"
          onClick={handleGoogleLogin}
        />
      </div>
      <div className="relative flex items-center justify-center mb-5">
        <span className="absolute w-full border-t border-white/[0.08]" />
        <span className="relative bg-[#111113] px-3 text-[11px] text-white/25 tracking-widest uppercase">
          or
        </span>
      </div>
      <form onSubmit={handleFormSubmit} className="space-y-3.5">
        {step === "email" ? (
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <Label
                htmlFor="login-email"
                className="text-[11px] font-medium text-white/50"
              >
                Email
              </Label>
              {formErrors.email && (
                <span className="text-[10px] text-red-400 font-medium">
                  {formErrors.email}
                </span>
              )}
            </div>
            <input
              id="login-email"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
              required
              className={`${inputBase} ${touched.email && !isEmailValid && email.length > 0 ? "border-red-400/40" : touched.email && isEmailValid ? "border-green-500/30" : ""}`}
            />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.04] border border-white/[0.1] text-xs">
              <div className="flex items-center gap-2 truncate">
                <span className="text-white/40">Email:</span>
                <span className="text-white font-medium truncate">{email}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setPassword("");
                  setFormErrors({});
                }}
                className="text-xs text-white/60 hover:text-white underline underline-offset-2 shrink-0 cursor-pointer"
              >
                Edit
              </button>
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="login-password"
                className="text-[11px] font-medium text-white/50"
              >
                Password
              </Label>
              <div className="relative">
                <input
                  ref={passwordInputRef}
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() =>
                    setTouched((prev) => ({ ...prev, password: true }))
                  }
                  required
                  className={`${inputBase} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </>
        )}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full h-10 mt-1 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 active:bg-white/80 transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Signing in...
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>
      <p className="mt-5 text-center text-[12px] text-white/35">
        {"Don't have an account? "}
        <a
          href="/register"
          className="text-white/60 hover:text-white underline underline-offset-4 transition-colors"
        >
          Create your account
        </a>
      </p>
    </motion.div>
  );
}

function RegisterForm() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formErrors, setFormErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
    general?: string;
  }>({});
  const [touched, setTouched] = useState({
    email: false,
    password: false,
    confirmPassword: false,
  });

  const isEmailValid =
    formData.email.length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email);
  const passwordValidation = validatePasswordStrength(formData.password);
  const isPasswordValid = passwordValidation.valid;
  const isConfirmPasswordValid =
    formData.confirmPassword.length > 0 &&
    formData.password === formData.confirmPassword;

  const handleGoogleLogin = () => {
    window.location.href = "/api/v1/auth/google";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    if (formData.password !== formData.confirmPassword) {
      setFormErrors({ confirmPassword: "Passwords do not match." });
      return;
    }
    if (!isPasswordValid) {
      setFormErrors({
        password: passwordValidation.errors[0] || "Please check your password.",
      });
      return;
    }
    if (
      import.meta.env.PROD &&
      import.meta.env.VITE_RECAPTCHA_SITE_KEY &&
      !captchaToken
    ) {
      toast({
        title: "Verification required",
        description: "Please complete the CAPTCHA check.",
        variant: "destructive",
      });
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/v1/auth/register", {
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        captchaToken: captchaToken || "dev_bypass_token",
      });
      const data = (await res.json()) as ApiLoginResponse;
      toast({ title: "Account created!", description: "Welcome to Meshwork." });
      queryClient.setQueryData(["/api/v1/auth/me"], data.user);
      await handlePendingPromptAndRedirect(setLocation);
    } catch (err: unknown) {
      const userMessage = formatUserErrorMessage(
        err,
        "Registration failed. Please try again.",
      );
      setFormErrors({ general: userMessage });
      if (recaptchaRef.current) recaptchaRef.current.reset();
      setCaptchaToken("");
    } finally {
      setIsLoading(false);
    }
  };

  const strengthChecks = [
    {
      check: formData.password.length >= PASSWORD_POLICY.minLength,
      label: `${PASSWORD_POLICY.minLength}+`,
    },
    { check: /[A-Z]/.test(formData.password), label: "A-Z" },
    { check: /[a-z]/.test(formData.password), label: "a-z" },
    { check: /\d/.test(formData.password), label: "0-9" },
    {
      check: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(formData.password),
      label: "#@!",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="w-full"
    >
      {formErrors.general && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium flex items-start gap-2"
        >
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {formErrors.general}
        </motion.div>
      )}
      <div className="space-y-2.5 mb-5">
        <SocialButton
          icon={<GoogleIcon />}
          label="Continue with Google"
          onClick={handleGoogleLogin}
        />
      </div>
      <div className="relative flex items-center justify-center mb-5">
        <span className="absolute w-full border-t border-white/[0.08]" />
        <span className="relative bg-[#111113] px-3 text-[11px] text-white/25 tracking-widest uppercase">
          or
        </span>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label
              htmlFor="reg-firstName"
              className="text-[11px] font-medium text-white/50"
            >
              First name
            </Label>
            <input
              id="reg-firstName"
              type="text"
              placeholder="John"
              value={formData.firstName}
              onChange={(e) =>
                setFormData({ ...formData, firstName: e.target.value })
              }
              className={inputBase}
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="reg-lastName"
              className="text-[11px] font-medium text-white/50"
            >
              Last name
            </Label>
            <input
              id="reg-lastName"
              type="text"
              placeholder="Doe"
              value={formData.lastName}
              onChange={(e) =>
                setFormData({ ...formData, lastName: e.target.value })
              }
              className={inputBase}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="reg-email"
            className="text-[11px] font-medium text-white/50"
          >
            Email
          </Label>
          <input
            id="reg-email"
            type="email"
            placeholder="you@example.com"
            value={formData.email}
            onChange={(e) =>
              setFormData({ ...formData, email: e.target.value })
            }
            onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
            required
            className={`${inputBase} ${formErrors.email ? "border-red-400/40" : touched.email && isEmailValid ? "border-green-500/30" : touched.email && formData.email.length > 0 && !isEmailValid ? "border-red-400/40" : ""}`}
          />
          {formErrors.email && (
            <p className="text-[11px] text-red-400">{formErrors.email}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="reg-password"
            className="text-[11px] font-medium text-white/50"
          >
            Password
          </Label>
          <div className="relative">
            <input
              id="reg-password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
              required
              minLength={PASSWORD_POLICY.minLength}
              className={`${inputBase} pr-10 ${formErrors.password ? "border-red-400/40" : touched.password && isPasswordValid ? "border-green-500/30" : touched.password && formData.password.length > 0 && !isPasswordValid ? "border-red-400/40" : ""}`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors cursor-pointer"
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
          {formErrors.password && (
            <p className="text-[11px] text-red-400">{formErrors.password}</p>
          )}
          <div className="flex gap-1.5 mt-1">
            {strengthChecks.map(({ check, label }) => (
              <div key={label} className="flex items-center gap-1 text-[10px]">
                <div
                  className={`w-1 h-1 rounded-full transition-colors ${check ? "bg-green-400" : "bg-white/15"}`}
                />
                <span className={check ? "text-green-400/60" : "text-white/20"}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="reg-confirmPassword"
            className="text-[11px] font-medium text-white/50"
          >
            Confirm password
          </Label>
          <div className="relative">
            <input
              id="reg-confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={(e) =>
                setFormData({ ...formData, confirmPassword: e.target.value })
              }
              onBlur={() =>
                setTouched((prev) => ({ ...prev, confirmPassword: true }))
              }
              required
              className={`${inputBase} pr-10 ${formErrors.confirmPassword ? "border-red-400/40" : touched.confirmPassword && isConfirmPasswordValid ? "border-green-500/30" : touched.confirmPassword && formData.confirmPassword.length > 0 && !isConfirmPasswordValid ? "border-red-400/40" : ""}`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors cursor-pointer"
            >
              {showConfirmPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
          {formErrors.confirmPassword && (
            <p className="text-[11px] text-red-400">
              {formErrors.confirmPassword}
            </p>
          )}
        </div>
        {import.meta.env.VITE_RECAPTCHA_SITE_KEY && (
          <div className="flex justify-center py-1 w-full overflow-hidden">
            <ReCAPTCHA
              ref={recaptchaRef}
              sitekey={
                (import.meta.env.VITE_RECAPTCHA_SITE_KEY as
                  string | undefined) ?? ""
              }
              onChange={(token: string | null) => setCaptchaToken(token ?? "")}
              onExpired={() => setCaptchaToken("")}
              theme="dark"
              size="compact"
            />
          </div>
        )}
        <button
          type="submit"
          disabled={
            isLoading ||
            (import.meta.env.PROD &&
              !!import.meta.env.VITE_RECAPTCHA_SITE_KEY &&
              !captchaToken)
          }
          className="w-full h-10 mt-1 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 active:bg-white/80 transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </button>
      </form>
      <p className="mt-5 text-center text-[12px] text-white/35">
        {"Already have an account? "}
        <a
          href="/login"
          className="text-white/60 hover:text-white underline underline-offset-4 transition-colors"
        >
          Sign in
        </a>
      </p>
    </motion.div>
  );
}

export default function AuthPage() {
  const [location] = useLocation();
  const mode = location.startsWith("/register") ? "register" : "login";

  return (
    <>
      <Helmet>
        <title>
          {mode === "login" ? "Sign In" : "Create Account"} — Meshwork Studio
        </title>
      </Helmet>
      <div className="min-h-screen flex bg-[#111113]">
        {/* Left: form panel */}
        <div className="w-full lg:w-1/2 flex flex-col justify-between p-8 sm:p-12 relative min-h-screen">
          {/* Header / Logo — Top Left */}
          <div className="w-full flex justify-start">
            <a href="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 flex items-center justify-center transition-all group-hover:drop-shadow-[0_0_14px_rgba(232,57,26,0.7)]">
                <MeshworkLogo />
              </div>
              <span className="text-[17px] font-bold text-white/90 tracking-tight group-hover:text-white transition-colors leading-none">
                Meshwork Studio
              </span>
            </a>
          </div>

          {/* Form area — Centered */}
          <div className="w-full max-w-[360px] mx-auto my-auto py-8">
            <AnimatePresence mode="wait">
              {mode === "login" ? (
                <motion.div
                  key="login-shell"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <h1 className="text-[24px] font-bold text-white tracking-tight mb-1">
                    Log in
                  </h1>
                  <p className="text-[13px] text-white/35 mb-7">
                    Welcome back to Meshwork Studio.
                  </p>
                  <LoginForm key="login" />
                </motion.div>
              ) : (
                <motion.div
                  key="register-shell"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <h1 className="text-[24px] font-bold text-white tracking-tight mb-1">
                    Create your account
                  </h1>
                  <p className="text-[13px] text-white/35 mb-7">
                    Start designing cloud architecture for free.
                  </p>
                  <RegisterForm key="register" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="w-full max-w-[360px] mx-auto pb-2 flex items-center justify-between text-[11px] text-white/20">
            <a href="/" className="hover:text-white/40 transition-colors">
              ← Back to home
            </a>
            <span>© {new Date().getFullYear()} Meshwork Studio</span>
          </div>
        </div>

        {/* Right: animated gradient panel */}
        <div className="hidden lg:block lg:w-1/2 relative overflow-hidden">
          <div className="absolute inset-0 bg-[#0d0f1a]" />
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 2.4, ease: [0.16, 1, 0.3, 1] }}
            className="absolute -top-[20%] -left-[10%] w-[75%] h-[75%] rounded-full"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(30,64,175,0.85) 0%, rgba(49,46,129,0.6) 45%, transparent 75%)",
              filter: "blur(60px)",
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 2.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            className="absolute top-[15%] left-[10%] w-[85%] h-[70%] rounded-full"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(109,40,217,0.55) 0%, rgba(139,92,246,0.3) 40%, transparent 70%)",
              filter: "blur(70px)",
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 3.0, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            className="absolute -bottom-[15%] right-[0%] w-[80%] h-[70%] rounded-full"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(236,72,153,0.75) 0%, rgba(192,38,211,0.5) 35%, rgba(124,58,237,0.25) 65%, transparent 80%)",
              filter: "blur(55px)",
            }}
          />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 3.2, ease: "easeOut", delay: 0.4 }}
            className="absolute bottom-[5%] left-[-5%] w-[50%] h-[40%] rounded-full"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(59,130,246,0.4) 0%, transparent 70%)",
              filter: "blur(60px)",
            }}
          />
        </div>
      </div>
    </>
  );
}
