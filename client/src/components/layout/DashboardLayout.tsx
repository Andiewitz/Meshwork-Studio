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
  ChevronRightIcon as ChevronRight,
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
  const [sidebarSearch, setSidebarSearch] = useState("");
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

  const navItems = [
    {
      href: "/home",
      active: isOverview,
      Icon: LayoutDashboard,
      label: "Dashboard",
    },
    {
      href: "/workspaces",
      active: isProjects,
      Icon: Package,
      label: "Workspaces",
    },
    { href: "/dev", active: isDev, Icon: Newspaper, label: "Blog" },
    { href: "/team", active: isTeam, Icon: Users, label: "Team" },
  ] as const;

  return (
    <div className="bg-[#0e0e0f] text-white font-body selection:bg-white/20 selection:text-white min-h-screen antialiased flex cursor-figma">
      {/* ── Sidebar (160px) ── */}
      <aside className="fixed left-0 top-0 h-full w-40 z-50 flex flex-col border-r border-white/[0.06] bg-[#0e0e0f]">
        {/* Logo */}
        <div className="flex items-center gap-2 px-3.5 py-3.5 border-b border-white/[0.06]">
          <div className="w-6 h-6 flex items-center justify-center shrink-0">
            <MeshworkLogo />
          </div>
          <span className="text-[12px] font-semibold text-white/80 truncate">
            Meshwork
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 hide-scrollbar">
          {/* Main nav */}
          {navItems.map(({ href, active, Icon, label }) => (
            <Link href={href} key={href}>
              <button
                onMouseEnter={() => preloadRoute(href)}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-all duration-150 cursor-figma-pointer ${
                  active
                    ? "bg-white/[0.07] text-white"
                    : "text-white/40 hover:bg-white/[0.04] hover:text-white/70"
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 ${active ? "text-white" : ""}`}
                />
                <span>{label}</span>
              </button>
            </Link>
          ))}

          {/* Divider */}
          <div className="pt-3 pb-1">
            <p className="px-2.5 text-[10px] font-semibold text-white/20 uppercase tracking-widest">
              Library
            </p>
          </div>

          {/* Library items */}
          {[
            { Icon: Star, label: "Starred", href: "/workspaces" },
            { Icon: FolderKanban, label: "Projects", href: "/workspaces" },
          ].map(({ Icon, label, href }) => (
            <Link href={href} key={label}>
              <button className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12px] text-white/35 hover:bg-white/[0.04] hover:text-white/60 transition-all duration-150 cursor-figma-pointer">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{label}</span>
              </button>
            </Link>
          ))}

          {/* Recents */}
          {workspaces && workspaces.length > 0 && (
            <>
              <div className="pt-3 pb-1">
                <p className="px-2.5 text-[10px] font-semibold text-white/20 uppercase tracking-widest">
                  Recents
                </p>
              </div>
              {workspaces
                .filter(
                  (ws) =>
                    !sidebarSearch ||
                    ws.title
                      .toLowerCase()
                      .includes(sidebarSearch.toLowerCase()),
                )
                .slice(0, 6)
                .map((ws) => (
                  <Link href={`/workspace/${ws.id}`} key={ws.id}>
                    <button className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] text-white/30 hover:bg-white/[0.04] hover:text-white/60 transition-all duration-150 cursor-figma-pointer group">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/15 group-hover:bg-white/30 transition-colors shrink-0" />
                      <span className="truncate">{ws.title}</span>
                    </button>
                  </Link>
                ))}
            </>
          )}
        </nav>

        {/* Bottom: profile */}
        <div className="border-t border-white/[0.06] p-2" ref={profileRef}>
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="w-full flex items-center gap-2 rounded-md px-2.5 py-2 hover:bg-white/[0.05] transition-colors cursor-figma-pointer"
          >
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
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[11px] font-medium text-white/70 truncate">
                {userName}
              </p>
            </div>
            <HelpCircle className="w-3.5 h-3.5 text-white/20 shrink-0" />
          </button>

          <AnimatePresence>
            {profileOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 4 }}
                transition={{ duration: 0.12 }}
                className="absolute bottom-full left-2 right-2 mb-1 bg-[#161616] border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl z-50"
              >
                <div className="px-3 py-2.5 border-b border-white/[0.05]">
                  <p className="text-[12px] font-semibold text-white truncate">
                    {userName}
                  </p>
                  <p className="text-[10px] text-white/35 truncate">
                    {user?.email}
                  </p>
                </div>
                <div className="py-1">
                  <Link href="/settings" onClick={() => setProfileOpen(false)}>
                    <button className="w-full text-left px-3 py-2 text-xs text-white/50 hover:text-white hover:bg-white/[0.05] flex items-center gap-2.5 transition-colors cursor-figma-pointer">
                      <Settings className="w-3.5 h-3.5" /> Settings
                    </button>
                  </Link>
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      logout();
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-red-400/60 hover:text-red-400 hover:bg-white/[0.05] flex items-center gap-2.5 transition-colors cursor-figma-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Log out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </aside>

      {/* Main content */}
      <main className="pl-40 min-h-screen w-full">
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
