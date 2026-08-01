import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertWorkspaceSchema } from "@shared/schema";
import { useCreateWorkspace, useWorkspaces } from "@/hooks/use-workspaces";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  ArrowPathIcon,
  ServerIcon,
  GlobeAltIcon,
  CubeIcon,
  CircleStackIcon,
  ShieldCheckIcon,
  ShareIcon,
  CpuChipIcon,
  CloudIcon,
  CodeBracketIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { MeshworkLogo } from "@/components/MeshworkLogo";

const FREE_TIER_LIMIT = 3;

const formSchema = insertWorkspaceSchema.pick({
  title: true,
  type: true,
  icon: true,
});

type FormValues = z.infer<typeof formSchema>;

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Curated set of 8 icons — clean, not overwhelming
const PROJECT_ICONS = [
  { id: "box", Icon: CubeIcon, label: "Default" },
  { id: "server", Icon: ServerIcon, label: "Server" },
  { id: "globe", Icon: GlobeAltIcon, label: "Web" },
  { id: "database", Icon: CircleStackIcon, label: "Data" },
  { id: "code", Icon: CodeBracketIcon, label: "Code" },
  { id: "cpu", Icon: CpuChipIcon, label: "System" },
  { id: "cloud", Icon: CloudIcon, label: "Cloud" },
  { id: "shield", Icon: ShieldCheckIcon, label: "Security" },
  { id: "git", Icon: ShareIcon, label: "Version" },
];

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: CreateWorkspaceDialogProps) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const createWorkspace = useCreateWorkspace();
  const { data: workspaces } = useWorkspaces();

  const isAtLimit = (workspaces?.length ?? 0) >= FREE_TIER_LIMIT;

  const [selectedIcon, setSelectedIcon] = useState("box");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", type: "system" },
  });

  const handleClose = () => {
    form.reset();
    setSelectedIcon("box");
    onOpenChange(false);
  };

  const onSubmit = (values: FormValues) => {
    if (!user) return;

    createWorkspace.mutate(
      {
        ...values,
        type: "system",
        userId: user.id,
        icon: selectedIcon,
        groups: [],
        tags: [],
      },
      {
        onSuccess: (newWorkspace) => {
          toast({
            title: "Workspace created",
            description: `"${values.title}" is ready.`,
          });
          handleClose();
          setLocation(`/workspace/${newWorkspace.id}`);
        },
        onError: () => {
          toast({
            title: "Failed to create",
            description: "Something went wrong. Try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const SelectedIconComp =
    PROJECT_ICONS.find((i) => i.id === selectedIcon)?.Icon ?? CubeIcon;
  const titleValue = form.watch("title");

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="p-0 gap-0 max-w-[420px] w-full overflow-hidden bg-[#0E0E0E] border border-[#252525] shadow-[0_32px_64px_rgba(0,0,0,0.7)] rounded-2xl tracking-tight text-white font-body"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {isAtLimit ? (
          /* ── Free tier limit reached ──────────────────────────────────── */
          <div className="px-6 py-10 flex flex-col items-center text-center gap-5">
            <div className="w-10 h-10">
              <MeshworkLogo />
            </div>
            <div>
              <h3
                className="text-base font-semibold text-white mb-1.5"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                Workspace limit reached
              </h3>
              <p className="text-sm text-white/35 leading-relaxed max-w-xs mx-auto">
                Free accounts are limited to {FREE_TIER_LIMIT} workspaces.
                Delete an existing workspace to create a new one, or upgrade for
                unlimited access.
              </p>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-[12px] font-medium text-[#888] hover:text-white rounded-lg hover:bg-white/5 transition-all"
              >
                Go back
              </button>
              <button
                className="px-5 py-2 text-[12px] font-semibold bg-primary text-white rounded-lg hover:brightness-110 transition-all opacity-50 cursor-not-allowed"
                disabled
              >
                Upgrade — Coming soon
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Preview Card ──────────────────────────────────────────── */}
            <div className="px-6 pt-6 pb-5">
              <div className="flex items-start gap-4">
                {/* Live icon preview */}
                <div
                  className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300",
                    "bg-[#1A1A1A] border border-[#2A2A2A]",
                  )}
                >
                  <SelectedIconComp className="w-5 h-5 text-white/70" />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <input
                    {...form.register("title")}
                    placeholder="Workspace name"
                    autoFocus
                    className={cn(
                      "w-full bg-transparent border-none p-0 font-sans font-bold text-[17px] text-white",
                      "placeholder:text-[#555] placeholder:font-normal",
                      "focus:outline-none caret-primary",
                    )}
                  />
                  <p className="text-[11px] text-[#555] mt-1 font-body">
                    {titleValue
                      ? `${titleValue.length}/16 characters`
                      : "Give your workspace a name"}
                  </p>
                </div>
              </div>

              {form.formState.errors.title && (
                <p className="text-primary text-[11px] mt-2 ml-16">
                  {form.formState.errors.title.message}
                </p>
              )}
            </div>

            {/* ── Divider ───────────────────────────────────────────────── */}
            <div className="h-px bg-[#1E1E1E] mx-4" />

            {/* ── Icon Selection ────────────────────────────────────────── */}
            <div className="px-6 py-4">
              <p className="text-[11px] text-[#666] font-medium mb-3">Icon</p>
              <div className="flex gap-1.5">
                {PROJECT_ICONS.map(({ id, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelectedIcon(id)}
                    className={cn(
                      "w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200 cursor-figma-pointer",
                      selectedIcon === id
                        ? "bg-white/10 text-white ring-1 ring-white/20"
                        : "text-[#555] hover:text-white/70 hover:bg-white/5",
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>

            {/* ── Divider ───────────────────────────────────────────────── */}
            <div className="h-px bg-[#1E1E1E] mx-4" />

            {/* ── Templates link ────────────────────────────────────────── */}
            <Link href="/templates" onClick={() => onOpenChange(false)}>
              <div className="mx-4 my-3 flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/[0.03] transition-colors cursor-figma-pointer group">
                <span className="text-[12px] text-[#666] group-hover:text-[#888] transition-colors">
                  Or start from a template
                </span>
                <ChevronRightIcon className="w-3.5 h-3.5 text-[#444] group-hover:text-[#666] transition-colors" />
              </div>
            </Link>

            {/* ── Footer ────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-2 px-5 py-4 bg-[#0A0A0A] border-t border-[#1A1A1A]">
              <span className="text-[10px] text-[#444]">
                {workspaces?.length ?? 0}/{FREE_TIER_LIMIT} workspaces used
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-[12px] font-medium text-[#888] hover:text-white rounded-lg hover:bg-white/5 transition-all cursor-figma-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={form.handleSubmit(onSubmit)}
                  disabled={createWorkspace.isPending}
                  className={cn(
                    "bg-primary text-white text-[12px] font-semibold px-5 py-2 rounded-lg transition-all duration-200 flex items-center gap-2 cursor-figma-pointer",
                    "hover:brightness-110 hover:shadow-md",
                    "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:brightness-100",
                  )}
                >
                  {createWorkspace.isPending ? (
                    <>
                      <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create"
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
