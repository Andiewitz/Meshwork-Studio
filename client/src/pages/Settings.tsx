import { useEffect, useState, type FormEvent } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import {
  ChevronLeftIcon,
  UserCircleIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SunIcon,
  MoonIcon,
  TrashIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/ThemeProvider";
import { useToast } from "@/hooks/use-toast";
import { SecuritySection } from "@/components/settings/SecuritySection";
import { MeshworkLogo } from "@/components/MeshworkLogo";
import { aiService, type ApiKey, type Provider } from "@/lib/ai";
import { apiRequest } from "@/lib/queryClient";
import "./settings.css";

type Tab = "account" | "appearance" | "security" | "ai";
const navigation: { id: Tab; label: string; icon: typeof UserCircleIcon }[] = [
  { id: "account", label: "Account", icon: UserCircleIcon },
  { id: "appearance", label: "Appearance", icon: SunIcon },
  { id: "security", label: "Security & devices", icon: ShieldCheckIcon },
  { id: "ai", label: "AI providers", icon: SparklesIcon },
];

export default function Settings() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("account");
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [savingProfile, setSavingProfile] = useState(false);
  useEffect(() => {
    setFirstName(user?.firstName || "");
    setLastName(user?.lastName || "");
  }, [user?.firstName, user?.lastName]);
  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setSavingProfile(true);
    try {
      await apiRequest("PATCH", "/api/v1/user/profile", {
        firstName,
        lastName,
      });
      toast({ title: "Profile updated" });
    } catch {
      toast({ title: "Failed to update profile", variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  }
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyError, setKeyError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [provider, setProvider] = useState("openai");
  const [keyValue, setKeyValue] = useState("");
  const [saving, setSaving] = useState(false);
  const name =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.email?.split("@")[0] ||
    "Account";

  async function loadKeys() {
    setLoading(true);
    setKeyError(false);
    try {
      setKeys(await aiService.getApiKeys());
    } catch {
      setKeyError(true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (tab !== "ai") return;
    void loadKeys();
    void aiService
      .getProviders()
      .then(setProviders)
      .catch(() => setProviders([]));
  }, [tab]);
  async function saveKey(event: FormEvent) {
    event.preventDefault();
    if (!keyValue.trim()) return;
    setSaving(true);
    try {
      await aiService.saveApiKey(provider, keyValue.trim());
      setKeyValue("");
      setAdding(false);
      toast({ title: "API key added" });
      await loadKeys();
    } catch {
      toast({ title: "Could not add API key", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }
  async function deleteKey(id: string) {
    try {
      await aiService.deleteApiKey(id);
      toast({ title: "API key deleted" });
      await loadKeys();
    } catch {
      toast({ title: "Could not delete API key", variant: "destructive" });
    }
  }
  const providerOptions = providers.length
    ? providers
    : [
        { id: "openai", name: "OpenAI", models: [] },
        { id: "anthropic", name: "Anthropic", models: [] },
        { id: "gemini", name: "Google Gemini", models: [] },
        { id: "deepseek", name: "DeepSeek", models: [] },
      ];

  return (
    <div className="settings-shell">
      <Helmet>
        <title>Settings | Meshwork Studio</title>
      </Helmet>
      <aside className="settings-sidebar">
        <Link href="/home" className="settings-back">
          <ChevronLeftIcon /> Back to studio
        </Link>
        <div className="settings-sidebar-title">
          <span className="settings-mark">
            <MeshworkLogo />
          </span>
          <div>
            <strong>Settings</strong>
            <span>Meshwork Studio</span>
          </div>
        </div>
        <nav aria-label="Settings sections" className="settings-nav">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
            >
              <Icon />
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-sidebar-account">
          <span className="settings-avatar">
            {name.charAt(0).toUpperCase()}
          </span>
          <div>
            <strong>{name}</strong>
            <span>{user?.email}</span>
          </div>
        </div>
      </aside>
      <main className="settings-main">
        <div className="settings-content">
          {tab === "account" && (
            <>
              <header className="settings-heading">
                <p>Personal settings</p>
                <h1>Account</h1>
                <span>Your Meshwork Studio account details.</span>
              </header>
              <section className="settings-card">
                <div className="settings-card-heading">
                  <div>
                    <h2>Profile</h2>
                    <p>Information associated with your account.</p>
                  </div>
                  <span className="settings-avatar settings-avatar-large">
                    {name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <form className="settings-profile-form" onSubmit={saveProfile}>
                  <div className="settings-profile-names">
                    <label>
                      First name
                      <input
                        value={firstName}
                        onChange={(event) => setFirstName(event.target.value)}
                        autoComplete="given-name"
                      />
                    </label>
                    <label>
                      Last name
                      <input
                        value={lastName}
                        onChange={(event) => setLastName(event.target.value)}
                        autoComplete="family-name"
                      />
                    </label>
                  </div>
                  <div className="settings-profile-email">
                    <span>Email address</span>
                    <strong>{user?.email || "—"}</strong>
                  </div>
                  <div className="settings-actions">
                    <button
                      className="settings-primary"
                      type="submit"
                      disabled={savingProfile}
                    >
                      {savingProfile ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </form>
              </section>
              <section className="settings-section-note">
                <ShieldCheckIcon />
                <div>
                  <h2>Keep your account secure</h2>
                  <p>
                    Manage your password, two-factor authentication, and active
                    sessions.
                  </p>
                </div>
                <button type="button" onClick={() => setTab("security")}>
                  Security settings <span aria-hidden="true">→</span>
                </button>
              </section>
            </>
          )}
          {tab === "appearance" && (
            <>
              <header className="settings-heading">
                <p>Personal settings</p>
                <h1>Appearance</h1>
                <span>Choose how Meshwork Studio looks on this device.</span>
              </header>
              <section className="settings-card">
                <div className="settings-card-heading">
                  <div>
                    <h2>Color mode</h2>
                    <p>Your choice applies across the studio and its canvas.</p>
                  </div>
                </div>
                <div
                  className="settings-theme-options"
                  role="group"
                  aria-label="Color mode"
                >
                  {(["light", "dark"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={theme === mode}
                      onClick={() => {
                        if (theme !== mode) toggleTheme();
                      }}
                      className="settings-theme-option"
                    >
                      <span
                        className={`settings-theme-preview ${mode}`}
                        aria-hidden="true"
                      >
                        <i />
                        <b />
                        <em />
                      </span>
                      <span className="settings-theme-label">
                        {mode === "light" ? <SunIcon /> : <MoonIcon />}
                        {mode === "light" ? "Light" : "Dark"}
                        <span className="settings-radio" />
                      </span>
                    </button>
                  ))}
                </div>
                <p className="settings-footnote">
                  Saved on this browser and shared across open tabs.
                </p>
              </section>
            </>
          )}
          {tab === "security" && (
            <div className="settings-security">
              <SecuritySection />
            </div>
          )}
          {tab === "ai" && (
            <>
              <header className="settings-heading">
                <p>Studio settings</p>
                <h1>AI providers</h1>
                <span>Connect your own provider keys for AI features.</span>
              </header>
              <section className="settings-card">
                <div className="settings-card-heading">
                  <div>
                    <h2>API keys</h2>
                    <p>Only the key hint is shown after a key is saved.</p>
                  </div>
                  <button
                    type="button"
                    className="settings-primary"
                    onClick={() => setAdding(true)}
                  >
                    Add API key
                  </button>
                </div>
                {loading ? (
                  <p className="settings-empty">
                    <ArrowPathIcon className="settings-spin" /> Loading keys…
                  </p>
                ) : keyError ? (
                  <div className="settings-empty">
                    Couldn’t load your keys.{" "}
                    <button type="button" onClick={() => void loadKeys()}>
                      Try again
                    </button>
                  </div>
                ) : keys.length === 0 ? (
                  <div className="settings-empty">
                    No API keys connected yet.
                  </div>
                ) : (
                  <ul className="settings-key-list">
                    {keys.map((key) => (
                      <li key={key.id}>
                        <div>
                          <strong>
                            {providers.find((p) => p.id === key.provider)
                              ?.name || key.provider}
                          </strong>
                          <span>{key.keyHint}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void deleteKey(key.id)}
                          aria-label={`Delete ${key.provider} API key`}
                        >
                          <TrashIcon />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              {adding && (
                <form
                  className="settings-card settings-key-form"
                  onSubmit={saveKey}
                >
                  <div>
                    <h2>Add an API key</h2>
                    <p>Use a key from your provider account.</p>
                  </div>
                  <label>
                    Provider
                    <select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                    >
                      {providerOptions.map((p) => (
                        <option value={p.id} key={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    API key
                    <input
                      type="password"
                      value={keyValue}
                      onChange={(e) => setKeyValue(e.target.value)}
                      autoComplete="off"
                      required
                    />
                  </label>
                  <div className="settings-actions">
                    <button
                      type="button"
                      className="settings-secondary"
                      onClick={() => {
                        setAdding(false);
                        setKeyValue("");
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="settings-primary"
                      type="submit"
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save key"}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
