import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import {
  Users,
  Plus,
  Copy,
  Check,
  LogOut,
  Trash2,
  RefreshCw,
  ArrowRight,
  Crown,
  Share2,
  ExternalLink,
  Calendar,
  UserMinus,
  Loader2,
  Box,
  Server,
  Globe,
  Database,
  Shield,
  GitBranch,
  Zap,
  Cpu,
  Network,
  Cloud,
  Lock,
  BarChart3,
  Code2,
  Wifi,
  LayoutGrid,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  useTeams,
  useTeam,
  useCreateTeam,
  useJoinTeam,
  useLeaveTeam,
  useDeleteTeam,
  useRegenerateInviteCode,
  useShareWorkspace,
  useTeamWorkspaces,
} from "@/hooks/use-teams";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─── Icon Map ────────────────────────────────────────────────────────
const ICON_MAP: Record<string, LucideIcon> = {
  server: Server,
  globe: Globe,
  box: Box,
  database: Database,
  shield: Shield,
  git: GitBranch,
  zap: Zap,
  cpu: Cpu,
  network: Network,
  cloud: Cloud,
  lock: Lock,
  chart: BarChart3,
  code: Code2,
  wifi: Wifi,
  grid: LayoutGrid,
};
function getWsIcon(iconId?: string | null): LucideIcon {
  return ICON_MAP[iconId || "box"] || Box;
}

// ─── Motion Variants ─────────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  },
};

export default function Team() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: teams, isLoading } = useTeams();
  const { data: workspaces } = useWorkspaces();

  const createTeam = useCreateTeam();
  const joinTeam = useJoinTeam();
  const leaveTeam = useLeaveTeam();
  const deleteTeam = useDeleteTeam();
  const regenerateCode = useRegenerateInviteCode();
  const shareWorkspace = useShareWorkspace();

  const [newTeamName, setNewTeamName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    action: () => Promise<void>;
  } | null>(null);

  const { data: teamDetail, isLoading: isDetailLoading } =
    useTeam(selectedTeamId);
  const { data: teamWorkspaces } = useTeamWorkspaces(selectedTeamId);

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    try {
      const team = await createTeam.mutateAsync(newTeamName.trim());
      setNewTeamName("");
      setShowCreateForm(false);
      setSelectedTeamId(team.id);
      toast({
        title: "Team created",
        description: "Your collaborative space is ready.",
      });
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleJoinTeam = async () => {
    if (!joinCode.trim()) return;
    try {
      await joinTeam.mutateAsync(joinCode.trim());
      setJoinCode("");
      toast({ title: "Joined!", description: "You're now part of the team." });
    } catch (err: unknown) {
      toast({
        title: "Failed to join",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleShareWorkspace = async (workspaceId: number) => {
    if (!selectedTeamId) return;
    try {
      await shareWorkspace.mutateAsync({ teamId: selectedTeamId, workspaceId });
      toast({
        title: "Shared",
        description: "All team members can now access this workspace.",
      });
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const triggerConfirm = (
    title: string,
    description: string,
    action: () => Promise<void>,
  ) => {
    setConfirmAction({ title, description, action });
  };

  const unsharedWorkspaces =
    workspaces?.filter(
      (ws) => !teamWorkspaces?.some((tw) => tw.id === ws.id),
    ) || [];

  return (
    <>
      <Helmet>
        <title>Team — Meshwork Studio</title>
      </Helmet>
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        className="w-full max-w-5xl mx-auto px-6 pt-16 pb-24"
      >
        {/* ─── Page Header ─── */}
        <motion.div variants={itemVariants} className="mb-12">
          <h1
            className="text-3xl font-bold tracking-tight text-white leading-none"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            Teams
          </h1>
          <p className="text-sm text-white/30 mt-2 max-w-md">
            Manage your teams, invite members, and share workspaces.
          </p>
        </motion.div>

        {/* ─── Actions Row ─── */}
        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row gap-4 mb-16"
        >
          {/* Join */}
          <div className="flex items-center gap-2 flex-1 max-w-xs">
            <div className="relative flex-1">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleJoinTeam()}
                placeholder="Enter invite code"
                className="w-full bg-white/[0.02] border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white font-mono placeholder:text-white/15 focus:outline-none focus:border-primary/40 transition-colors tracking-wider"
                maxLength={8}
              />
            </div>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleJoinTeam}
              disabled={joinTeam.isPending || !joinCode.trim()}
              className="px-4 py-2.5 bg-white/[0.04] border border-white/[0.06] text-white/60 hover:text-white hover:border-white/20 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-30"
            >
              Join
            </motion.button>
          </div>

          <div className="sm:ml-auto">
            <motion.button
              whileHover={{
                scale: 1.03,
                boxShadow: "0 8px 32px rgba(26,115,232,0.25)",
              }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-black font-bold text-xs uppercase tracking-[0.12em] rounded-lg transition-all shadow-lg shadow-primary/20"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Team
            </motion.button>
          </div>
        </motion.div>

        {/* ─── Create Form (inline, not floating) ─── */}
        <AnimatePresence>
          {showCreateForm && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: "auto", marginBottom: 48 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              style={{ overflow: "hidden" }}
            >
              <div className="bg-white/[0.02] border border-primary/15 rounded-xl p-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/25 mb-4 font-sans">
                  New Team
                </p>
                <div className="flex gap-3">
                  <input
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateTeam()}
                    placeholder="Team name"
                    className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/15 focus:outline-none focus:border-primary/40 transition-colors"
                    maxLength={64}
                    autoFocus
                  />
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleCreateTeam}
                    disabled={createTeam.isPending || !newTeamName.trim()}
                    className="px-6 py-2.5 bg-primary text-black font-bold text-xs uppercase tracking-widest rounded-lg disabled:opacity-30 transition-all"
                  >
                    {createTeam.isPending ? "..." : "Create"}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Main Content ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* ─── Left: Team List ─── */}
          <motion.div variants={itemVariants} className="lg:col-span-4">
            <h3 className="text-xs font-bold font-sans tracking-[0.2em] uppercase text-[#555] mb-6">
              Your Teams
            </h3>

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-5 h-5 animate-spin text-white/15" />
              </div>
            ) : !teams || teams.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-12 h-12 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                  <Users className="w-5 h-5 text-white/10" />
                </div>
                <p
                  className="text-sm text-white/25 font-medium"
                  style={{ fontFamily: "var(--font-sans)" }}
                >
                  No teams yet
                </p>
                <p className="text-xs text-white/15 mt-1.5 max-w-[220px] mx-auto leading-relaxed">
                  Create a team to start sharing workspaces and collaborating
                  with others.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {teams.map((team) => (
                  <motion.button
                    key={team.id}
                    whileHover={{
                      scale: 1.015,
                      backgroundColor: "rgba(255,255,255,0.03)",
                    }}
                    whileTap={{ scale: 0.985 }}
                    onClick={() => setSelectedTeamId(team.id)}
                    className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                      selectedTeamId === team.id
                        ? "border-primary/30 bg-primary/[0.04]"
                        : "border-white/[0.04] bg-transparent hover:border-white/[0.08]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-sm font-semibold text-white truncate"
                            style={{ fontFamily: "var(--font-sans)" }}
                          >
                            {team.name}
                          </span>
                          {team.ownerId === user?.id && (
                            <Crown className="w-3 h-3 text-primary/60 flex-shrink-0" />
                          )}
                        </div>
                        <span className="text-[10px] text-white/20 mt-0.5 block">
                          {team.memberCount} member
                          {team.memberCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 ml-3">
                        <code className="text-[9px] font-mono text-white/15 tracking-wider">
                          {team.inviteCode}
                        </code>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyCode(team.inviteCode);
                          }}
                          className="p-1 rounded text-white/10 hover:text-primary transition-colors"
                        >
                          {copiedCode === team.inviteCode ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>

          {/* ─── Right: Detail Panel ─── */}
          <div className="lg:col-span-8">
            <AnimatePresence mode="wait">
              {selectedTeamId && isDetailLoading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="space-y-3">
                    <div className="h-7 w-48 bg-white/[0.03] rounded-lg animate-pulse" />
                    <div className="flex gap-3">
                      <div className="h-5 w-20 bg-white/[0.03] rounded animate-pulse" />
                      <div className="h-5 w-16 bg-white/[0.03] rounded animate-pulse" />
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-6">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className="h-16 bg-white/[0.02] rounded-lg animate-pulse"
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : selectedTeamId && teamDetail ? (
                <motion.div
                  key={selectedTeamId}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  {/* Team Name + Meta */}
                  <div className="flex items-start justify-between mb-8">
                    <div>
                      <h2
                        className="text-2xl font-extrabold tracking-tight text-white"
                        style={{ fontFamily: "var(--font-sans)" }}
                      >
                        {teamDetail.name}
                      </h2>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] text-white/20 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(
                            teamDetail.createdAt || Date.now(),
                          ).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Invite code bar */}
                      <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                        <code className="text-xs font-mono text-primary/70 tracking-widest">
                          {teamDetail.inviteCode}
                        </code>
                        <button
                          onClick={() => handleCopyCode(teamDetail.inviteCode)}
                          className="p-1.5 rounded text-white/20 hover:text-white hover:bg-white/[0.04] transition-all"
                          title="Copy invite code"
                        >
                          {copiedCode === teamDetail.inviteCode ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {teamDetail.ownerId === user?.id && (
                          <button
                            onClick={() =>
                              regenerateCode.mutate(selectedTeamId)
                            }
                            className="p-1.5 rounded text-white/20 hover:text-white hover:bg-white/[0.04] transition-all"
                            title="Regenerate invite code"
                          >
                            <RefreshCw
                              className={`w-3.5 h-3.5 ${regenerateCode.isPending ? "animate-spin" : ""}`}
                            />
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          const isOwner = teamDetail.ownerId === user?.id;
                          triggerConfirm(
                            isOwner ? "Delete this team?" : "Leave this team?",
                            isOwner
                              ? "This permanently deletes the team, removes all members, and unshares all workspaces."
                              : "You'll lose access to all workspaces shared with this team.",
                            async () => {
                              if (isOwner)
                                await deleteTeam.mutateAsync(selectedTeamId);
                              else
                                await leaveTeam.mutateAsync({
                                  teamId: selectedTeamId,
                                  userId: user!.id,
                                });
                              setSelectedTeamId(null);
                            },
                          );
                        }}
                        className="p-2 rounded-lg text-red-400/20 hover:text-red-400 hover:bg-red-400/[0.06] transition-all"
                      >
                        {teamDetail.ownerId === user?.id ? (
                          <Trash2 className="w-4 h-4" />
                        ) : (
                          <LogOut className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Members Section */}
                  <div className="mb-12">
                    <h3 className="text-xs font-bold font-sans tracking-[0.2em] uppercase text-[#555] mb-4 flex items-center gap-2">
                      <Users className="w-3.5 h-3.5" /> Members
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {teamDetail.members.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center gap-3 px-4 py-3 rounded-lg border border-white/[0.04] hover:border-white/[0.08] hover:bg-white/[0.015] transition-all group"
                        >
                          <div className="relative flex-shrink-0">
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold border-2"
                              style={{
                                borderColor: member.color,
                                backgroundColor: `${member.color}08`,
                                color: member.color,
                              }}
                            >
                              {member.profileImageUrl ? (
                                <img
                                  src={member.profileImageUrl}
                                  className="w-full h-full rounded-[5px] object-cover"
                                />
                              ) : (
                                (
                                  member.firstName?.[0] || member.email[0]
                                ).toUpperCase()
                              )}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-white/70 font-medium truncate">
                              {member.firstName || member.email.split("@")[0]}
                              {member.userId === user?.id && (
                                <span className="ml-1 text-[9px] text-white/15">
                                  (you)
                                </span>
                              )}
                            </p>
                            <p className="text-[9px] text-white/15 font-mono uppercase tracking-wider">
                              {member.role}
                            </p>
                          </div>
                          {member.role === "owner" ? (
                            <Crown className="w-3 h-3 text-primary/40 flex-shrink-0" />
                          ) : teamDetail.ownerId === user?.id &&
                            member.userId !== user?.id ? (
                            <button
                              onClick={() =>
                                triggerConfirm(
                                  `Remove ${member.firstName || member.email.split("@")[0]}?`,
                                  "They'll lose access to all shared workspaces.",
                                  async () => {
                                    await leaveTeam.mutateAsync({
                                      teamId: selectedTeamId,
                                      userId: member.userId,
                                    });
                                  },
                                )
                              }
                              className="p-1 rounded text-white/0 group-hover:text-white/15 hover:!text-red-400 transition-all flex-shrink-0"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Shared Workspaces Section */}
                  <div className="mb-12">
                    <h3 className="text-xs font-bold font-sans tracking-[0.2em] uppercase text-[#555] mb-4 flex items-center gap-2">
                      <Share2 className="w-3.5 h-3.5" /> Shared Workspaces
                    </h3>
                    {teamWorkspaces && teamWorkspaces.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {teamWorkspaces.map((ws) => {
                          const WsIcon = getWsIcon(ws.icon);
                          return (
                            <Link key={ws.id} href={`/workspace/${ws.id}`}>
                              <motion.div
                                whileHover={{
                                  scale: 1.02,
                                  borderColor: "rgba(26,115,232,0.25)",
                                }}
                                whileTap={{ scale: 0.985 }}
                                className="flex items-center gap-3 px-4 py-3 rounded-lg border border-white/[0.04] transition-all cursor-pointer group"
                              >
                                <div className="w-8 h-8 rounded-lg bg-white/[0.03] flex items-center justify-center flex-shrink-0 group-hover:bg-primary/[0.08] transition-colors">
                                  <WsIcon className="w-3.5 h-3.5 text-white/20 group-hover:text-primary transition-colors" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-white/80 group-hover:text-white truncate transition-colors">
                                    {ws.title}
                                  </p>
                                  <p className="text-[9px] text-white/12 uppercase tracking-wider">
                                    {ws.type}
                                  </p>
                                </div>
                                <ExternalLink className="w-3.5 h-3.5 text-white/0 group-hover:text-primary/40 transition-all flex-shrink-0" />
                              </motion.div>
                            </Link>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="border border-dashed border-white/[0.04] rounded-lg py-10 text-center">
                        <p className="text-[10px] text-white/12 uppercase tracking-widest">
                          No workspaces shared yet
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Share Picker */}
                  {unsharedWorkspaces.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold font-sans tracking-[0.2em] uppercase text-[#555] mb-4 flex items-center gap-2">
                        <Plus className="w-3.5 h-3.5" /> Share a Workspace
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {unsharedWorkspaces.map((ws) => (
                          <motion.button
                            key={ws.id}
                            whileHover={{
                              scale: 1.02,
                              borderColor: "rgba(26,115,232,0.2)",
                            }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => handleShareWorkspace(ws.id)}
                            className="flex items-center gap-2 px-3 py-2.5 border border-white/[0.04] rounded-lg text-left transition-all group"
                          >
                            <Plus className="w-3 h-3 text-white/10 group-hover:text-primary transition-colors flex-shrink-0" />
                            <span className="text-[11px] text-white/25 truncate group-hover:text-white/60 transition-colors">
                              {ws.title}
                            </span>
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center text-center py-24"
                >
                  <Users className="w-10 h-10 text-white/[0.04] mb-4" />
                  <p className="text-xs text-white/15 uppercase tracking-[0.15em] font-sans font-bold">
                    Select a team
                  </p>
                  <p className="text-[11px] text-white/10 mt-1 max-w-[200px]">
                    Pick a team from the left to manage members and workspaces.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* ─── Confirm Dialog ─── */}
      <AlertDialog
        open={!!confirmAction}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
      >
        <AlertDialogContent className="bg-[#111] border border-white/[0.08] rounded-xl shadow-2xl max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle
              className="text-white text-sm font-semibold"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {confirmAction?.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-white/30 text-xs leading-relaxed">
              {confirmAction?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-2">
            <AlertDialogCancel className="bg-white/[0.03] border-white/[0.06] text-white/40 hover:bg-white/[0.06] hover:text-white rounded-lg text-xs h-9">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await confirmAction?.action();
                  setConfirmAction(null);
                } catch (err) {
                  toast({
                    title: "Error",
                    description: err instanceof Error ? err.message : "Failed",
                    variant: "destructive",
                  });
                }
              }}
              className="bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-lg text-xs h-9"
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
