import "@/components/layout/dashboard-theme.css";
import { ReactNode, useState, useRef, useEffect } from "react";
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
  ChevronDownIcon as ChevronDown,
  GiftIcon as Gift,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { MeshworkLogo } from "@/components/MeshworkLogo";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import {
  OnboardingFlow,
  useOnboardingComplete,
} from "@/components/ui/onboarding-modal";
import { MobileGate } from "@/components/ui/mobile-gate";
import { PageErrorBoundary } from "@/components/ui/page-error-boundary";
import { ActionSearchBar } from "@/components/ui/action-searchbar";

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { data: workspaces } = useWorkspaces();
  const [location] = useLocation();

  const isOverview = location === "/home";
  const isDev = location === "/dev";
  const isTeam = location === "/team";

  const [isMobile, setIsMobile] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handleOpen = () => setSearchOpen(true);
    window.addEventListener("meshwork:open-search", handleOpen);
    return () => window.removeEventListener("meshwork:open-search", handleOpen);
  }, []);

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

  if (location === "/settings") {
    return (
      <div className="dashboard-shell dashboard-ground dashboard-ink font-body selection:bg-primary/20 selection:text-foreground min-h-screen antialiased flex flex-col">
        {children}
      </div>
    );
  }

  return (
    <div className="dashboard-shell dashboard-ground dashboard-ink font-body selection:bg-primary/20 selection:text-foreground min-h-screen antialiased flex p-2.5 gap-2.5 cursor-figma">
      {/* ── Sidebar (240px / w-60) ── */}
      <aside className="w-60 shrink-0 flex flex-col justify-between h-[calc(100vh-20px)] sticky top-2.5 z-50 select-none">
        <div className="flex flex-col flex-1 overflow-y-auto space-y-4 pr-1 hide-scrollbar">
          {/* Logo & Workspace Dropdown Header */}
          <div className="space-y-2">
            <div className="flex items-end gap-2 px-2 py-1 pb-1.5">
              <div className="w-5 h-5 flex items-center justify-center shrink-0">
                <MeshworkLogo />
              </div>
              <span className="font-headline font-bold dashboard-ink tracking-tight text-sm leading-none">
                Meshwork Studio
              </span>
            </div>

            {/* Workspace Selector Pill */}
            <div className="w-full flex items-center justify-between gap-2 p-2 rounded-xl dashboard-tint border dashboard-border dashboard-hover-border transition-all">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[10px] font-bold dashboard-brand-ink shrink-0">
                  {userInitial}
                </div>
                <span className="text-[12.5px] font-semibold dashboard-secondary truncate">
                  {userName}&apos;s Studio
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 dashboard-muted shrink-0" />
            </div>
          </div>

          {/* Navigation Section */}
          <div className="space-y-0.5">
            <Link href="/home">
              <button
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-figma-pointer ${
                  isOverview
                    ? "dashboard-tint dashboard-ink"
                    : "dashboard-secondary dashboard-hover-tint dashboard-hover-ink"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Dashboard</span>
                </div>
              </button>
            </Link>

            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-figma-pointer dashboard-secondary dashboard-hover-tint dashboard-hover-ink"
            >
              <div className="flex items-center gap-2.5">
                <Search className="w-4 h-4" />
                <span>Search</span>
              </div>
              <kbd className="text-[9px] font-mono px-1.5 py-0.5 rounded dashboard-tint dashboard-muted border dashboard-border">
                ⌘K
              </kbd>
            </button>

            <Link href="/dev">
              <button
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-figma-pointer ${
                  isDev
                    ? "dashboard-tint dashboard-ink"
                    : "dashboard-secondary dashboard-hover-tint dashboard-hover-ink"
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
                    ? "dashboard-tint dashboard-ink"
                    : "dashboard-secondary dashboard-hover-tint dashboard-hover-ink"
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
            <p className="px-3 text-[11px] font-semibold dashboard-muted tracking-wider">
              Library
            </p>
            <div className="space-y-0.5">
              <Link href="/workspaces">
                <button className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[12.5px] dashboard-secondary dashboard-hover-tint dashboard-hover-ink transition-colors cursor-figma-pointer">
                  <Star className="w-3.5 h-3.5" />
                  <span>Starred</span>
                </button>
              </Link>
              <Link href="/workspaces">
                <button className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[12.5px] dashboard-secondary dashboard-hover-tint dashboard-hover-ink transition-colors cursor-figma-pointer">
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
                <p className="text-[11px] font-semibold dashboard-muted tracking-wider">
                  Recents
                </p>
                <Plus className="w-3.5 h-3.5 dashboard-muted dashboard-hover-ink cursor-pointer" />
              </div>
              <div className="space-y-0.5">
                {workspaces.slice(0, 6).map((ws) => (
                  <Link href={`/workspace/${ws.id}`} key={ws.id}>
                    <button className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[12px] dashboard-muted dashboard-hover-tint dashboard-hover-ink transition-all cursor-figma-pointer group">
                      <svg
                        className="w-3 h-3 dashboard-muted group-hover:text-purple-400 shrink-0 transition-colors"
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
          <div className="p-3 rounded-xl dashboard-tint border dashboard-border flex items-center justify-between group dashboard-hover-border transition-colors">
            <div className="space-y-0.5">
              <p className="text-[11.5px] font-semibold dashboard-secondary">
                Share Meshwork
              </p>
              <p className="text-[10px] dashboard-muted">
                Invite teammates to collaborate
              </p>
            </div>
            <div className="w-7 h-7 rounded-lg dashboard-tint border dashboard-border flex items-center justify-center dashboard-secondary dashboard-group-hover-ink dashboard-group-hover-tint transition-colors">
              <Gift className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Profile Menu Trigger */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen((v) => !v)}
              className="w-full flex items-center justify-between p-2 rounded-xl dashboard-hover-tint transition-colors cursor-figma-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full overflow-hidden dashboard-tint border dashboard-border flex items-center justify-center text-[10px] font-bold dashboard-ink shrink-0">
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
                <span className="text-[12px] font-medium dashboard-secondary truncate">
                  {userName}
                </span>
              </div>
              <HelpCircle className="w-3.5 h-3.5 dashboard-muted shrink-0" />
            </button>

            <AnimatePresence>
              {profileOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute bottom-full left-0 right-0 mb-2 dashboard-popover border dashboard-border rounded-xl overflow-hidden shadow-2xl z-50 p-1"
                >
                  <div className="px-3 py-2 border-b dashboard-border">
                    <p className="text-[12px] font-semibold dashboard-ink truncate">
                      {userName}
                    </p>
                    <p className="text-[10px] dashboard-muted truncate">
                      {user?.email}
                    </p>
                  </div>
                  <div className="py-1">
                    <Link
                      href="/settings"
                      onClick={() => setProfileOpen(false)}
                    >
                      <button className="w-full text-left px-3 py-1.5 rounded-md text-xs dashboard-secondary dashboard-hover-ink dashboard-hover-tint flex items-center gap-2.5 transition-colors cursor-figma-pointer">
                        <Settings className="w-3.5 h-3.5" /> Settings
                      </button>
                    </Link>
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        logout();
                      }}
                      className="w-full text-left px-3 py-1.5 rounded-md text-xs text-red-400/70 hover:text-red-400 dashboard-hover-tint flex items-center gap-2.5 transition-colors cursor-figma-pointer"
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
      <main className="dashboard-content flex-1 rounded-[24px] overflow-hidden border dashboard-border dashboard-content-surface relative min-h-[calc(100vh-20px)] shadow-2xl flex flex-col">
        <PageErrorBoundary>{children}</PageErrorBoundary>
      </main>

      {!onboardingComplete && <OnboardingFlow />}
      <ActionSearchBar
        isModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </div>
  );
}
