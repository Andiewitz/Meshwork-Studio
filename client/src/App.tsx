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
import { useAuth } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/use-theme";
import { useCsrfTokenInitializer } from "@/lib/csrf-init";
import { RedirectingScreen } from "@/components/ui/loading-screen";
import { MobileGate } from "@/components/ui/mobile-gate";
import { AnimatePresence, motion } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { HelmetProvider } from "react-helmet-async";
import { AuthModalProvider } from "@/components/auth/AuthModalContext";
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

// Eagerly trigger import for the current route to parallelize with auth fetch
const currentPath = window.location.pathname;
if (currentPath === "/" || currentPath === "/landing")
  void import("@/pages/Landing");
else if (currentPath === "/home" || currentPath === "/workspaces")
  void import("@/pages/Home");
else if (currentPath === "/settings") void import("@/pages/Settings");
else if (currentPath.startsWith("/workspace/"))
  void import("@/pages/Workspace");
else if (currentPath === "/dev") void import("@/pages/Dev");
else if (currentPath === "/docs") void import("@/pages/Dev");
else if (currentPath === "/team") void import("@/pages/Team");
else if (currentPath === "/templates") void import("@/pages/Templates");
else if (currentPath === "/terms") void import("@/pages/TermsOfService");
else if (currentPath === "/privacy") void import("@/pages/PrivacyPolicy");
else if (currentPath === "/login" || currentPath === "/register")
  void import("@/pages/AuthPage");

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

  if (isLoading || isRedirecting) {
    return <RedirectingScreen />;
  }

  if (!user) {
    return <Redirect to={`/login?redirect=${encodeURIComponent(location)}`} />;
  }

  if (isMobile) {
    return <MobileGate />;
  }

  return <Component />;
}

function Router() {
  const [location] = useLocation();
  const { user, isLoading, isRedirecting } = useAuth();

  // Backwards compat: redirect old /auth/* routes to new full-page routes
  if (location.startsWith("/auth/")) {
    const mode = location.includes("register") ? "register" : "login";
    return <Redirect to={`/${mode}`} />;
  }

  // Show redirecting screen during auth transitions for protected routes
  if (isLoading || isRedirecting) {
    return <RedirectingScreen />;
  }

  // Public pages (landing, legal)
  if (location === "/") {
    if (user) {
      return <Redirect to="/home" />;
    }
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="landing"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="min-h-screen"
        >
          <Landing />
        </motion.div>
      </AnimatePresence>
    );
  }

  // Auth pages (login, register)
  if (location === "/login" || location === "/register") {
    if (user) {
      return <Redirect to="/home" />;
    }
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={location}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="min-h-screen"
        >
          <AuthPage />
        </motion.div>
      </AnimatePresence>
    );
  }

  if (location === "/terms" || location === "/privacy") {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={location}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="min-h-screen"
        >
          <Switch location={location}>
            <Route path="/terms">
              <TermsOfService />
            </Route>
            <Route path="/privacy">
              <PrivacyPolicy />
            </Route>
          </Switch>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Public docs page — no login required, Google-indexable
  if (location === "/docs") {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="docs"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="min-h-screen"
        >
          <Docs />
        </motion.div>
      </AnimatePresence>
    );
  }

  // Workspace routes - scale animation from card
  if (location.startsWith("/workspace/")) {
    return (
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{
            duration: 0.35,
            ease: [0.25, 0.1, 0.25, 1],
            opacity: { duration: 0.25 },
          }}
          className="h-full"
          style={{ willChange: "opacity, transform" }}
        >
          <Switch location={location} key={location}>
            <Route path="/workspace/:id">
              <ProtectedRoute component={Workspace} />
            </Route>
          </Switch>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Dashboard routes with layout
  return (
    <DashboardLayout>
      <AnimatePresence mode="wait">
        <motion.div
          key={location}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="h-full"
        >
          <Switch location={location}>
            <Route path="/home">
              <ProtectedRoute component={Home} />
            </Route>
            <Route path="/workspaces">
              <ProtectedRoute component={Home} />
            </Route>
            <Route path="/settings">
              <ProtectedRoute component={Settings} />
            </Route>
            <Route path="/team">
              <ProtectedRoute component={Team} />
            </Route>
            <Route path="/dev">
              <ProtectedRoute component={Dev} />
            </Route>
            <Route path="/templates">
              <ProtectedRoute component={Templates} />
            </Route>
            <Route>
              <NotFound />
            </Route>
          </Switch>
        </motion.div>
      </AnimatePresence>
    </DashboardLayout>
  );
}

function App() {
  // Initialize CSRF token on app load
  useCsrfTokenInitializer();

  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
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
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
