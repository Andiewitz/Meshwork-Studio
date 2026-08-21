import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowPathIcon,
  EyeIcon,
  EyeSlashIcon,
  ExclamationCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { MeshworkLogo } from "@/components/MeshworkLogo";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuthModal } from "./AuthModalContext";
import { refreshCsrfToken } from "@/lib/csrf-init";
import { PASSWORD_POLICY, validatePasswordStrength } from "@shared/auth";
import { motion, AnimatePresence } from "framer-motion";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import ReCAPTCHA from "react-google-recaptcha";

interface ApiErrorResponse {
  message?: string;
}

interface ApiLoginResponse {
  user: { email: string };
}

// ─────────────────────────────────────────────
// LOGIN FORM
// ─────────────────────────────────────────────
function LoginForm() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { close, switchMode } = useAuthModal();
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

  // Check for OAuth error in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err === "google") {
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
  }, []);

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
      const data: ApiLoginResponse & ApiErrorResponse =
        (await res.json()) as ApiLoginResponse & ApiErrorResponse;

      if (res.ok) {
        // Sync a fresh CSRF token with the new server session to prevent
        // stale-token 403s (e.g. after server restart wipes the CSRF secret)
        await refreshCsrfToken();
        toast({
          title: "Welcome back!",
          description: `Logged in as ${data.user.email}`,
        });
        queryClient.setQueryData(["/api/v1/auth/me"], data.user);
        close();
        setLocation("/home");
      } else {
        const errorMsg = data.message ?? "Invalid credentials";
        const lower = errorMsg.toLowerCase();
        if (lower.includes("email") || lower.includes("account")) {
          setFormErrors({ email: errorMsg });
        } else if (lower.includes("password")) {
          setFormErrors({ password: errorMsg });
        } else {
          setFormErrors({ general: errorMsg });
        }
      }
    } catch (err: unknown) {
      toast({
        title: "Login failed",
        description:
          err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
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

  const inputBase =
    "h-11 bg-black/40 border transition-all duration-200 rounded-xl px-4 text-white placeholder:text-white/20 text-sm";

  return (
    <div>
      {oauthError && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 mb-5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium flex items-start gap-2"
        >
          <ExclamationCircleIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          {oauthError}
        </motion.div>
      )}

      {formErrors.general && (
        <div className="p-3 mb-5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
          {formErrors.general}
        </div>
      )}

      {/* Social Login Options: GitHub, Google */}
      <div className="space-y-2.5 mb-5">
        <Button
          type="button"
          onClick={handleGithubLogin}
          variant="outline"
          className="w-full h-11 border border-white/10 bg-white/[0.02] hover:bg-white/[0.08] hover:text-white font-bold tracking-tight rounded-xl transition-all text-sm flex items-center justify-center gap-2"
        >
          <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
            />
          </svg>
          Sign in with GitHub
        </Button>
        <Button
          type="button"
          onClick={handleGoogleLogin}
          variant="outline"
          className="w-full h-11 border border-white/10 bg-white/[0.02] hover:bg-white/[0.08] hover:text-white font-bold tracking-tight rounded-xl transition-all text-sm flex items-center justify-center gap-2"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
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
          Sign in with Google
        </Button>
      </div>

      <div className="relative flex items-center justify-center mb-5">
        <span className="absolute w-full border-t border-white/10" />
        <span className="relative bg-[#111113] px-4 text-[10px] font-bold tracking-widest text-white/25 uppercase">
          or
        </span>
      </div>

      {/* 2-Step Email Login Form */}
      <form onSubmit={handleFormSubmit} className="space-y-4">
        {step === "email" ? (
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <Label
                htmlFor="login-email"
                className={`font-bold text-[10px] tracking-wider uppercase ${formErrors.email ? "text-red-400" : "text-white/60"}`}
              >
                Email
              </Label>
              {formErrors.email && (
                <span className="text-[10px] text-red-400 font-medium">
                  {formErrors.email}
                </span>
              )}
            </div>
            <Input
              id="login-email"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
              required
              className={`${inputBase} ${
                formErrors.email
                  ? "border-red-500 focus:border-red-400"
                  : touched.email && isEmailValid
                    ? "border-green-500/50 focus:border-green-500"
                    : touched.email && email.length > 0 && !isEmailValid
                      ? "border-red-400/50 focus:border-red-400"
                      : "border-white/10 focus:border-primary/50 focus:bg-black/60"
              }`}
            />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/10 text-xs">
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
              <div className="flex justify-between">
                <Label
                  htmlFor="login-password"
                  className={`font-bold text-[10px] tracking-wider uppercase ${formErrors.password ? "text-red-400" : "text-white/60"}`}
                >
                  Password
                </Label>
                {formErrors.password && (
                  <span className="text-[10px] text-red-400 font-medium">
                    {formErrors.password}
                  </span>
                )}
              </div>
              <div className="relative">
                <Input
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
                  className={`${inputBase} pr-10 ${
                    formErrors.password
                      ? "border-red-500 focus:border-red-400"
                      : touched.password && password.length > 0
                        ? "border-green-500/50 focus:border-green-500"
                        : "border-white/10 focus:border-primary/50 focus:bg-black/60"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
                >
                  {showPassword ? (
                    <EyeSlashIcon className="w-3.5 h-3.5" />
                  ) : (
                    <EyeIcon className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </>
        )}

        <Button
          type="submit"
          className="w-full h-11 bg-white text-black hover:bg-white/90 font-bold tracking-tight rounded-xl transition-all shadow-[0_0_20px_rgba(255,255,255,0.08)] text-sm"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" /> Signing
              in...
            </>
          ) : (
            "Sign In"
          )}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-xs font-medium tracking-tight text-white/40">
          Don't have an account?{" "}
          <button
            onClick={() => switchMode("register")}
            className="text-white hover:text-primary transition-colors underline underline-offset-4 cursor-pointer"
          >
            Register
          </button>
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// REGISTER FORM
// ─────────────────────────────────────────────
function RegisterForm() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { close, switchMode } = useAuthModal();
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
      const data: ApiErrorResponse | ApiLoginResponse = (await res.json()) as
        ApiErrorResponse | ApiLoginResponse;

      if (res.ok) {
        // Auto-login successful - prime auth cache and redirect to app
        if ("user" in data) {
          queryClient.setQueryData(["/api/v1/auth/me"], data.user);
        }
        toast({
          title: "Account created!",
          description: "Welcome to Meshwork.",
        });
        close();
        setLocation("/home");
      } else {
        // Error response - message is guaranteed to exist on ApiErrorResponse
        const errorMsg =
          (data as ApiErrorResponse).message ?? "Something went wrong";
        const lower = errorMsg.toLowerCase();
        if (lower.includes("email")) {
          setFormErrors({ email: errorMsg });
        } else if (lower.includes("password")) {
          setFormErrors({ password: errorMsg });
        } else {
          setFormErrors({ general: errorMsg });
        }
        if (recaptchaRef.current) recaptchaRef.current.reset();
        setCaptchaToken("");
      }
    } catch (err: unknown) {
      toast({
        title: "Registration failed",
        description:
          err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
      if (recaptchaRef.current) recaptchaRef.current.reset();
      setCaptchaToken("");
    } finally {
      setIsLoading(false);
    }
  };

  const inputBase =
    "h-11 bg-black/40 border transition-all duration-200 rounded-xl px-4 text-white placeholder:text-white/20 text-sm";

  return (
    <div>
      {formErrors.general && (
        <div className="p-3 mb-5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
          {formErrors.general}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label
              htmlFor="reg-firstName"
              className="font-bold text-[10px] tracking-wider text-white/60 uppercase"
            >
              First Name
            </Label>
            <Input
              id="reg-firstName"
              type="text"
              placeholder="John"
              value={formData.firstName}
              onChange={(e) =>
                setFormData({ ...formData, firstName: e.target.value })
              }
              className={`${inputBase} border-white/10 focus:border-primary/50 focus:bg-black/60`}
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="reg-lastName"
              className="font-bold text-[10px] tracking-wider text-white/60 uppercase"
            >
              Last Name
            </Label>
            <Input
              id="reg-lastName"
              type="text"
              placeholder="Doe"
              value={formData.lastName}
              onChange={(e) =>
                setFormData({ ...formData, lastName: e.target.value })
              }
              className={`${inputBase} border-white/10 focus:border-primary/50 focus:bg-black/60`}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between">
            <Label
              htmlFor="reg-email"
              className={`font-bold text-[10px] tracking-wider uppercase ${formErrors.email ? "text-red-400" : "text-white/60"}`}
            >
              Email *
            </Label>
            {formErrors.email && (
              <span className="text-[10px] text-red-400 font-medium">
                {formErrors.email}
              </span>
            )}
          </div>
          <Input
            id="reg-email"
            type="email"
            placeholder="you@example.com"
            value={formData.email}
            onChange={(e) =>
              setFormData({ ...formData, email: e.target.value })
            }
            onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
            required
            className={`${inputBase} ${
              formErrors.email
                ? "border-red-500 focus:border-red-400"
                : touched.email && isEmailValid
                  ? "border-green-500/50 focus:border-green-500"
                  : touched.email && formData.email.length > 0 && !isEmailValid
                    ? "border-red-400/50 focus:border-red-400"
                    : "border-white/10 focus:border-primary/50 focus:bg-black/60"
            }`}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between">
            <Label
              htmlFor="reg-password"
              className={`font-bold text-[10px] tracking-wider uppercase ${formErrors.password ? "text-red-400" : "text-white/60"}`}
            >
              Password *
            </Label>
            {formErrors.password && (
              <span className="text-[10px] text-red-400 font-medium">
                {formErrors.password}
              </span>
            )}
          </div>
          <div className="relative">
            <Input
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
              className={`${inputBase} pr-10 ${
                formErrors.password
                  ? "border-red-500 focus:border-red-400"
                  : touched.password && isPasswordValid
                    ? "border-green-500/50 focus:border-green-500"
                    : touched.password &&
                        formData.password.length > 0 &&
                        !isPasswordValid
                      ? "border-red-400/50 focus:border-red-400"
                      : "border-white/10 focus:border-primary/50 focus:bg-black/60"
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
            >
              {showPassword ? (
                <EyeSlashIcon className="w-3.5 h-3.5" />
              ) : (
                <EyeIcon className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* Password strength indicators */}
          <div className="mt-1.5 grid grid-cols-3 gap-x-2 gap-y-0.5">
            {[
              {
                check: formData.password.length >= PASSWORD_POLICY.minLength,
                label: `${PASSWORD_POLICY.minLength}+ chars`,
              },
              { check: /[A-Z]/.test(formData.password), label: "Uppercase" },
              { check: /[a-z]/.test(formData.password), label: "Lowercase" },
              { check: /\d/.test(formData.password), label: "Number" },
              {
                check: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(
                  formData.password,
                ),
                label: "Special",
              },
            ].map(({ check, label }) => (
              <div
                key={label}
                className={`flex items-center text-[9px] ${check ? "text-green-500" : "text-white/25"}`}
              >
                <div
                  className={`w-1 h-1 rounded-full mr-1.5 ${check ? "bg-green-500" : "bg-white/10"}`}
                />
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between">
            <Label
              htmlFor="reg-confirmPassword"
              className={`font-bold text-[10px] tracking-wider uppercase ${formErrors.confirmPassword ? "text-red-400" : "text-white/60"}`}
            >
              Confirm Password *
            </Label>
            {formErrors.confirmPassword && (
              <span className="text-[10px] text-red-400 font-medium">
                {formErrors.confirmPassword}
              </span>
            )}
          </div>
          <div className="relative">
            <Input
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
              className={`${inputBase} pr-10 ${
                formErrors.confirmPassword
                  ? "border-red-500 focus:border-red-400"
                  : touched.confirmPassword && isConfirmPasswordValid
                    ? "border-green-500/50 focus:border-green-500"
                    : touched.confirmPassword &&
                        formData.confirmPassword.length > 0 &&
                        !isConfirmPasswordValid
                      ? "border-red-400/50 focus:border-red-400"
                      : "border-white/10 focus:border-primary/50 focus:bg-black/60"
              }`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
            >
              {showConfirmPassword ? (
                <EyeSlashIcon className="w-3.5 h-3.5" />
              ) : (
                <EyeIcon className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
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

        <Button
          type="submit"
          className="w-full h-11 bg-white text-black hover:bg-white/90 font-bold tracking-tight rounded-xl transition-all shadow-[0_0_20px_rgba(255,255,255,0.08)] text-sm"
          disabled={
            isLoading ||
            (import.meta.env.PROD &&
              !!import.meta.env.VITE_RECAPTCHA_SITE_KEY &&
              !captchaToken)
          }
        >
          {isLoading ? (
            <>
              <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" /> Creating
              account...
            </>
          ) : (
            "Create Account"
          )}
        </Button>
      </form>

      <div className="mt-5 text-center">
        <p className="text-xs font-medium tracking-tight text-white/40">
          Already have an account?{" "}
          <button
            onClick={() => switchMode("login")}
            className="text-white hover:text-primary transition-colors underline underline-offset-4 cursor-pointer"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// AUTH MODAL
// ─────────────────────────────────────────────
export function AuthModal() {
  const { isOpen, mode, close } = useAuthModal();

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <AnimatePresence>
        {isOpen && (
          <DialogPrimitive.Portal forceMount>
            {/* Backdrop */}
            <DialogPrimitive.Overlay forceMount asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
              />
            </DialogPrimitive.Overlay>

            {/* Content */}
            <div className="fixed inset-0 z-[101] flex items-center justify-center pointer-events-none">
              <DialogPrimitive.Content forceMount asChild>
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="w-full max-w-[440px] max-h-[90vh] overflow-y-auto pointer-events-auto"
                >
                  <div className="relative bg-[#111113] border border-white/[0.08] rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.7)] p-7">
                    {/* Close button */}
                    <DialogPrimitive.Close className="absolute right-4 top-4 text-white/30 hover:text-white transition-colors rounded-full p-1 hover:bg-white/10">
                      <XMarkIcon className="w-4 h-4" />
                      <span className="sr-only">Close</span>
                    </DialogPrimitive.Close>

                    {/* Logo + Header */}
                    <div className="text-center mb-6">
                      <div className="w-10 h-10 mx-auto flex items-center justify-center bg-white/[0.05] border border-white/10 rounded-xl mb-4">
                        <MeshworkLogo />
                      </div>
                      <DialogPrimitive.Title className="text-2xl font-bold tracking-tight text-white mb-1">
                        {mode === "login" ? "Welcome Back" : "Create Account"}
                      </DialogPrimitive.Title>
                      <DialogPrimitive.Description className="text-white/40 text-sm font-medium tracking-tight">
                        {mode === "login"
                          ? "Log in to your workspace."
                          : "Set up your workspace."}
                      </DialogPrimitive.Description>
                    </div>

                    {/* Form content with animated switching */}
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={mode}
                        initial={{
                          opacity: 0,
                          x: mode === "register" ? 20 : -20,
                        }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: mode === "register" ? -20 : 20 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                      >
                        {mode === "login" ? <LoginForm /> : <RegisterForm />}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </motion.div>
              </DialogPrimitive.Content>
            </div>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
