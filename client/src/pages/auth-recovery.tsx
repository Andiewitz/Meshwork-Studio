import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowPathIcon as Loader2,
  CheckCircleIcon,
  ExclamationTriangleIcon as AlertCircle,
} from "@heroicons/react/24/outline";
import { MeshworkLogo } from "@/components/MeshworkLogo";
import { authClient } from "@/auth/auth-client";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";

const inputBase =
  "w-full h-10 px-3.5 rounded-lg bg-foreground/[0.04] border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-border transition-colors";

function AuthShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
      <Helmet>
        <title>{title} — Meshwork</title>
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-sm"
      >
        <div className="flex justify-center mb-8">
          <a href="/" aria-label="Meshwork home">
            <MeshworkLogo />
          </a>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

export function ForgotPasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await authClient.forgotPassword(email);
      setSent(true);
    } catch (err) {
      toast({
        title: "Request failed",
        description:
          err instanceof Error ? err.message : "Please try again shortly.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell title="Check your email">
        <div className="text-center space-y-3">
          <CheckCircleIcon className="w-10 h-10 mx-auto text-green-500" />
          <h1 className="text-lg font-semibold text-foreground">
            Check your email
          </h1>
          <p className="text-xs text-muted-foreground leading-relaxed">
            If an account exists for {email}, we sent a reset link. It expires
            in 30 minutes.
          </p>
          <button
            onClick={() => setLocation("/login")}
            className="mt-4 text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 cursor-pointer"
          >
            Back to sign in
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset password">
      <div className="mb-6 text-center">
        <h1 className="text-lg font-semibold text-foreground">
          Reset your password
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          We'll email you a secure reset link.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="space-y-1.5">
          <Label
            htmlFor="forgot-email"
            className="text-[11px] text-muted-foreground"
          >
            Email
          </Label>
          <input
            id="forgot-email"
            type="email"
            required
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputBase}
          />
        </div>
        <button
          type="submit"
          disabled={isLoading || !email}
          className="w-full h-10 rounded-lg bg-primary text-destructive-foreground text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin mx-auto" />
          ) : (
            "Send reset link"
          )}
        </button>
      </form>
      <p className="mt-5 text-center text-[12px] text-muted-foreground">
        <a
          href="/login"
          className="text-muted-foreground hover:text-foreground underline underline-offset-4"
        >
          Back to sign in
        </a>
      </p>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  const valid =
    token.length > 0 && password.length >= 8 && password === confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await authClient.resetPassword(token, password);
      setDone(true);
      toast({
        title: "Password updated",
        description: "All other sessions were signed out.",
      });
      setTimeout(() => setLocation("/login"), 1800);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Reset failed — link may have expired.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!token && !done) {
    return (
      <AuthShell title="Invalid link">
        <div className="text-center space-y-3">
          <AlertCircle className="w-10 h-10 mx-auto text-red-400" />
          <p className="text-xs text-muted-foreground">
            This reset link is invalid or incomplete.
          </p>
          <a
            href="/forgot-password"
            className="inline-block mt-2 text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            Request a new link
          </a>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password">
      <div className="mb-6 text-center">
        <h1 className="text-lg font-semibold text-foreground">
          Choose a new password
        </h1>
      </div>
      {done ? (
        <p className="text-center text-xs text-green-400">
          Password updated. Redirecting to sign in…
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {(error || !token) && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              {error || "Missing reset token."}
            </div>
          )}
          <input type="hidden" name="token" value={token} />
          <div className="space-y-1.5">
            <Label
              htmlFor="new-password"
              className="text-[11px] text-muted-foreground"
            >
              New password
            </Label>
            <input
              id="new-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className={inputBase}
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="confirm-password"
              className="text-[11px] text-muted-foreground"
            >
              Confirm password
            </Label>
            <input
              id="confirm-password"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={`${inputBase} ${confirm && confirm !== password ? "border-red-400/40" : ""}`}
            />
          </div>
          <button
            type="submit"
            disabled={!valid || isLoading}
            className="w-full h-10 rounded-lg bg-primary text-destructive-foreground text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin mx-auto" />
            ) : (
              "Update password"
            )}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

export function VerifyEmailPage() {
  const [, setLocation] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("This verification link is missing its token.");
      return;
    }
    authClient
      .verifyEmail(token)
      .then(() => setState("ok"))
      .catch((err: unknown) => {
        setState("error");
        setMessage(
          err instanceof Error
            ? err.message
            : "Verification failed — the link may have expired.",
        );
      });
  }, [token]);

  return (
    <AuthShell title="Verify email">
      <div className="text-center space-y-3">
        {state === "working" && (
          <>
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Verifying your email…
            </p>
          </>
        )}
        {state === "ok" && (
          <>
            <CheckCircleIcon className="w-10 h-10 mx-auto text-green-500" />
            <h1 className="text-lg font-semibold text-foreground">
              Email verified
            </h1>
            <button
              onClick={() => setLocation("/login")}
              className="mt-2 inline-block h-9 px-5 rounded-lg bg-primary text-destructive-foreground text-xs font-semibold hover:brightness-110 cursor-pointer"
            >
              Sign in to your account
            </button>
          </>
        )}
        {state === "error" && (
          <>
            <AlertCircle className="w-10 h-10 mx-auto text-red-400" />
            <p className="text-xs text-muted-foreground">{message}</p>
            <button
              onClick={() => setLocation("/login")}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 cursor-pointer"
            >
              Back to sign in
            </button>
          </>
        )}
      </div>
    </AuthShell>
  );
}
