import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { aiService, type ApiKey, type Provider } from "@/lib/ai";
import {
  ArrowPathIcon as Loader2,
  UserIcon as User,
  LockClosedIcon as Lock,
  TrashIcon as Trash2,
  ArrowDownTrayIcon as Download,
  ExclamationTriangleIcon as AlertTriangle,
  EyeIcon as Eye,
  EyeSlashIcon as EyeOff,
  SunIcon as Sun,
  MoonIcon as Moon,
  ComputerDesktopIcon as Monitor,
  PlusIcon as Plus,
  KeyIcon as Key,
  CheckIcon as Check,
  XMarkIcon as X,
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
import { cn } from "@/lib/utils";
import { PASSWORD_POLICY, validatePasswordStrength } from "@shared/auth";

export default function Settings() {
  const { user, logout } = useAuth();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { toast } = useToast();
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isDeletingData, setIsDeletingData] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "profile" | "appearance" | "ai" | "security" | "data"
  >("profile");

  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteDataConfirmText, setDeleteDataConfirmText] = useState("");

  // AI API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  const [isAddingKey, setIsAddingKey] = useState(false);
  const [newKeyProvider, setNewKeyProvider] = useState("openai");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [showNewKey, setShowNewKey] = useState(false);

  // Load API keys on mount
  useEffect(() => {
    loadApiKeys();
    loadProviders();
  }, []);

  const loadApiKeys = async () => {
    setIsLoadingKeys(true);
    try {
      const keys = await aiService.getApiKeys();
      setApiKeys(keys);
    } catch (error) {
      console.error("Failed to load API keys:", error);
    } finally {
      setIsLoadingKeys(false);
    }
  };

  const loadProviders = async () => {
    try {
      const providerList = await aiService.getProviders();
      setProviders(providerList);
    } catch (error) {
      console.error("Failed to load providers:", error);
    }
  };

  const handleAddKey = async () => {
    if (!newKeyValue.trim()) {
      toast({
        title: "Error",
        description: "Please enter an API key",
        variant: "destructive",
      });
      return;
    }

    setIsAddingKey(true);
    try {
      await aiService.saveApiKey(newKeyProvider, newKeyValue);
      toast({
        title: "Success",
        description: "API key added successfully",
      });
      setNewKeyValue("");
      setShowNewKey(false);
      loadApiKeys();
    } catch (error) {
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
      toast({
        title: "Success",
        description: "API key deleted",
      });
      loadApiKeys();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete API key",
        variant: "destructive",
      });
    }
  };

  const themeButtons = [
    { value: "light" as const, icon: Sun, label: "Light" },
    { value: "dark" as const, icon: Moon, label: "Dark" },
    { value: "system" as const, icon: Monitor, label: "System" },
  ];

  const handleUpdateProfile = async () => {
    setIsUpdatingProfile(true);
    try {
      const res = await apiRequest("PATCH", "/api/v1/user/profile", {
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
      });
      if (!res.ok) throw new Error("Failed to update profile");
      const updatedUser = await res.json();
      queryClient.setQueryData(["/api/v1/auth/me"], updatedUser);
      toast({
        title: "Profile updated",
        description: "Your changes have been saved.",
      });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure your new passwords match.",
        variant: "destructive",
      });
      return;
    }
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      toast({
        title: "Password does not meet requirements",
        description: passwordValidation.errors[0],
        variant: "destructive",
      });
      return;
    }
    setIsChangingPassword(true);
    try {
      const res = await apiRequest("POST", "/api/v1/user/change-password", {
        currentPassword,
        newPassword,
      });
      if (!res.ok) throw new Error("Failed to change password");
      toast({
        title: "Password changed",
        description: "Your password has been updated.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: unknown) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") {
      toast({
        title: "Confirmation required",
        description: "Please type DELETE to confirm.",
        variant: "destructive",
      });
      return;
    }
    setIsDeletingAccount(true);
    try {
      const res = await apiRequest("DELETE", "/api/v1/user/account");
      if (!res.ok) throw new Error("Failed to delete account");
      toast({
        title: "Account deleted",
        description: "Your account has been permanently removed.",
      });
      logout();
    } catch (error: unknown) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
      setIsDeletingAccount(false);
    }
  };

  const handleDeleteAllData = async () => {
    if (deleteDataConfirmText !== "DELETE ALL") {
      toast({
        title: "Confirmation required",
        description: "Please type DELETE ALL to confirm.",
        variant: "destructive",
      });
      return;
    }
    setIsDeletingData(true);
    try {
      const res = await apiRequest("DELETE", "/api/v1/user/data");
      if (!res.ok) throw new Error("Failed to delete data");
      toast({
        title: "Data deleted",
        description: "All your workspaces and projects have been removed.",
      });
      setDeleteDataConfirmText("");
    } catch (error: unknown) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsDeletingData(false);
    }
  };

  const handleExportData = () => {
    toast({
      title: "Export requested",
      description:
        "We're preparing your data. You'll receive an email when it's ready.",
    });
  };

  return (
    <div className="max-w-5xl mx-auto pb-12 relative">
      <Helmet>
        <title>Settings — Meshwork Studio</title>
      </Helmet>
      {/* Background - negative margins to break out of parent padding */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_49.5%,currentColor_49.5%,currentColor_50.5%,transparent_50.5%),linear-gradient(-45deg,transparent_49.5%,currentColor_49.5%,currentColor_50.5%,transparent_50.5%)] [background-size:40px_40px] opacity-[0.02]" />
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-gradient-radial from-amber-500/5 via-transparent to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-[400px] h-[400px] bg-gradient-radial from-rose-500/5 via-transparent to-transparent rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <div className="mb-8 px-4 md:px-0 mt-8">
        <h1 className="text-3xl md:text-4xl font-sans font-semibold tracking-tight text-foreground mb-2">
          Settings
        </h1>
        <p className="text-muted-foreground">
          Manage your account, appearance, and data preferences.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-8 px-4 md:px-0">
        {/* Sidebar Navigation */}
        <nav className="w-full md:w-64 flex-shrink-0 space-y-1">
          <button
            onClick={() => setActiveTab("profile")}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
              activeTab === "profile"
                ? "bg-white/[0.08] text-white"
                : "text-white/60 hover:text-white hover:bg-white/[0.04]",
            )}
          >
            <User className="w-4 h-4" /> Profile
          </button>
          <button
            onClick={() => setActiveTab("appearance")}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
              activeTab === "appearance"
                ? "bg-white/[0.08] text-white"
                : "text-white/60 hover:text-white hover:bg-white/[0.04]",
            )}
          >
            <Sun className="w-4 h-4" /> Appearance
          </button>
          <button
            onClick={() => setActiveTab("ai")}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
              activeTab === "ai"
                ? "bg-white/[0.08] text-white"
                : "text-white/60 hover:text-white hover:bg-white/[0.04]",
            )}
          >
            <Key className="w-4 h-4" /> AI API Keys
          </button>
          {user?.authProvider === "email" && (
            <button
              onClick={() => setActiveTab("security")}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
                activeTab === "security"
                  ? "bg-white/[0.08] text-white"
                  : "text-white/60 hover:text-white hover:bg-white/[0.04]",
              )}
            >
              <Lock className="w-4 h-4" /> Security
            </button>
          )}
          <button
            onClick={() => setActiveTab("data")}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all text-red-400 hover:text-red-300",
              activeTab === "data" ? "bg-red-500/10" : "hover:bg-red-500/5",
            )}
          >
            <Trash2 className="w-4 h-4" /> Data & Privacy
          </button>
        </nav>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0">
          {activeTab === "ai" && (
            <Card className="bg-[#121214]/60 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_8px_32px_rgba(0,0,0,0.5)] rounded-2xl">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Key className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-semibold">
                      AI API Keys
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Manage your AI provider API keys (BYOK)
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-6">
                {/* Add new key section */}
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <select
                      value={newKeyProvider}
                      onChange={(e) => setNewKeyProvider(e.target.value)}
                      className="h-10 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/[0.15] focus-visible:bg-white/[0.05]"
                    >
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex-1 relative">
                      <Input
                        type={showNewKey ? "text" : "password"}
                        value={newKeyValue}
                        onChange={(e) => setNewKeyValue(e.target.value)}
                        placeholder="Enter API key"
                        className="pr-10 bg-white/[0.03] border-white/[0.08] text-white/90 focus-visible:ring-white/[0.15] focus-visible:bg-white/[0.05] rounded-xl"
                      />
                      <button
                        onClick={() => setShowNewKey(!showNewKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showNewKey ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <Button onClick={handleAddKey} disabled={isAddingKey}>
                      {isAddingKey ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      Add
                    </Button>
                  </div>
                </div>

                {/* Existing keys list */}
                {isLoadingKeys ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : apiKeys.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No API keys stored. Add your first key above.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {apiKeys.map((key) => (
                      <div
                        key={key.id}
                        className="flex items-center justify-between p-3 rounded-xl border border-white/[0.06] bg-white/[0.03]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                            <Key className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-sm capitalize">
                              {key.provider}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {key.keyHint}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                            Active
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteKey(key.id)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Appearance */}
          {activeTab === "appearance" && (
            <Card className="bg-[#121214]/60 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_8px_32px_rgba(0,0,0,0.5)] rounded-2xl">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    {resolvedTheme === "dark" ? (
                      <Moon className="w-5 h-5 text-primary" />
                    ) : (
                      <Sun className="w-5 h-5 text-primary" />
                    )}
                  </div>
                  <div>
                    <CardTitle className="text-lg font-semibold">
                      Appearance
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Choose your preferred theme
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex gap-1 p-1 bg-white/[0.03] border border-white/[0.06] rounded-xl w-fit">
                  {themeButtons.map(({ value, icon: Icon, label }) => (
                    <button
                      key={value}
                      onClick={() => setTheme(value)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all",
                        theme === value
                          ? "bg-[#121214]/80 text-white shadow-[0_2px_8px_rgba(0,0,0,0.5)] border border-white/[0.08]"
                          : "text-white/40 hover:text-white/80",
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Profile */}
          {activeTab === "profile" && (
            <Card className="bg-[#121214]/60 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_8px_32px_rgba(0,0,0,0.5)] rounded-2xl">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-semibold">
                      Profile
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Update your personal information
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-6">
                <div className="flex items-center gap-4">
                  <Avatar className="w-14 h-14 border border-white/[0.08]">
                    <AvatarImage src={user?.profileImageUrl || undefined} />
                    <AvatarFallback className="bg-muted text-foreground font-semibold">
                      {user?.firstName?.[0] || user?.email?.[0] || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-sm">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {user?.email}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First name</Label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="John"
                      className="bg-white/[0.03] border-white/[0.08] text-white/90 focus-visible:ring-white/[0.15] focus-visible:bg-white/[0.05] rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                      className="bg-white/[0.03] border-white/[0.08] text-white/90 focus-visible:ring-white/[0.15] focus-visible:bg-white/[0.05] rounded-xl"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleUpdateProfile}
                  disabled={isUpdatingProfile}
                  className="w-full"
                >
                  {isUpdatingProfile ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save changes"
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Security */}
          {activeTab === "security" && user?.authProvider === "email" && (
            <Card className="bg-[#121214]/60 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_8px_32px_rgba(0,0,0,0.5)] rounded-2xl">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-semibold">
                      Security
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Change your password
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current password</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="pr-10 bg-white/[0.03] border-white/[0.08] text-white/90 focus-visible:ring-white/[0.15] focus-visible:bg-white/[0.05] rounded-xl"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">New password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={`At least ${PASSWORD_POLICY.minLength} characters`}
                      className="pr-10 bg-white/[0.03] border-white/[0.08] text-white/90 focus-visible:ring-white/[0.15] focus-visible:bg-white/[0.05] rounded-xl"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showNewPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  <div className="mt-2 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                      Requirements:
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <div
                        className={`flex items-center text-[10px] ${newPassword.length >= PASSWORD_POLICY.minLength ? "text-green-500" : "text-muted-foreground"}`}
                      >
                        <div
                          className={`w-1.5 h-1.5 rounded-full mr-2 ${newPassword.length >= PASSWORD_POLICY.minLength ? "bg-green-500" : "bg-muted/30 border border-muted-foreground/30"}`}
                        />
                        {PASSWORD_POLICY.minLength}+ chars
                      </div>
                      <div
                        className={`flex items-center text-[10px] ${/[A-Z]/.test(newPassword) ? "text-green-500" : "text-muted-foreground"}`}
                      >
                        <div
                          className={`w-1.5 h-1.5 rounded-full mr-2 ${/[A-Z]/.test(newPassword) ? "bg-green-500" : "bg-muted/30 border border-muted-foreground/30"}`}
                        />
                        Uppercase
                      </div>
                      <div
                        className={`flex items-center text-[10px] ${/[a-z]/.test(newPassword) ? "text-green-500" : "text-muted-foreground"}`}
                      >
                        <div
                          className={`w-1.5 h-1.5 rounded-full mr-2 ${/[a-z]/.test(newPassword) ? "bg-green-500" : "bg-muted/30 border border-muted-foreground/30"}`}
                        />
                        Lowercase
                      </div>
                      <div
                        className={`flex items-center text-[10px] ${/\d/.test(newPassword) ? "text-green-500" : "text-muted-foreground"}`}
                      >
                        <div
                          className={`w-1.5 h-1.5 rounded-full mr-2 ${/\d/.test(newPassword) ? "bg-green-500" : "bg-muted/30 border border-muted-foreground/30"}`}
                        />
                        Number
                      </div>
                      <div
                        className={`flex items-center text-[10px] ${/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword) ? "text-green-500" : "text-muted-foreground"}`}
                      >
                        <div
                          className={`w-1.5 h-1.5 rounded-full mr-2 ${/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword) ? "bg-green-500" : "bg-muted/30 border border-muted-foreground/30"}`}
                        />
                        Special Char
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm new password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="bg-white/[0.03] border-white/[0.08] text-white/90 focus-visible:ring-white/[0.15] focus-visible:bg-white/[0.05] rounded-xl"
                  />
                </div>

                <Button
                  onClick={handleChangePassword}
                  disabled={
                    isChangingPassword ||
                    !currentPassword ||
                    !newPassword ||
                    !confirmPassword
                  }
                  className="w-full"
                >
                  {isChangingPassword ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Changing...
                    </>
                  ) : (
                    "Change password"
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Data & Privacy */}
          {activeTab === "data" && (
            <Card className="bg-[#121214]/60 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_8px_32px_rgba(0,0,0,0.5)] rounded-2xl">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Download className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-semibold">
                      Data & Privacy
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Manage your data and account
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl border border-white/[0.06] bg-white/[0.03]">
                  <div>
                    <h3 className="font-medium text-sm">Export your data</h3>
                    <p className="text-xs text-muted-foreground">
                      Download all your workspaces and projects
                    </p>
                  </div>
                  <Button
                    onClick={handleExportData}
                    variant="outline"
                    size="sm"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                  <div>
                    <h3 className="font-medium text-sm text-destructive">
                      Delete all data
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Remove all workspaces. Account stays active.
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-[#121214]/95 backdrop-blur-2xl border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_24px_80px_rgba(0,0,0,0.8)] rounded-2xl">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                          <AlertTriangle className="w-5 h-5" />
                          Delete all data?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-sm">
                          This will permanently delete all your workspaces and
                          projects. Your account will remain active.
                          <br />
                          <br />
                          Type <strong>DELETE ALL</strong> to confirm.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <Input
                        value={deleteDataConfirmText}
                        onChange={(e) =>
                          setDeleteDataConfirmText(e.target.value)
                        }
                        placeholder="DELETE ALL"
                        className="border-red-500/30 bg-red-500/5 text-white/90 focus-visible:ring-red-500/20 rounded-xl"
                      />
                      <AlertDialogFooter>
                        <AlertDialogCancel
                          onClick={() => setDeleteDataConfirmText("")}
                        >
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDeleteAllData}
                          disabled={
                            isDeletingData ||
                            deleteDataConfirmText !== "DELETE ALL"
                          }
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {isDeletingData ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Deleting...
                            </>
                          ) : (
                            "Delete all data"
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-red-500/10 border border-red-500/30">
                  <div>
                    <h3 className="font-medium text-sm text-destructive">
                      Delete account
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Permanently delete your account and all data
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-[#121214]/95 backdrop-blur-2xl border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_24px_80px_rgba(0,0,0,0.8)] rounded-2xl">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                          <AlertTriangle className="w-5 h-5" />
                          Delete account?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-sm">
                          This cannot be undone. Your account and all data will
                          be permanently removed.
                          <br />
                          <br />
                          Type <strong>DELETE</strong> to confirm.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <Input
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder="DELETE"
                        className="border-red-500/30 bg-red-500/5 text-white/90 focus-visible:ring-red-500/20 rounded-xl"
                      />
                      <AlertDialogFooter>
                        <AlertDialogCancel
                          onClick={() => setDeleteConfirmText("")}
                        >
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDeleteAccount}
                          disabled={
                            isDeletingAccount || deleteConfirmText !== "DELETE"
                          }
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {isDeletingAccount ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Deleting...
                            </>
                          ) : (
                            "Delete account"
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
