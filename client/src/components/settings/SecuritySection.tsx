import { useCallback, useEffect, useState } from "react";
import "./security-section.css";
import { useAuth } from "@/hooks/use-auth";
import { authClient } from "@/auth/auth-client";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowPathIcon as Loader2,
  CheckCircleIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";

interface DeviceSession {
  id: string;
  fullHash: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
}

function deviceLabel(ua: string | null): string {
  if (!ua) return "Unknown device";
  if (/iphone|android.*mobile/i.test(ua)) return "Mobile browser";
  if (/ipad|tablet/i.test(ua)) return "Tablet";
  if (/macintosh|mac os/i.test(ua)) return "Mac";
  if (/windows/i.test(ua)) return "Windows PC";
  if (/linux/i.test(ua)) return "Linux device";
  return "Browser";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function SecuritySection() {
  const { user, logout, notifyLoginSuccess } = useAuth();
  const { toast } = useToast();

  // ── Password change ───────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  // ── MFA ───────────────────────────────────────────────────────────────
  const mfaEnabled = Boolean(user?.mfaEnabled);
  const [enrollData, setEnrollData] = useState<{
    secret: string;
    otpauthUri: string;
  } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);

  // ── Devices ───────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  const refreshSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      setSessions(await authClient.listSessions());
    } catch {
      setSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  const handleChangePassword = async () => {
    setChangingPw(true);
    try {
      const result = await authClient.changePassword(
        currentPassword,
        newPassword,
      );
      if (result.requiresLogin) {
        toast({
          title: "Password updated",
          description: "Please sign in again with your new password.",
        });
        await logout();
        return;
      }
      toast({ title: "Password updated", variant: "success" });
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      toast({
        title: "Could not change password",
        description:
          err instanceof Error ? err.message : "Check your current password.",
        variant: "destructive",
      });
    } finally {
      setChangingPw(false);
    }
  };

  const startEnroll = async () => {
    setMfaBusy(true);
    try {
      setEnrollData(await authClient.mfaEnroll());
    } catch (err) {
      toast({
        title: "Enrollment failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setMfaBusy(false);
    }
  };

  const confirmActivate = async () => {
    setMfaBusy(true);
    try {
      const res = await authClient.mfaActivate(mfaCode.replace(/\s/g, ""));
      setBackupCodes(res.backupCodes ?? null);
      setEnrollData(null);
      setMfaCode("");
      // Refresh profile flags.
      const me = await fetch("/api/v1/auth/me", { credentials: "include" });
      if (me.ok) {
        notifyLoginSuccess(await me.json(), new Date().toISOString());
      }
      toast({ title: "Two-factor authentication enabled", variant: "success" });
    } catch (err) {
      toast({
        title: "Activation failed",
        description: err instanceof Error ? err.message : "Try the next code.",
        variant: "destructive",
      });
    } finally {
      setMfaBusy(false);
    }
  };

  const disableMfa = async () => {
    setMfaBusy(true);
    try {
      await authClient.mfaDisable(disablePassword, {});
      setDisablePassword("");
      toast({
        title: "Two-factor authentication disabled",
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Could not disable MFA",
        description: err instanceof Error ? err.message : "Password required.",
        variant: "destructive",
      });
    } finally {
      setMfaBusy(false);
    }
  };

  const revokeDevice = async (fullHash: string) => {
    try {
      await authClient.revokeSession(fullHash);
      await refreshSessions();
      toast({ title: "Session revoked", variant: "success" });
    } catch {
      toast({
        title: "Revoke failed",
        description: "The session may already be gone.",
        variant: "destructive",
      });
    }
  };

  const card = "bg-card border border-border rounded-2xl p-5";
  const label = "text-[11px] font-medium text-muted-foreground";
  const inputCls =
    "w-full h-10 px-3.5 rounded-lg bg-surface-high border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring transition-colors";

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <div>
        <h1 className="text-2xl font-bold font-headline text-foreground mb-1">
          Security & devices
        </h1>
        <p className="text-xs text-muted-foreground">
          Manage your password, two-factor authentication and signed-in devices.
        </p>
      </div>

      {/* Password */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-foreground mb-4">Password</h3>
        <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
          <input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputCls}
            autoComplete="current-password"
          />
          <input
            type="password"
            placeholder="New password (min 8 chars)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputCls}
            autoComplete="new-password"
          />
        </div>
        <button
          disabled={changingPw || !currentPassword || newPassword.length < 8}
          onClick={() => void handleChangePassword()}
          className="mt-4 h-9 px-4 rounded-lg bg-foreground text-background text-xs font-semibold hover:opacity-90 transition-all disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
        >
          {changingPw ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "Update password (signs out all devices)"
          )}
        </button>
      </div>

      {/* MFA */}
      <div className={card}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ShieldCheckIcon className="w-4 h-4" />
            Two-factor authentication
          </h3>
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              mfaEnabled
                ? "security-status-enabled"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {mfaEnabled ? "Enabled" : "Disabled"}
          </span>
        </div>

        {backupCodes && (
          <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-[11px] security-warning font-medium mb-2">
              Save these backup codes now — shown only once:
            </p>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 font-mono text-xs text-foreground/80">
              {backupCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          </div>
        )}

        {!mfaEnabled && !enrollData && (
          <>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-lg">
              Require a rotating 6-digit code from an authenticator app when
              signing in. Drastically reduces the impact of a leaked password.
            </p>
            <button
              onClick={() => void startEnroll()}
              disabled={mfaBusy}
              className="mt-3 h-9 px-4 rounded-lg border border-border text-foreground text-xs font-semibold hover:bg-surface-high transition-all cursor-pointer disabled:opacity-60"
            >
              {mfaBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Set up authenticator app"
              )}
            </button>
          </>
        )}

        {enrollData && (
          <div className="space-y-3 max-w-md">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Add this secret to your authenticator app (Google Authenticator,
              1Password, Authy), then enter the current code:
            </p>
            <code className="block select-all break-all p-3 rounded-lg bg-surface-high border border-border text-[11px] text-foreground">
              {enrollData.secret}
            </code>
            <a
              href={enrollData.otpauthUri}
              className="block text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2 break-all"
            >
              Open in authenticator app
            </a>
            <div className="flex gap-2">
              <input
                inputMode="numeric"
                placeholder="123456"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                className={`${inputCls} tracking-[0.3em] w-40`}
              />
              <button
                onClick={() => void confirmActivate()}
                disabled={mfaBusy || mfaCode.length !== 6}
                className="h-10 px-4 rounded-lg bg-foreground text-background text-xs font-semibold hover:opacity-90 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
              >
                {mfaBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Activate"
                )}
              </button>
            </div>
          </div>
        )}

        {mfaEnabled && (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <p className={label + " mb-1"}>Confirm password to disable</p>
              <input
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                className={inputCls + " w-56"}
                autoComplete="current-password"
              />
            </div>
            <button
              onClick={() => void disableMfa()}
              disabled={mfaBusy || !disablePassword}
              className="h-10 px-4 rounded-lg border border-red-400/30 text-red-400 text-xs font-semibold hover:bg-red-500/10 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
            >
              Disable 2FA
            </button>
          </div>
        )}
      </div>

      {/* Devices */}
      <div className={card}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">
            Signed-in devices
          </h3>
          <button
            onClick={() => void refreshSessions()}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Refresh
          </button>
        </div>
        {loadingSessions ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No active sessions found.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {sessions.map((s) => (
              <li key={s.fullHash} className="py-3 flex items-center gap-3">
                {/mobile|android|iphone/i.test(s.userAgent || "") ? (
                  <DevicePhoneMobileIcon className="w-5 h-5 text-muted-foreground shrink-0" />
                ) : (
                  <ComputerDesktopIcon className="w-5 h-5 text-muted-foreground shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-foreground font-medium flex items-center gap-2">
                    {deviceLabel(s.userAgent)}
                    {s.current && (
                      <span className="inline-flex items-center gap-1 text-[10px] security-success">
                        <CheckCircleIcon className="w-3 h-3" /> this device
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    Last active {timeAgo(s.lastSeenAt)}
                    {s.userAgent ? ` · ${s.userAgent.slice(0, 60)}` : ""}
                  </p>
                </div>
                {!s.current && (
                  <button
                    onClick={() => void revokeDevice(s.fullHash)}
                    className="text-[11px] text-red-400/80 hover:text-red-300 transition-colors cursor-pointer shrink-0"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
