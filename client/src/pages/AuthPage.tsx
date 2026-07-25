import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Eye,
  EyeOff,
  AlertCircle,
  Network,
  FileCode2,
  GitBranch,
  Shield,
} from "lucide-react";
import { MeshworkLogo } from "@/components/MeshworkLogo";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PASSWORD_POLICY, validatePasswordStrength } from "@shared/auth";
import { motion, AnimatePresence } from "framer-motion";
import { Helmet } from "react-helmet-async";
import ReCAPTCHA from "react-google-recaptcha";

interface ApiErrorResponse {
  message?: string;
}

interface ApiLoginResponse {
  user: { email: string };
}

const features = [
  {
    icon: Network,
    label: "Visual Cloud Architecture",
    desc: "Drag-and-drop canvas for designing infrastructure",
  },
  {
    icon: GitBranch,
    label: "Auto-sync & Deploy",
    desc: "Push changes directly to your cloud providers",
  },
  {
    icon: FileCode2,
    label: "Infrastructure as Code",
    desc: "Export to Terraform, CDK, Pulumi & more",
  },
  {
    icon: Shield,
    label: "Local-first & Private",
    desc: "Your data stays on your machine",
  },
];

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
        body: JSON.stringify({
          title: cleanTitle,
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

function LoginForm() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
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
    }
  }, []);

  const isEmailValid =
    email.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isPasswordValid = password.length >= 12;

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFormErrors({});

    try {
      const res = await apiRequest("POST", "/api/v1/auth/login", {
        email,
        password,
      });
      const data: ApiLoginResponse & ApiErrorResponse =
        (await res.json()) as ApiLoginResponse & ApiErrorResponse;

      if (res.ok) {
        toast({
          title: "Welcome back!",
          description: `Logged in as ${data.user.email}`,
        });
        queryClient.setQueryData(["/api/v1/auth/me"], data.user);
        await handlePendingPromptAndRedirect(setLocation);
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

  const handleGoogleLogin = () => {
    window.location.href = "/api/v1/auth/google";
  };

  const inputBase =
    "h-11 bg-black/40 border transition-all duration-200 rounded-xl px-4 text-white placeholder:text-white/20 text-sm";

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
    >
      {oauthError && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 mb-5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium flex items-start gap-2"
        >
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          {oauthError}
        </motion.div>
      )}

      {formErrors.general && (
        <div className="p-3 mb-5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
          {formErrors.general}
        </div>
      )}

      <form onSubmit={handleEmailLogin} className="space-y-4">
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
              id="login-password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
              required
              className={`${inputBase} pr-10 ${
                formErrors.password
                  ? "border-red-500 focus:border-red-400"
                  : touched.password && isPasswordValid
                    ? "border-green-500/50 focus:border-green-500"
                    : touched.password &&
                        password.length > 0 &&
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
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          className="w-full h-11 bg-white text-black hover:bg-white/90 font-bold tracking-tight rounded-xl transition-all shadow-[0_0_20px_rgba(255,255,255,0.08)] text-sm"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...
            </>
          ) : (
            "Sign In"
          )}
        </Button>
      </form>

      <div className="mt-6">
        <div className="relative flex items-center justify-center mb-5">
          <span className="absolute w-full border-t border-white/10" />
          <span className="relative bg-[#111113] px-4 text-[10px] font-bold tracking-widest text-white/25 uppercase">
            or
          </span>
        </div>

        <Button
          onClick={handleGoogleLogin}
          variant="outline"
          className="w-full h-11 border border-white/10 bg-white/[0.02] hover:bg-white/[0.08] hover:text-white font-bold tracking-tight rounded-xl transition-all text-sm"
        >
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none">
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
          </svg>{" "}
          Sign in with Google
        </Button>
      </div>

      <div className="mt-6 text-center">
        <p className="text-xs font-medium tracking-tight text-white/40">
          Don't have an account?{" "}
          <a
            href="/register"
            className="text-white hover:text-primary transition-colors underline underline-offset-4 cursor-pointer"
          >
            Register
          </a>
        </p>
      </div>
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
      const data = (await res.json()) as ApiErrorResponse & ApiLoginResponse;

      if (res.ok) {
        toast({
          title: "Account created!",
          description: "Welcome to Meshwork.",
        });
        queryClient.setQueryData(["/api/v1/auth/me"], data.user);
        await handlePendingPromptAndRedirect(setLocation);
      } else {
        const errorMsg = data.message ?? "Something went wrong";
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
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
    >
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
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

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
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
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
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating
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
          <a
            href="/login"
            className="text-white hover:text-primary transition-colors underline underline-offset-4 cursor-pointer"
          >
            Sign in
          </a>
        </p>
      </div>
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
      <div className="min-h-screen bg-background flex">
        {/* Left Panel — Branding */}
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-[#0a0a0c] border-r border-white/[0.05] flex-col justify-center px-16 py-12">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-[15%] left-[10%] w-[50%] h-[50%] rounded-full bg-primary/8 blur-[150px]" />
            <div className="absolute top-[35%] right-[5%] w-[35%] h-[45%] rounded-full bg-purple-500/6 blur-[120px]" />
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,85,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,85,0,0.1) 1px, transparent 1px)",
                backgroundSize: "80px 80px",
              }}
            />
          </div>

          <div className="relative z-10">
            <a href="/" className="flex items-center gap-3 mb-10 group">
              <div className="w-11 h-11 flex items-center justify-center transition-all group-hover:drop-shadow-[0_0_12px_rgba(255,61,0,0.5)]">
                <MeshworkLogo />
              </div>
              <span className="text-2xl font-bold tracking-tight text-white">
                Meshwork Studio
              </span>
            </a>

            <h2 className="text-[2rem] font-medium text-white leading-tight mb-4 tracking-tight">
              Design, visualize, and auto-sync your cloud architecture
            </h2>
            <p className="text-white/45 text-lg mb-14 max-w-md leading-relaxed">
              The open-source, local-first canvas for visualizing cloud
              infrastructure.
            </p>

            <div className="space-y-6">
              {features.map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">{label}</p>
                    <p className="text-white/40 text-sm">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 mt-auto pt-16">
            <p className="text-white/20 text-xs">
              &copy; {new Date().getFullYear()} Meshwork Studio. Open source.
            </p>
          </div>
        </div>

        {/* Right Panel — Auth Form */}
        <div className="flex-1 flex items-center justify-center p-6 relative">
          <div className="absolute inset-0 pointer-events-none lg:hidden">
            <div className="absolute top-[10%] left-[50%] -translate-x-1/2 w-[60%] h-[30%] rounded-full bg-primary/10 blur-[120px]" />
          </div>

          <div className="w-full max-w-[440px] relative z-10">
            {/* Mobile logo */}
            <div className="lg:hidden flex flex-col items-center mb-8">
              <a href="/" className="flex items-center gap-2.5 mb-6">
                <div className="w-8 h-8 flex items-center justify-center">
                  <MeshworkLogo />
                </div>
                <span className="text-lg font-bold text-white">
                  Meshwork Studio
                </span>
              </a>
            </div>

            {/* Form Card */}
            <div className="bg-[#111113] border border-white/[0.08] rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.7)] p-7">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-white mb-1">
                  {mode === "login" ? "Welcome Back" : "Create Account"}
                </h1>
                <p className="text-white/40 text-sm font-medium tracking-tight">
                  {mode === "login"
                    ? "Log in to your workspace."
                    : "Set up your workspace."}
                </p>
              </div>

              <AnimatePresence mode="wait">
                {mode === "login" ? (
                  <LoginForm key="login" />
                ) : (
                  <RegisterForm key="register" />
                )}
              </AnimatePresence>
            </div>

            {/* Back to home */}
            <div className="mt-6 text-center">
              <a
                href="/"
                className="text-xs font-medium text-white/30 hover:text-white/60 transition-colors"
              >
                &larr; Back to home
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
