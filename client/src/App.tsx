import React, { Suspense } from "react";
import {
  Switch,
  Route,
  Redirect,
  useLocation,
  Router as WouterRouter,
} from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { CookieBanner } from "@/components/ui/cookie-banner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth, AuthProvider } from "@/hooks/use-auth";
import { useCsrfTokenInitializer } from "@/lib/secure-fetch";
import { DefaultLoading, RedirectLoading } from "@/components/loading-states";
import { MobileGate } from "@/components/ui/mobile-gate";
import { AnimatePresence, motion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { HelmetProvider } from "react-helmet-async";
import { ErrorBoundary } from "@/components/ui/error-boundary";

// Route-level code splitting via React.lazy
const lazyMap = {
  NotFound: React.lazy(() => import("@/pages/not-found")),
  Home: React.lazy(() => import("@/pages/Home")),
  Landing: React.lazy(() => import("@/pages/Landing")),
  Settings: React.lazy(() => import("@/pages/Settings")),
  Workspace: React.lazy(() => import("@/pages/Workspace")),
  Dev: React.lazy(() => import("@/pages/Dev")),
  Docs: React.lazy(() => import("@/pages/Dev")),
  Team: React.lazy(() => import("@/pages/Team")),
  Templates: React.lazy(() => import("@/pages/Templates")),
  TermsOfService: React.lazy(() => import("@/pages/TermsOfService")),
  PrivacyPolicy: React.lazy(() => import("@/pages/PrivacyPolicy")),
  AuthPage: React.lazy(() => import("@/pages/AuthPage")),
  ForgotPasswordPage: React.lazy(() =>
    import("@/pages/auth-recovery").then((m) => ({
      default: m.ForgotPasswordPage,
    })),
  ),
  ResetPasswordPage: React.lazy(() =>
    import("@/pages/auth-recovery").then((m) => ({
      default: m.ResetPasswordPage,
    })),
  ),
  VerifyEmailPage: React.lazy(() =>
    import("@/pages/auth-recovery").then((m) => ({
      default: m.VerifyEmailPage,
    })),
  ),
};

const {
  NotFound,
  Home,
  Landing,
  Settings,
  Workspace,
  Dev,
  Docs,
  Team,
  Templates,
  TermsOfService,
  PrivacyPolicy,
  AuthPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyEmailPage,
} = lazyMap;

// Preload route chunks on hover or intent
export function preloadRoute(path: string) {
  if (path === "/" || path === "/landing") void import("@/pages/Landing");
  else if (path === "/home" || path === "/workspaces")
    void import("@/pages/Home");
  else if (path === "/settings") void import("@/pages/Settings");
  else if (path.startsWith("/workspace/")) void import("@/pages/Workspace");
  else if (path === "/dev" || path === "/docs") void import("@/pages/Dev");
  else if (path === "/team") void import("@/pages/Team");
  else if (path === "/templates") void import("@/pages/Templates");
  else if (path === "/terms") void import("@/pages/TermsOfService");
  else if (path === "/privacy") void import("@/pages/PrivacyPolicy");
  else if (path === "/login" || path === "/register")
    void import("@/pages/AuthPage");
}

// Preload current route immediately on initial script execution
const initialPath = window.location.pathname;
preloadRoute(initialPath);

function ProtectedRoute({
  component: Component,
}: {
  component: React.ComponentType;
}) {
  const { user, isLoading, isRedirecting, isLoggingOut } = useAuth();
  const [, navigate] = useLocation();
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Redirect to landing when auth resolves to unauthenticated
  React.useEffect(() => {
    if (isLoading || user) return;
    navigate("/");
  }, [user, isLoading, navigate]);

  // Show default loader during initial auth verification
  if (isLoading && user === undefined) {
    return <DefaultLoading />;
  }

  // Redirecting state during logout transition
  if (isLoggingOut || isRedirecting) {
    return <RedirectLoading message="Signing out..." />;
  }

  // Not authenticated — show loading while navigating
  if (!user && !isLoading) {
    return <RedirectLoading message="Redirecting to landing page..." />;
  }

  if (isMobile) {
    return <MobileGate />;
  }

  return <Component />;
}

function DashboardRoutes() {
  const [location] = useLocation();

  return (
    <DashboardLayout>
      <AnimatePresence mode="wait">
        <motion.div
          key={location}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="h-full"
        >
          <Switch location={location}>
            <Route path="/home" component={Home} />
            <Route path="/workspaces" component={Home} />
            <Route path="/settings" component={Settings} />
            <Route path="/team" component={Team} />
            <Route path="/dev" component={Dev} />
            <Route path="/templates" component={Templates} />
            <Route component={NotFound} />
          </Switch>
        </motion.div>
      </AnimatePresence>
    </DashboardLayout>
  );
}

function Router() {
  const [location] = useLocation();
  const { user, isLoading } = useAuth();

  // Backwards compat: redirect old /auth/* routes
  if (location.startsWith("/auth/")) {
    const mode = location.includes("register") ? "register" : "login";
    return <Redirect to={`/${mode}`} />;
  }

  // Helper for public/guest pages that redirect authenticated users to dashboard
  const renderGuestRoute = (guestComponent: React.ReactNode) => {
    if (isLoading && user === undefined) {
      return <DefaultLoading />;
    }
    if (user) {
      return <Redirect to="/home" />;
    }
    return guestComponent;
  };

  return (
    <Switch>
      {/* Public Pages */}
      <Route path="/">{renderGuestRoute(<Landing />)}</Route>
      <Route path="/login">{renderGuestRoute(<AuthPage />)}</Route>
      <Route path="/register">{renderGuestRoute(<AuthPage />)}</Route>
      <Route path="/forgot-password">
        {renderGuestRoute(<ForgotPasswordPage />)}
      </Route>
      <Route path="/reset-password">
        {renderGuestRoute(<ResetPasswordPage />)}
      </Route>
      <Route path="/verify-email" component={VerifyEmailPage} />
      <Route path="/terms" component={TermsOfService} />
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/docs" component={Docs} />

      {/* Standalone Workspace Route */}
      <Route path="/workspace/:id">
        <ProtectedRoute component={Workspace} />
      </Route>

      {/* Dashboard Protected Routes */}
      <Route path="/home">
        <ProtectedRoute component={DashboardRoutes} />
      </Route>
      <Route path="/workspaces">
        <ProtectedRoute component={DashboardRoutes} />
      </Route>
      <Route path="/settings">
        <ProtectedRoute component={DashboardRoutes} />
      </Route>
      <Route path="/team">
        <ProtectedRoute component={DashboardRoutes} />
      </Route>
      <Route path="/dev">
        <ProtectedRoute component={DashboardRoutes} />
      </Route>
      <Route path="/templates">
        <ProtectedRoute component={DashboardRoutes} />
      </Route>

      {/* 404 Fallback */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Initialize CSRF token on app load
  useCsrfTokenInitializer();

  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <WouterRouter>
            <TooltipProvider>
              <Toaster />
              <CookieBanner />
              <ErrorBoundary>
                <Suspense fallback={<DefaultLoading />}>
                  <Router />
                </Suspense>
              </ErrorBoundary>
            </TooltipProvider>
          </WouterRouter>
        </AuthProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
