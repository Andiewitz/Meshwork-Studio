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
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth, AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/use-theme";
import { useCsrfTokenInitializer } from "@/lib/csrf-init";
import { RedirectingScreen } from "@/components/ui/loading-screen";
import { MobileGate } from "@/components/ui/mobile-gate";
import { AnimatePresence, motion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { HelmetProvider } from "react-helmet-async";
import { AuthModalProvider } from "@/components/auth/AuthModalContext";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { PageErrorBoundary } from "@/components/ui/page-error-boundary";

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
  const { user, isLoading, isRedirecting } = useAuth();
  const [location] = useLocation();
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Show full-screen loader only during initial auth verification or logout transition
  if ((isLoading && user === undefined) || isRedirecting) {
    return <RedirectingScreen />;
  }

  if (!user && !isLoading) {
    window.location.href = `/login?reason=session_expired&redirect=${encodeURIComponent(location)}`;
    return <RedirectingScreen />;
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

  return (
    <Switch>
      {/* Public Pages */}
      <Route path="/">{user ? <Redirect to="/home" /> : <Landing />}</Route>
      <Route path="/login">
        {user ? <Redirect to="/home" /> : <AuthPage />}
      </Route>
      <Route path="/register">
        {user ? <Redirect to="/home" /> : <AuthPage />}
      </Route>
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
          <ThemeProvider>
            <WouterRouter>
              <AuthModalProvider>
                <TooltipProvider>
                  <Toaster />
                  <ErrorBoundary>
                    <Suspense fallback={<RedirectingScreen />}>
                      <Router />
                    </Suspense>
                  </ErrorBoundary>
                </TooltipProvider>
              </AuthModalProvider>
            </WouterRouter>
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
