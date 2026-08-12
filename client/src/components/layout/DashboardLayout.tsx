import { ReactNode, useState, useRef, useEffect, Suspense } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Squares2X2Icon as LayoutDashboard,
  CubeIcon as Package,
  UserGroupIcon as Users,
  Cog6ToothIcon as Settings,
  QuestionMarkCircleIcon as HelpCircle,
  ArrowRightStartOnRectangleIcon as LogOut,
  MagnifyingGlassIcon as Search,
  StarIcon as Star,
  FolderIcon as FolderKanban,
  PlusIcon as Plus,
  NewspaperIcon as Newspaper,
  ChevronDownIcon as ChevronDown,
  SparklesIcon as Sparkles,
  GiftIcon as Gift,
  CommandLineIcon as Terminal,
  ShareIcon as Share,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { MeshworkLogo } from "@/components/MeshworkLogo";
import { AnimatedSpinner } from "@/components/ui/animated-spinner";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import {
  OnboardingFlow,
  useOnboardingComplete,
} from "@/components/ui/onboarding-modal";
import { MobileGate } from "@/components/ui/mobile-gate";
import { PageErrorBoundary } from "@/components/ui/page-error-boundary";
import { preloadRoute } from "@/App";

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { data: workspaces } = useWorkspaces();
  const [location] = useLocation();

  const isOverview = location === "/home";
  const isProjects = location === "/workspaces";
  const isDev = location === "/dev";
  const isTeam = location === "/team";

  const [isMobile, setIsMobile] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
      }
    };
    if (profileOpen) document.addEventListener("mousedown", handleClickOutside);
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

  if (isMobile) return <MobileGate />;

  return (
    <div className="bg-[#09090b] text-white font-body selection:bg-white/20 selection:text-white min-h-screen antialiased flex p-2.5 gap-2.5 cursor-figma">
      {/* ── Sidebar (240px / w-60) ── */}
      <aside className="w-60 shrink-0 flex flex-col justify-between h-[calc(100vh-20px)] sticky top-2.5 z-50 select-none">
        <div className="flex flex-col flex-1 overflow-y-auto space-y-4 pr-1 hide-scrollbar">
          {/* Logo & Workspace Dropdown Header */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-2 py-1">
              <div className="w-5 h-5 flex items-center justify-center shrink-0">
                <MeshworkLogo />
              </div>
            </div>

            {/* Workspace Selector Pill */}
            <div className="w-full flex items-center justify-between gap-2 p-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-white/15 transition-all">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                  {userInitial}
                </div>
                <span className="text-[12.5px] font-semibold text-white/90 truncate">
                  {userName}&apos;s Studio
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-white/40 shrink-0" />
            </div>
          </div>

          {/* Navigation Section */}
          <div className="space-y-0.5">
            <Link href="/home">
              <button
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-figma-pointer ${
                  isOverview
                    ? "bg-white/[0.08] text-white"
                    : "text-white/50 hover:bg-white/[0.04] hover:text-white/80"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Dashboard</span>
                </div>
              </button>
            </Link>

            <Link href="/workspaces">
              <button
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-figma-pointer ${
                  isProjects
                    ? "bg-white/[0.08] text-white"
                    : "text-white/50 hover:bg-white/[0.04] hover:text-white/80"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Search className="w-4 h-4" />
                  <span>Search</span>
                </div>
                <kbd className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-white/40 border border-white/10">
                  ⌘K
                </kbd>
              </button>
            </Link>

            <Link href="/dev">
              <button
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-figma-pointer ${
                  isDev
                    ? "bg-white/[0.08] text-white"
                    : "text-white/50 hover:bg-white/[0.04] hover:text-white/80"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Package className="w-4 h-4" />
                  <span>Templates</span>
                </div>
              </button>
            </Link>

            <Link href="/team">
              <button
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-figma-pointer ${
                  isTeam
                    ? "bg-white/[0.08] text-white"
                    : "text-white/50 hover:bg-white/[0.04] hover:text-white/80"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4" />
                  <span>Connectors</span>
                </div>
              </button>
            </Link>
          </div>

          {/* Library Section */}
          <div className="pt-2 space-y-1">
            <p className="px-3 text-[11px] font-semibold text-white/30 tracking-wider">
              Library
            </p>
            <div className="space-y-0.5">
              <Link href="/workspaces">
                <button className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[12.5px] text-white/45 hover:bg-white/[0.04] hover:text-white/75 transition-colors cursor-figma-pointer">
                  <Star className="w-3.5 h-3.5" />
                  <span>Starred</span>
                </button>
              </Link>
              <Link href="/workspaces">
                <button className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[12.5px] text-white/45 hover:bg-white/[0.04] hover:text-white/75 transition-colors cursor-figma-pointer">
                  <FolderKanban className="w-3.5 h-3.5" />
                  <span>Projects</span>
                </button>
              </Link>
            </div>
          </div>

          {/* Recents Section */}
          {workspaces && workspaces.length > 0 && (
            <div className="pt-2 space-y-1">
              <div className="flex items-center justify-between px-3">
                <p className="text-[11px] font-semibold text-white/30 tracking-wider">
                  Recents
                </p>
                <Plus className="w-3.5 h-3.5 text-white/20 hover:text-white/50 cursor-pointer" />
              </div>
              <div className="space-y-0.5">
                {workspaces.slice(0, 6).map((ws) => (
                  <Link href={`/workspace/${ws.id}`} key={ws.id}>
                    <button className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[12px] text-white/40 hover:bg-white/[0.04] hover:text-white/75 transition-all cursor-figma-pointer group">
                      <svg
                        className="w-3 h-3 text-white/25 group-hover:text-purple-400 shrink-0 transition-colors"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polygon points="12 2 2 7 12 12 22 7 12 2" />
                        <polyline points="2 17 12 22 22 17" />
                        <polyline points="2 12 12 17 22 12" />
                      </svg>
                      <span className="truncate">{ws.title}</span>
                    </button>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Section — Share Meshwork Card & Profile */}
        <div className="pt-2 space-y-2 shrink-0">
          {/* Share Referral Box */}
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between group hover:border-white/10 transition-colors">
            <div className="space-y-0.5">
              <p className="text-[11.5px] font-semibold text-white/80">
                Share Meshwork
              </p>
              <p className="text-[10px] text-white/35">
                Invite teammates to collaborate
              </p>
            </div>
            <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/50 group-hover:text-white group-hover:bg-white/10 transition-colors">
              <Gift className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Profile Menu Trigger */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen((v) => !v)}
              className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-white/[0.05] transition-colors cursor-figma-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full overflow-hidden bg-white/[0.08] border border-white/10 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
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
                <span className="text-[12px] font-medium text-white/70 truncate">
                  {userName}
                </span>
              </div>
              <HelpCircle className="w-3.5 h-3.5 text-white/20 shrink-0" />
            </button>

            <AnimatePresence>
              {profileOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute bottom-full left-0 right-0 mb-2 bg-[#161618] border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl z-50 p-1"
                >
                  <div className="px-3 py-2 border-b border-white/[0.05]">
                    <p className="text-[12px] font-semibold text-white truncate">
                      {userName}
                    </p>
                    <p className="text-[10px] text-white/35 truncate">
                      {user?.email}
                    </p>
                  </div>
                  <div className="py-1">
                    <Link
                      href="/settings"
                      onClick={() => setProfileOpen(false)}
                    >
                      <button className="w-full text-left px-3 py-1.5 rounded-md text-xs text-white/60 hover:text-white hover:bg-white/[0.05] flex items-center gap-2.5 transition-colors cursor-figma-pointer">
                        <Settings className="w-3.5 h-3.5" /> Settings
                      </button>
                    </Link>
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        logout();
                      }}
                      className="w-full text-left px-3 py-1.5 rounded-md text-xs text-red-400/70 hover:text-red-400 hover:bg-white/[0.05] flex items-center gap-2.5 transition-colors cursor-figma-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" /> Log out
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </aside>

      {/* ── Main Canvas View Container — Curved rounded-[24px] box ── */}
      <main className="flex-1 rounded-[24px] overflow-hidden border border-white/[0.08] bg-[#0c0d14] relative min-h-[calc(100vh-20px)] shadow-2xl flex flex-col">
        <Suspense
          fallback={
            <div className="flex flex-col items-center justify-center h-screen gap-6">
              <div className="relative flex items-center justify-center">
                <AnimatedSpinner size="4.5rem" />
                <div className="absolute w-6 h-6 flex items-center justify-center pointer-events-none">
                  <MeshworkLogo />
                </div>
              </div>
            </div>
          }
        >
          <PageErrorBoundary>{children}</PageErrorBoundary>
        </Suspense>
      </main>

      {!onboardingComplete && <OnboardingFlow />}
    </div>
  );
}
