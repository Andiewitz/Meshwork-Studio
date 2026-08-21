import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// ─── Global session-expired handler ──────────────────────────────────────────
// Registered at module level — BEFORE React renders — so it is guaranteed to
// be in place before any fetch, query, or WebSocket message fires the event.
// This is the authoritative redirect; useAuth's useEffect listener is a backup.
let _sessionExpiredHandling = false;
window.addEventListener("session-expired", () => {
  if (_sessionExpiredHandling) return;
  _sessionExpiredHandling = true;

  const path = window.location.pathname;
  const isAlreadyOnAuth =
    path.startsWith("/login") || path.startsWith("/register");

  // Always hard-navigate so the page fully reloads with cleared state.
  // If already on the login page, just reload it (adds the ?reason banner).
  const redirectTarget = isAlreadyOnAuth ? "/home" : path;
  window.location.href = `/login?reason=session_expired&redirect=${encodeURIComponent(redirectTarget)}`;
});

createRoot(document.getElementById("root")!).render(<App />);
