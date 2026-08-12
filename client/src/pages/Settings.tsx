import { useState, useEffect, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { aiService, type ApiKey, type Provider } from "@/lib/ai";
import {
  ChevronLeftIcon,
  MagnifyingGlassIcon,
  UserIcon,
  ComputerDesktopIcon,
  SparklesIcon,
  CreditCardIcon,
  ChatBubbleLeftRightIcon,
  UsersIcon,
  UserGroupIcon,
  KeyIcon,
  AdjustmentsHorizontalIcon,
  DocumentDuplicateIcon,
  ShareIcon,
  CodeBracketIcon,
  ServerIcon,
  GlobeAltIcon,
  ShieldCheckIcon,
  LockClosedIcon,
  DocumentTextIcon,
  ArrowTopRightOnSquareIcon,
  TrashIcon,
  SunIcon as Sun,
  MoonIcon as Moon,
  EyeIcon,
  EyeSlashIcon,
  ArrowPathIcon as Loader2,
  PencilSquareIcon as EditIcon,
} from "@heroicons/react/24/outline";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { apiRequest } from "@/lib/queryClient";
import { validatePasswordStrength } from "@shared/auth";

type SettingsTab =
  | "account"
  | "devices"
  | "workspace"
  | "plans"
  | "slack"
  | "people"
  | "groups"
  | "identity"
  | "ai"
  | "skills"
  | "templates"
  | "connectors"
  | "git"
  | "mcp"
  | "domains"
  | "security"
  | "security-center"
  | "audit-logs";

interface NavItem {
  id: SettingsTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isProfile?: boolean;
  isWorkspace?: boolean;
  badge?: string;
  external?: boolean;
}

interface NavSection {
  title: string | null;
  items: NavItem[];
}

export default function Settings() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<SettingsTab>("account");
  const [searchQuery, setSearchQuery] = useState("");

  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [username] = useState(user?.email?.split("@")[0] || "user");
  const [profileVisibility, setProfileVisibility] = useState("Public");
  const [language, setLanguage] = useState("English");
  const [chatSuggestions, setChatSuggestions] = useState(true);
  const [autoSyncDiagrams, setAutoSyncDiagrams] = useState(true);

  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  const [isAddingKey, setIsAddingKey] = useState(false);
  const [newKeyProvider, setNewKeyProvider] = useState("openai");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [showNewKey, setShowNewKey] = useState(false);

  const userName =
    user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`
      : user?.firstName || user?.email?.split("@")[0] || "User";

  const userInitial = userName.charAt(0).toUpperCase();

  useEffect(() => {
    loadApiKeys();
    loadProviders();
  }, []);

  const loadApiKeys = async () => {
    setIsLoadingKeys(true);
    try {
      const keys = await aiService.getApiKeys();
      setApiKeys(keys);
    } catch (err) {
      console.error("Failed to load API keys:", err);
    } finally {
      setIsLoadingKeys(false);
    }
  };

  const loadProviders = async () => {
    try {
      const p = await aiService.getProviders();
      setProviders(p);
    } catch (err) {
      console.error("Failed to load providers:", err);
    }
  };

  const handleAddKey = async () => {
    if (!newKeyValue.trim()) return;
    setIsAddingKey(true);
    try {
      await aiService.saveApiKey(newKeyProvider, newKeyValue);
      toast({ title: "Success", description: "API key added successfully" });
      setNewKeyValue("");
      setShowNewKey(false);
      loadApiKeys();
    } catch {
      toast({
        title: "Error",
        description: "Failed to add API key",
        variant: "destructive",
      });
    } finally {
      setIsAddingKey(false);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    try {
      await aiService.deleteApiKey(keyId);
      toast({ title: "Success", description: "API key deleted" });
      loadApiKeys();
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete API key",
        variant: "destructive",
      });
    }
  };

  const handleUpdateProfile = async () => {
    setIsUpdatingProfile(true);
    try {
      await apiRequest("PATCH", "/api/v1/user/profile", {
        firstName,
        lastName,
      });
      toast({ title: "Profile updated" });
    } catch {
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) return;
    const v = validatePasswordStrength(newPassword);
    if (!v.valid) return;
    setIsChangingPassword(true);
    try {
      await apiRequest("POST", "/api/v1/user/change-password", {
        currentPassword,
        newPassword,
      });
      toast({ title: "Password updated" });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") return;
    setIsDeletingAccount(true);
    try {
      await apiRequest("DELETE", "/api/v1/user/account");
      logout();
    } catch {
      setIsDeletingAccount(false);
    }
  };

  const navSections: NavSection[] = useMemo(
    () => [
      {
        title: null,
        items: [
          { id: "account", label: userName, icon: UserIcon, isProfile: true },
          { id: "devices", label: "Devices & apps", icon: ComputerDesktopIcon },
        ],
      },
      {
        title: "Workspace",
        items: [
          {
            id: "workspace",
            label: `${userName}'s Studio`,
            icon: SparklesIcon,
            isWorkspace: true,
          },
          { id: "plans", label: "Plans & credit usage", icon: CreditCardIcon },
          {
            id: "slack",
            label: "Slack & alerts",
            icon: ChatBubbleLeftRightIcon,
          },
        ],
      },
      {
        title: "Access",
        items: [
          { id: "people", label: "People", icon: UsersIcon },
          {
            id: "groups",
            label: "Groups",
            icon: UserGroupIcon,
            badge: "Business",
          },
          {
            id: "identity",
            label: "Identity",
            icon: KeyIcon,
            badge: "Business",
          },
        ],
      },
      {
        title: "Customization",
        items: [
          { id: "ai", label: "AI Models & Keys", icon: SparklesIcon },
          {
            id: "skills",
            label: "Skills & Canvas",
            icon: AdjustmentsHorizontalIcon,
          },
          {
            id: "templates",
            label: "Templates",
            icon: DocumentDuplicateIcon,
            badge: "Business",
          },
          {
            id: "connectors",
            label: "Connectors",
            icon: ShareIcon,
            external: true,
          },
        ],
      },
      {
        title: "Build & deploy",
        items: [
          { id: "git", label: "Git", icon: CodeBracketIcon },
          { id: "mcp", label: "MCP server", icon: ServerIcon },
          { id: "domains", label: "Workspace domains", icon: GlobeAltIcon },
        ],
      },
      {
        title: "Security",
        items: [
          {
            id: "security",
            label: "Privacy & security",
            icon: ShieldCheckIcon,
          },
          {
            id: "security-center",
            label: "Security center",
            icon: LockClosedIcon,
            badge: "Business",
          },
          {
            id: "audit-logs",
            label: "Audit logs",
            icon: DocumentTextIcon,
            badge: "Enterprise",
          },
        ],
      },
    ],
    [userName],
  );

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return navSections;
    const q = searchQuery.toLowerCase();
    return navSections
      .map((sec) => ({
        ...sec,
        items: sec.items.filter((item) => item.label.toLowerCase().includes(q)),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [navSections, searchQuery]);

  return (
    <>
      <Helmet>
        <title>Settings — Meshwork Studio</title>
      </Helmet>

      <div className="flex h-screen w-full bg-[#0d0d0f] text-white selection:bg-white/20 select-none overflow-hidden">
        {/* ── Left Settings Navigation Sidebar ── */}
        <aside className="w-64 shrink-0 bg-[#121215] border-r border-white/[0.06] flex flex-col h-full p-4 overflow-y-auto hide-scrollbar">
          <Link
            href="/home"
            className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors cursor-figma-pointer mb-4 px-1 py-1 font-medium"
          >
            <ChevronLeftIcon className="w-3.5 h-3.5" />
            Go back
          </Link>

          <div className="relative mb-5">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              type="text"
              placeholder="Search settings"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 outline-none focus:border-white/20 transition-all"
            />
          </div>

          <div className="space-y-5 flex-1">
            {filteredSections.map((sec, idx) => (
              <div key={idx} className="space-y-1">
                {sec.title && (
                  <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-wider px-2 mb-1.5">
                    {sec.title}
                  </h4>
                )}
                {sec.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-figma-pointer ${
                        isActive
                          ? "bg-white/[0.12] text-white shadow-sm"
                          : "text-white/60 hover:text-white hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {item.isProfile ? (
                          <Avatar className="w-5 h-5 border border-white/20 shrink-0">
                            <AvatarImage
                              src={user?.profileImageUrl || undefined}
                            />
                            <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-[9px] font-bold text-white">
                              {userInitial}
                            </AvatarFallback>
                          </Avatar>
                        ) : item.isWorkspace ? (
                          <div className="w-5 h-5 rounded-md bg-purple-600/80 text-[10px] font-bold text-white flex items-center justify-center shrink-0">
                            M
                          </div>
                        ) : (
                          <Icon className="w-4 h-4 opacity-70 shrink-0" />
                        )}
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="text-[9px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {item.badge}
                        </span>
                      )}
                      {item.external && (
                        <ArrowTopRightOnSquareIcon className="w-3 h-3 opacity-40 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>

        {/* ── Main Content Area ── */}
        <main className="flex-1 overflow-y-auto p-8 sm:p-12 w-full min-w-0">
          {/* Account / Profile tab */}
          {activeTab === "account" && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div>
                <h1 className="text-2xl font-bold font-headline text-white mb-1">
                  Account
                </h1>
                <p className="text-xs text-white/50">
                  Personalize how others see and interact with you on Meshwork
                  Studio.
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-white">
                    Showcase skills
                  </h3>
                  <span className="text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-white/[0.08] text-white/60">
                    Beta
                  </span>
                </div>
                <div className="bg-[#151519]/80 border border-white/[0.08] rounded-2xl p-5 backdrop-blur-xl">
                  <p className="text-xs text-white/50 leading-relaxed">
                    No skills yet. Build diagrams and export code to unlock
                    skills to showcase on your profile.{" "}
                    <button className="text-white/80 underline underline-offset-2 hover:text-white transition-colors cursor-figma-pointer">
                      Learn how to unlock skills
                    </button>
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-white mb-1">
                  Profile
                </h3>
                <p className="text-xs text-white/45 mb-3">
                  Control how you appear on Meshwork Studio.
                </p>
                <div className="bg-[#151519]/90 border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl divide-y divide-white/[0.06]">
                  <div className="p-5 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-white mb-0.5">
                        Profile
                      </h4>
                      <p className="text-[11.5px] text-white/45">
                        Change name, location, avatar, and banner on your
                        profile.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleUpdateProfile}
                      disabled={isUpdatingProfile}
                      className="bg-white/[0.06] border-white/10 hover:bg-white/[0.1] text-xs text-white rounded-xl gap-1.5 cursor-figma-pointer"
                    >
                      {isUpdatingProfile ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                      )}
                      Open profile
                    </Button>
                  </div>
                  <div className="p-5 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-white mb-0.5">
                        First & Last Name
                      </h4>
                      <p className="text-[11.5px] text-white/45">
                        Your public display name across Meshwork Studio.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="First name"
                        className="bg-white/[0.04] border-white/10 text-xs text-white w-28 rounded-xl"
                      />
                      <Input
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Last name"
                        className="bg-white/[0.04] border-white/10 text-xs text-white w-28 rounded-xl"
                      />
                    </div>
                  </div>
                  <div className="p-5 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-white mb-0.5">
                        Username
                      </h4>
                      <p className="text-[11.5px] text-white/45">
                        Your public identifier and profile URL.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-white/80 font-medium">
                      <span>{username}</span>
                      <EditIcon className="w-3.5 h-3.5 text-white/40 cursor-figma-pointer hover:text-white" />
                    </div>
                  </div>
                  <div className="p-5 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-white mb-0.5">
                        Email
                      </h4>
                      <p className="text-[11.5px] text-white/45">
                        Your email address associated with your account.
                      </p>
                    </div>
                    <span className="text-xs text-white/70 font-mono">
                      {user?.email}
                    </span>
                  </div>
                  <div className="p-5 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-white mb-0.5">
                        Profile visibility
                      </h4>
                      <p className="text-[11.5px] text-white/45">
                        Control who can see your public profile.
                      </p>
                    </div>
                    <select
                      value={profileVisibility}
                      onChange={(e) => setProfileVisibility(e.target.value)}
                      className="bg-white/[0.06] border border-white/10 text-xs text-white rounded-xl px-3 py-1.5 outline-none cursor-figma-pointer"
                    >
                      <option value="Public" className="bg-[#121215]">
                        Public
                      </option>
                      <option value="Private" className="bg-[#121215]">
                        Private
                      </option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-white mb-1">
                  Preferences
                </h3>
                <p className="text-xs text-white/45 mb-3">
                  Personalize how Meshwork Studio works for you.
                </p>
                <div className="bg-[#151519]/90 border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl divide-y divide-white/[0.06]">
                  <div className="p-5 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-white mb-0.5">
                        Language
                      </h4>
                      <p className="text-[11.5px] text-white/45">
                        Choose the language Meshwork Studio uses for your
                        account.
                      </p>
                    </div>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="bg-white/[0.06] border border-white/10 text-xs text-white rounded-xl px-3 py-1.5 outline-none cursor-figma-pointer"
                    >
                      <option value="English" className="bg-[#121215]">
                        English
                      </option>
                      <option value="Spanish" className="bg-[#121215]">
                        Spanish
                      </option>
                      <option value="German" className="bg-[#121215]">
                        German
                      </option>
                      <option value="Japanese" className="bg-[#121215]">
                        Japanese
                      </option>
                    </select>
                  </div>
                  <div className="p-5 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-white mb-0.5">
                        Theme
                      </h4>
                      <p className="text-[11.5px] text-white/45">
                        Choose interface color theme.
                      </p>
                    </div>
                    <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl border border-white/[0.08]">
                      <button
                        onClick={() => setTheme("dark")}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${theme === "dark" ? "bg-white/[0.12] text-white shadow-sm" : "text-white/40 hover:text-white"}`}
                      >
                        <Moon className="w-3.5 h-3.5" /> Dark
                      </button>
                      <button
                        onClick={() => setTheme("light")}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${theme === "light" ? "bg-white/[0.12] text-white shadow-sm" : "text-white/40 hover:text-white"}`}
                      >
                        <Sun className="w-3.5 h-3.5" /> Light
                      </button>
                    </div>
                  </div>
                  <div className="p-5 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-white mb-0.5">
                        Chat suggestions
                      </h4>
                      <p className="text-[11.5px] text-white/45">
                        Show helpful suggestions in the AI assistant to enhance
                        your experience.
                      </p>
                    </div>
                    <button
                      onClick={() => setChatSuggestions(!chatSuggestions)}
                      className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-figma-pointer ${chatSuggestions ? "bg-purple-600" : "bg-white/10"}`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${chatSuggestions ? "translate-x-5" : "translate-x-0"}`}
                      />
                    </button>
                  </div>
                  <div className="p-5 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-white mb-0.5">
                        Auto-sync diagrams
                      </h4>
                      <p className="text-[11.5px] text-white/45">
                        Automatically sync canvas layout changes to cloud
                        integrations.
                      </p>
                    </div>
                    <button
                      onClick={() => setAutoSyncDiagrams(!autoSyncDiagrams)}
                      className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-figma-pointer ${autoSyncDiagrams ? "bg-purple-600" : "bg-white/10"}`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${autoSyncDiagrams ? "translate-x-5" : "translate-x-0"}`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI Models & Keys tab */}
          {activeTab === "ai" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <h1 className="text-2xl font-bold font-headline text-white mb-1">
                  AI Models & API Keys
                </h1>
                <p className="text-xs text-white/50">
                  Configure custom API keys for OpenAI, Anthropic, Gemini, and
                  DeepSeek for AI diagram generation.
                </p>
              </div>
              <div className="bg-[#151519]/90 border border-white/[0.08] rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-white">
                    Configured API Keys
                  </h3>
                  <Button
                    size="sm"
                    onClick={() => setShowNewKey(true)}
                    className="bg-white text-black hover:bg-white/90 text-xs font-semibold rounded-xl gap-1"
                  >
                    + Add API Key
                  </Button>
                </div>
                {isLoadingKeys ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-white/40" />
                  </div>
                ) : apiKeys.length === 0 ? (
                  <div className="text-center py-8 border border-dashed border-white/10 rounded-xl">
                    <KeyIcon className="w-8 h-8 text-white/20 mx-auto mb-2" />
                    <p className="text-xs text-white/60 font-medium mb-1">
                      No API keys configured
                    </p>
                    <p className="text-[11px] text-white/35">
                      Add a key to use your own provider quota for AI features.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {apiKeys.map((key) => (
                      <div
                        key={key.id}
                        className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                      >
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 text-[10px] font-bold uppercase">
                            {key.provider}
                          </span>
                          <span className="text-xs font-mono text-white/70">
                            {key.keyHint}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteKey(key.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8 p-0"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {showNewKey && (
                <div className="bg-[#151519]/90 border border-white/[0.08] rounded-2xl p-6 shadow-2xl space-y-4">
                  <h3 className="text-sm font-semibold text-white">
                    Add New API Key
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-white/60 mb-1 block">
                        Provider
                      </label>
                      <select
                        value={newKeyProvider}
                        onChange={(e) => setNewKeyProvider(e.target.value)}
                        className="w-full bg-white/[0.06] border border-white/10 text-xs text-white rounded-xl px-3 py-2 outline-none"
                      >
                        <option value="openai" className="bg-[#121215]">
                          OpenAI (GPT-4o)
                        </option>
                        <option value="anthropic" className="bg-[#121215]">
                          Anthropic (Claude 3.5)
                        </option>
                        <option value="gemini" className="bg-[#121215]">
                          Google Gemini 1.5
                        </option>
                        <option value="deepseek" className="bg-[#121215]">
                          DeepSeek R1
                        </option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-white/60 mb-1 block">
                        API Key Value
                      </label>
                      <Input
                        type="password"
                        placeholder="sk-..."
                        value={newKeyValue}
                        onChange={(e) => setNewKeyValue(e.target.value)}
                        className="bg-white/[0.04] border-white/10 text-xs text-white rounded-xl"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowNewKey(false)}
                      className="text-xs text-white/60"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAddKey}
                      disabled={isAddingKey}
                      className="bg-white text-black text-xs font-semibold rounded-xl"
                    >
                      {isAddingKey && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                      )}
                      Save Key
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Workspace tab */}
          {activeTab === "workspace" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <h1 className="text-2xl font-bold font-headline text-white mb-1">
                  Workspace Settings
                </h1>
                <p className="text-xs text-white/50">
                  Manage name, slug, and general preferences for your active
                  workspace.
                </p>
              </div>
              <div className="bg-[#151519]/90 border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl divide-y divide-white/[0.06]">
                <div className="p-5 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-white mb-0.5">
                      Workspace Name
                    </h4>
                    <p className="text-[11.5px] text-white/45">
                      The display name of your team workspace.
                    </p>
                  </div>
                  <Input
                    defaultValue={`${userName}'s Studio`}
                    className="bg-white/[0.04] border-white/10 text-xs text-white w-48 rounded-xl"
                  />
                </div>
                <div className="p-5 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-white mb-0.5">
                      Workspace Slug
                    </h4>
                    <p className="text-[11.5px] text-white/45">
                      URL identifier for team workspace links.
                    </p>
                  </div>
                  <span className="text-xs text-white/70 font-mono">
                    meshwork-studio-main
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Plans tab */}
          {activeTab === "plans" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <h1 className="text-2xl font-bold font-headline text-white mb-1">
                  Plans & Credit Usage
                </h1>
                <p className="text-xs text-white/50">
                  View your current plan, monthly AI credits, and billing
                  details.
                </p>
              </div>
              <div className="bg-[#151519]/90 border border-white/[0.08] rounded-2xl p-6 shadow-2xl space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      Pro Plan Active
                    </span>
                    <h3 className="text-lg font-bold text-white mt-2">
                      Meshwork Studio Pro
                    </h3>
                  </div>
                  <Button className="bg-white text-black hover:bg-white/90 text-xs font-semibold rounded-xl">
                    Upgrade Plan
                  </Button>
                </div>
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/60">Monthly AI Credits</span>
                    <span className="text-white font-semibold">
                      850 / 1,000 credits used
                    </span>
                  </div>
                  <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                    <div className="bg-gradient-to-r from-orange-500 to-purple-600 h-full w-[85%]" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Security tab */}
          {activeTab === "security" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <h1 className="text-2xl font-bold font-headline text-white mb-1">
                  Privacy & Security
                </h1>
                <p className="text-xs text-white/50">
                  Manage your password, authentication, and data retention.
                </p>
              </div>
              <div className="bg-[#151519]/90 border border-white/[0.08] rounded-2xl p-6 shadow-2xl space-y-4">
                <h3 className="text-sm font-semibold text-white">
                  Change Password
                </h3>
                <div className="space-y-3 max-w-md">
                  <div>
                    <label className="text-xs text-white/60 mb-1 block">
                      Current Password
                    </label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="bg-white/[0.04] border-white/10 text-xs text-white rounded-xl pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                      >
                        {showPassword ? (
                          <EyeSlashIcon className="w-4 h-4" />
                        ) : (
                          <EyeIcon className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-white/60 mb-1 block">
                      New Password
                    </label>
                    <div className="relative">
                      <Input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="bg-white/[0.04] border-white/10 text-xs text-white rounded-xl pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                      >
                        {showNewPassword ? (
                          <EyeSlashIcon className="w-4 h-4" />
                        ) : (
                          <EyeIcon className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-white/60 mb-1 block">
                      Confirm New Password
                    </label>
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="bg-white/[0.04] border-white/10 text-xs text-white rounded-xl"
                    />
                  </div>
                  <Button
                    onClick={handleChangePassword}
                    disabled={isChangingPassword}
                    className="bg-white text-black hover:bg-white/90 text-xs font-semibold rounded-xl"
                  >
                    {isChangingPassword && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                    )}
                    Update Password
                  </Button>
                </div>
              </div>
              <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 shadow-2xl space-y-4">
                <h3 className="text-sm font-semibold text-red-400">
                  Danger Zone
                </h3>
                <p className="text-xs text-white/50">
                  Permanently remove your account and all associated workspace
                  data.
                </p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      className="text-xs rounded-xl"
                    >
                      Delete Account
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-[#151519] border-white/10 text-white">
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Are you absolutely sure?
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-white/60 text-xs">
                        This action cannot be undone. Type DELETE to confirm:
                      </AlertDialogDescription>
                      <Input
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder="DELETE"
                        className="bg-white/[0.04] border-white/10 text-xs text-white mt-2"
                      />
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="bg-white/10 text-white hover:bg-white/20 border-0">
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDeleteAccount}
                        disabled={isDeletingAccount}
                        className="bg-red-600 hover:bg-red-700 text-white"
                      >
                        {isDeletingAccount ? "Deleting..." : "Delete Account"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}

          {/* Fallback for other tabs */}
          {!["account", "ai", "workspace", "plans", "security"].includes(
            activeTab,
          ) && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <h1 className="text-2xl font-bold font-headline text-white mb-1 capitalize">
                  {activeTab.replace("-", " ")}
                </h1>
                <p className="text-xs text-white/50">
                  Configure settings and preferences for {activeTab}.
                </p>
              </div>
              <div className="bg-[#151519]/90 border border-white/[0.08] rounded-2xl p-8 text-center space-y-3">
                <SparklesIcon className="w-8 h-8 text-white/20 mx-auto" />
                <h3 className="text-sm font-semibold text-white">
                  Setting Enabled & Up to Date
                </h3>
                <p className="text-xs text-white/40 max-w-md mx-auto">
                  Configurations for {activeTab} are automatically managed for
                  your active Meshwork Studio workspace.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
