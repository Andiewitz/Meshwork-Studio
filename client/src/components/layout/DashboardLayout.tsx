import { ReactNode, useState, useRef, useEffect, Suspense } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Package,
  Users,
  Settings,
  HelpCircle,
  Bell,
  LogOut,
  X,
  ArrowUpRight,
  Newspaper,
  Search,
  Crown,
  ChevronRight,
  Star,
  Clock,
  FolderKanban,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { MeshworkLogo } from "@/components/MeshworkLogo";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import {
  OnboardingFlow,
  useOnboardingComplete,
} from "@/components/ui/onboarding-modal";

const sidebarVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0 },
};

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, logout, updatePreferences } = useAuth();
  const { data: workspaces } = useWorkspaces();
  const [location] = useLocation();

  const isOverview = location === "/home";
  const isProjects = location === "/workspaces";
  const isDev = location === "/dev";
  const isTeam = location === "/team";

  const rawIds = user?.readNotificationIds;
  const readIds: number[] = Array.isArray(rawIds) ? (rawIds as number[]) : [];
  const isUnread = !readIds.includes(1);

  const [panelOpen, setPanelOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isRinging, setIsRinging] = useState(false);
  const [isNotifying, setIsNotifying] = useState(false);
  const [flyStart, setFlyStart] = useState({ x: 0, y: 0 });
  const [flyTarget, setFlyTarget] = useState({ x: 0, y: 0 });
  const [teamOpen, setTeamOpen] = useState(true);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const bellRef = useRef<HTMLButtonElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
      }
    };
    if (profileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [profileOpen]);

  // Onboarding gate
  const [onboardingComplete, setOnboardingComplete] = useState(() =>
    useOnboardingComplete(user),
  );
  useEffect(() => {
    const handler = () => setOnboardingComplete(true);
    window.addEventListener("onboarding-complete", handler);
    return () => window.removeEventListener("onboarding-complete", handler);
  }, []);

  const dismiss = () => updatePreferences({ readNotificationIds: [1] });

  useEffect(() => {
    const handler = () => {
      if (isNotifying || user?.hasNotifiedTeam) return;
      setFlyStart({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      const r = bellRef.current?.getBoundingClientRect();
      setFlyTarget(
        r
          ? { x: r.left + r.width / 2, y: r.top + r.height / 2 }
          : { x: window.innerWidth - 100, y: 40 },
      );
      setIsNotifying(true);
      setTimeout(() => setIsRinging(true), 800);
      setTimeout(() => setIsRinging(false), 1200);
      setTimeout(() => setIsNotifying(false), 1000);
    };
    window.addEventListener("trigger-fly-notification", handler);
    return () =>
      window.removeEventListener("trigger-fly-notification", handler);
  }, [isNotifying, user?.hasNotifiedTeam]);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 2,
    });
    const raf = (t: number) => {
      lenis.raf(t);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
    return () => lenis.destroy();
  }, []);

  const userName = user?.firstName || user?.email?.split("@")[0] || "User";
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <div className="bg-surface text-on-surface font-body selection:bg-primary/30 selection:text-primary min-h-screen antialiased flex cursor-figma">
      {/* ── Left sidebar (240px) ── */}
      <motion.aside
        initial="hidden"
        animate="visible"
        variants={sidebarVariants}
        className="fixed left-0 top-0 h-full w-60 z-50 flex flex-col border-r border-white/[0.05] bg-black/40 backdrop-blur-xl"
      >
        {/* Logo row */}
        <motion.div
          variants={itemVariants}
          className="flex items-center gap-2.5 px-4 py-3.5 border-b border-white/[0.05]"
        >
          <MeshworkLogo className="text-white w-6 h-6 shrink-0" />
          <span
            className="text-[13px] font-semibold text-white truncate flex-1"
            style={{ fontFamily: "var(--font-headline)" }}
          >
            Meshwork Studio
          </span>
          <span className="text-[9px] font-bold tracking-[0.15em] uppercase text-white/30 border border-white/10 px-1.5 py-0.5 rounded-full shrink-0">
            Beta
          </span>
        </motion.div>

        {/* Search */}
        <div className="px-3 pt-2.5 pb-1">
          <div className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 group focus-within:border-primary/40 transition-colors">
            <Search className="h-3.5 w-3.5 text-white/30 shrink-0 group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="Search"
              className="bg-transparent text-xs text-white outline-none placeholder:text-white/30 w-full"
            />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-1 hide-scrollbar">
          {/* Top nav items */}
          <div className="space-y-0.5">
            {(
              [
                ["/home", isOverview, LayoutDashboard, "Overview"],
                ["/workspaces", isProjects, Package, "Workspaces"],
                ["/dev", isDev, Newspaper, "Blog"],
                ["/team", isTeam, Users, "Team"],
              ] as const
            ).map(([href, active, Icon, label]) => (
              <Link href={href} key={href}>
                <motion.button
                  variants={itemVariants}
                  title={label}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-300 cursor-figma-pointer ${
                    active
                      ? "bg-white/[0.06] text-white"
                      : "text-white/30 hover:bg-white/[0.04] hover:text-white/70"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${active ? "text-primary drop-shadow-[0_0_6px_rgba(255,102,0,0.4)]" : ""}`}
                  />
                  <span>{label}</span>
                  {active && (
                    <span className="ml-auto w-1 h-1 rounded-full bg-primary shadow-[0_0_6px_rgba(255,102,0,0.6)]" />
                  )}
                </motion.button>
              </Link>
            ))}
          </div>

          {/* Workspace section */}
          <div className="mt-5">
            <button
              onClick={() => setTeamOpen(!teamOpen)}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-white/30 hover:text-white/60 transition-colors"
            >
              <ChevronRight
                className={`h-3 w-3 shrink-0 transition-transform duration-200 ${teamOpen ? "rotate-90" : ""}`}
              />
              <span className="truncate">
                {user?.firstName
                  ? `${user.firstName}'s workspace`
                  : "My Workspace"}
              </span>
              <span className="ml-auto shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                Free
              </span>
            </button>
            {teamOpen && (
              <div className="ml-3 space-y-0.5 border-l border-white/[0.05] pl-3 mt-0.5">
                {(
                  [
                    [Clock, "Recents", "/home"],
                    [FolderKanban, "All workspaces", "/workspaces"],
                    [Trash2, "Trash", "/home"],
                  ] as const
                ).map(([Icon, label, href]) => (
                  <Link href={href} key={label}>
                    <button className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs text-white/30 transition-colors hover:bg-white/[0.04] hover:text-white/60 cursor-figma-pointer">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{label}</span>
                    </button>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recent workspaces */}
          {workspaces && workspaces.length > 0 && (
            <div className="mt-5">
              <p className="mb-1 px-2.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white/20">
                Recent
              </p>
              <div className="space-y-0.5">
                {workspaces
                  .filter(
                    (ws) =>
                      !sidebarSearch ||
                      ws.title
                        .toLowerCase()
                        .includes(sidebarSearch.toLowerCase()),
                  )
                  .slice(0, 5)
                  .map((ws) => (
                    <Link href={`/workspace/${ws.id}`} key={ws.id}>
                      <button className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs text-white/30 transition-colors hover:bg-white/[0.04] hover:text-white/60 cursor-figma-pointer">
                        <FolderKanban className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{ws.title}</span>
                      </button>
                    </Link>
                  ))}
              </div>
            </div>
          )}

          {/* Starred */}
          <div className="mt-5">
            <button className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-white/30 hover:text-white/60 transition-colors">
              <ChevronRight className="h-3 w-3 shrink-0" />
              <Star className="h-3 w-3 shrink-0" />
              <span>Starred</span>
            </button>
          </div>
        </nav>

        {/* Bottom section */}
        <div className="flex flex-col gap-2 p-3 border-t border-white/[0.05]">
          {/* Upgrade banner */}
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="mb-2 flex items-center gap-2">
              <Crown className="h-4 w-4 text-white/30" />
              <span className="text-[11px] font-medium text-white/70">
                Upgrade for premium
              </span>
            </div>
            <button className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors cursor-figma-pointer active:scale-95">
              View plans
            </button>
          </div>

          {/* Profile row */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen((v) => !v)}
              className="w-full flex items-center gap-2.5 rounded-md px-2.5 py-1.5 hover:bg-white/[0.04] transition-colors cursor-figma-pointer"
            >
              <div className="w-6 h-6 rounded-full overflow-hidden bg-white/[0.06] border border-white/10 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                {user?.profileImageUrl ? (
                  <img
                    alt=""
                    className="w-full h-full object-cover"
                    src={user.profileImageUrl}
                  />
                ) : (
                  userInitial
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-medium text-white truncate">
                  {userName}
                </p>
                <p className="text-[10px] text-white/30 truncate">
                  {user?.email}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a
                  href="https://github.com/Andiewitz/Meshwork-Studio_"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title="Help"
                  className="text-white/20 hover:text-white/60 transition-colors p-0.5"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </a>
              </div>
            </button>

            <AnimatePresence>
              {profileOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full left-0 right-0 mb-1 bg-[#141414] border border-white/[0.06] rounded-xl overflow-hidden shadow-2xl z-50"
                >
                  <div className="px-3 py-2.5 border-b border-white/[0.05]">
                    <p className="text-[13px] font-semibold text-white truncate">
                      {userName}
                    </p>
                    <p className="text-[10px] text-white/40 truncate">
                      {user?.email}
                    </p>
                  </div>
                  <div className="py-1">
                    <Link
                      href="/settings"
                      onClick={() => setProfileOpen(false)}
                    >
                      <button className="w-full text-left px-3 py-2 text-xs text-white/60 hover:text-white hover:bg-white/[0.05] flex items-center gap-2.5 transition-colors cursor-figma-pointer">
                        <Settings className="w-3.5 h-3.5" /> Settings
                      </button>
                    </Link>
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        logout();
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-red-400/70 hover:text-red-400 hover:bg-white/[0.05] flex items-center gap-2.5 transition-colors cursor-figma-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" /> Logout
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.aside>

      {/* ── Top bar ── */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="fixed top-0 left-60 right-0 z-40 bg-black/40 backdrop-blur-xl flex justify-between items-center px-6 py-3 border-b border-white/[0.05] h-12"
      >
        <div className="flex items-center gap-3">
          <h1
            className="text-[15px] font-bold tracking-tight text-white"
            style={{ fontFamily: "var(--font-headline)" }}
          >
            {isOverview
              ? "Overview"
              : isProjects
                ? "Workspaces"
                : isDev
                  ? "Blog"
                  : isTeam
                    ? "Team"
                    : "Meshwork Studio"}
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {/* Bell */}
          <motion.button
            ref={bellRef}
            onClick={() => setPanelOpen((v) => !v)}
            animate={
              isRinging ? { rotate: [0, -18, 18, -18, 18, 0] } : { rotate: 0 }
            }
            transition={{ duration: 0.4 }}
            className={`relative w-8 h-8 flex items-center justify-center transition-all ${panelOpen || isRinging ? "text-primary scale-110" : "text-white/30 hover:text-white/80"}`}
          >
            <Bell className="w-4 h-4" />
            {isUnread && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_10px_rgba(255,102,0,0.8)]" />
            )}
          </motion.button>
        </div>
      </motion.header>

      {/* ── Notification side panel ── */}
      <AnimatePresence>
        {panelOpen && (
          <>
            <motion.div
              key="bd"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setPanelOpen(false)}
              className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px]"
            />
            <motion.aside
              key="panel"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="fixed top-0 right-0 h-full w-[380px] z-[70] bg-[#0e0e0e]/95 backdrop-blur-2xl border-l border-white/[0.06] flex flex-col shadow-[-20px_0_40px_rgba(0,0,0,0.6)]"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05]">
                <div className="flex items-center gap-2.5">
                  <span
                    className="text-sm font-semibold text-white"
                    style={{ fontFamily: "var(--font-sans)" }}
                  >
                    Notifications
                  </span>
                  {isUnread && (
                    <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center">
                      1
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {isUnread && (
                    <button
                      onClick={dismiss}
                      className="text-[11px] text-white/30 hover:text-white/60 transition-colors px-2 py-1 rounded hover:bg-white/[0.04]"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setPanelOpen(false)}
                    className="w-7 h-7 flex items-center justify-center rounded-md text-white/20 hover:text-white/60 hover:bg-white/[0.05] transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div
                  className={`px-5 py-4 border-b border-white/[0.04] transition-colors ${isUnread ? "bg-white/[0.015]" : ""}`}
                >
                  <div className="flex gap-3">
                    <div className="pt-0.5 shrink-0">
                      {isUnread ? (
                        <div className="w-2 h-2 rounded-full bg-primary mt-1" />
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-white/10 mt-1" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className="text-xs font-semibold text-white/70"
                          style={{ fontFamily: "var(--font-sans)" }}
                        >
                          Welcome to Meshwork Studio
                        </span>
                        <span className="text-[10px] text-white/20 shrink-0 ml-3">
                          Today
                        </span>
                      </div>
                      <p className="text-[12px] leading-relaxed text-white/35 mb-3">
                        This is an early beta. The core canvas is functional —
                        design architectures, nest services inside containers,
                        and keep everything organized across workspaces.
                      </p>
                      <a
                        href="https://github.com/Andiewitz/Meshwork-Studio_"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[11px] text-primary/70 hover:text-primary transition-colors"
                      >
                        <svg
                          className="w-3 h-3"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                        </svg>
                        Star on GitHub
                        <ArrowUpRight className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-5 py-3 border-t border-white/[0.04]">
                <p
                  className="text-[10px] text-white/15 text-center"
                  style={{ fontFamily: "var(--font-sans)" }}
                >
                  Meshwork Studio · Open Source
                </p>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Flying bell animation */}
      <AnimatePresence>
        {isNotifying && (
          <motion.div
            initial={{
              x: flyStart.x - 12,
              y: flyStart.y - 12,
              scale: 1,
              opacity: 1,
            }}
            animate={{
              x: flyTarget.x - 12,
              y: flyTarget.y - 12,
              scale: 0.2,
              opacity: [1, 1, 0],
            }}
            transition={{
              duration: 0.8,
              ease: "easeInOut",
              times: [0, 0.8, 1],
            }}
            className="fixed z-[100] pointer-events-none text-primary"
          >
            <Bell className="w-6 h-6 fill-current" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="pl-60 pt-12 min-h-screen technical-gradient w-full">
        <div className={`w-full h-full ${isDev ? "" : ""}`}>
          <Suspense
            fallback={
              <div className="flex flex-col items-center justify-center h-[60vh] gap-6">
                <div className="w-8 h-8">
                  <MeshworkLogo />
                </div>
                <div className="w-24 h-[2px] bg-white/[0.06] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    initial={{ x: "-100%" }}
                    animate={{ x: "100%" }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                </div>
              </div>
            }
          >
            {children}
          </Suspense>
        </div>
      </main>

      {/* Onboarding — blocks entire layout until complete */}
      {!onboardingComplete && <OnboardingFlow />}
    </div>
  );
}
