import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCollaborators } from "@/hooks/use-collaborators";

interface Props {
  workspaceId: string;
  isOwner: boolean;
  user: {
    id?: string;
    firstName?: string;
    email?: string;
    profileImageUrl?: string | null;
  } | null;
  online: { userId: string; name: string; color: string }[];
  onShare: () => void;
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?"
  );
}

export function WorkspaceMembers({
  workspaceId,
  isOwner,
  user,
  online,
  onShare,
}: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const { data, isLoading, isError, refetch, change } = useCollaborators(
    workspaceId,
    isOwner,
  );
  const name = user?.firstName || user?.email?.split("@")[0] || "You";
  const othersOnline = online.filter((person) => person.userId !== user?.id);
  const members = data?.collaborators ?? [];
  const shown = isOwner
    ? members.map((member) => ({
        id: member.userId,
        name:
          member.profile?.name ||
          member.profile?.email ||
          "Unavailable account",
        image: member.profile?.profileImageUrl,
      }))
    : othersOnline.map((person) => ({
        id: person.userId,
        name: person.name,
        image: null,
      }));

  async function update(action: Parameters<typeof change.mutateAsync>[0]) {
    setError("");
    try {
      await change.mutateAsync(action);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update access.",
      );
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setError("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={isOwner ? "Workspace members" : "People online"}
          className="flex min-h-8 items-center rounded-full px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00E5A0]"
        >
          <span className="flex -space-x-1.5">
            {[
              { id: user?.id || "self", name, image: user?.profileImageUrl },
              ...shown,
            ]
              .slice(0, 3)
              .map((person) => (
                <Avatar
                  key={person.id}
                  className="size-7 border-2 border-[#171719]"
                >
                  <AvatarImage src={person.image || undefined} alt="" />
                  <AvatarFallback className="bg-indigo-500 text-[9px] font-semibold text-white">
                    {initials(person.name)}
                  </AvatarFallback>
                </Avatar>
              ))}
            {shown.length > 2 && (
              <span className="flex size-7 items-center justify-center rounded-full border-2 border-[#171719] bg-slate-600 text-[9px] font-semibold text-white">
                +{shown.length - 2}
              </span>
            )}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="workspace-popover z-[200] w-[min(360px,calc(100vw-2rem))] rounded-2xl border ws-border ws-option p-0 ws-ink shadow-xl"
      >
        <div className="px-5 pb-3 pt-5">
          <h2 className="text-base font-semibold">
            {isOwner ? "Members" : "People online"}
          </h2>
          <p className="mt-0.5 text-xs ws-muted">
            {isOwner
              ? isLoading
                ? "Loading members…"
                : isError
                  ? "Members unavailable"
                  : `${members.length + 1} ${members.length === 0 ? "person" : "people"}`
              : "People currently in this workspace"}
          </p>
        </div>
        <div className="max-h-[min(360px,55vh)] overflow-y-auto px-2 pb-2">
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            <Avatar className="size-10">
              <AvatarImage src={user?.profileImageUrl || undefined} alt="" />
              <AvatarFallback className="bg-indigo-500 text-xs font-semibold text-white">
                {initials(name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="text-xs ws-muted">You</p>
            </div>
            {isOwner && (
              <span className="rounded-full ws-surface-soft px-2.5 py-1 text-xs ws-muted">
                Owner
              </span>
            )}
          </div>
          {isOwner && isError && (
            <p role="alert" className="px-3 py-3 text-xs ws-muted">
              Couldn’t load members.{" "}
              <button onClick={() => void refetch()} className="underline">
                Try again
              </button>
            </p>
          )}
          {isOwner
            ? members.map((member) => {
                const memberName =
                  member.profile?.name ||
                  member.profile?.email ||
                  "Unavailable account";
                return (
                  <div
                    key={member.userId}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 ws-hover-surface"
                  >
                    <Avatar className="size-10">
                      <AvatarImage
                        src={member.profile?.profileImageUrl || undefined}
                        alt=""
                      />
                      <AvatarFallback className="bg-slate-600 text-xs font-semibold text-white">
                        {initials(memberName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {memberName}
                      </p>
                      <p className="truncate text-xs ws-muted">
                        {member.profile?.email || "Account unavailable"}
                      </p>
                    </div>
                    <label
                      className="sr-only"
                      htmlFor={`member-access-${member.userId}`}
                    >
                      Access for {memberName}
                    </label>
                    <select
                      id={`member-access-${member.userId}`}
                      value={member.permission}
                      disabled={change.isPending}
                      onChange={(event) =>
                        void update({
                          method: "PATCH",
                          userId: member.userId,
                          data: { permission: event.target.value },
                        })
                      }
                      className="max-w-[88px] rounded-lg border ws-border ws-raised-surface px-1.5 py-1.5 text-xs ws-ink disabled:opacity-50"
                    >
                      <option value="view">Can view</option>
                      <option value="edit">Can edit</option>
                    </select>
                    <button
                      type="button"
                      disabled={change.isPending}
                      aria-label={`Remove ${memberName}`}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Remove ${memberName} from this workspace?`,
                          )
                        )
                          void update({
                            method: "DELETE",
                            userId: member.userId,
                          });
                      }}
                      className="rounded-lg px-1 py-2 text-xs ws-muted hover:text-red-500 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                );
              })
            : othersOnline.map((person) => (
                <div
                  key={person.userId}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                >
                  <Avatar className="size-10">
                    <AvatarFallback
                      className="text-xs font-semibold"
                      style={{ backgroundColor: person.color, color: "#fff" }}
                    >
                      {initials(person.name)}
                    </AvatarFallback>
                  </Avatar>
                  <p className="truncate text-sm font-medium">{person.name}</p>
                </div>
              ))}
          {error && (
            <p role="alert" className="px-3 py-2 text-xs text-red-500">
              {error}
            </p>
          )}
        </div>
        {isOwner && (
          <div className="border-t ws-border px-5 py-3">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onShare();
              }}
              className="text-xs font-semibold text-[#00a976] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00E5A0]"
            >
              Add people
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
