import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCollaborators,
  type CollaboratorPermission,
} from "@/hooks/use-collaborators";

interface Props {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOwner: boolean;
  ownerName: string;
}

export function CollaboratorsDialog({
  workspaceId,
  open,
  onOpenChange,
  isOwner,
  ownerName,
}: Props) {
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<CollaboratorPermission>("view");
  const [error, setError] = useState("");
  const { data, isLoading, isError, refetch, change } = useCollaborators(
    workspaceId,
    open && isOwner,
  );
  async function perform(action: Parameters<typeof change.mutateAsync>[0]) {
    setError("");
    try {
      await change.mutateAsync(action);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update access.",
      );
      return false;
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) setError("");
        onOpenChange(value);
      }}
    >
      <DialogContent className="workspace-dialog max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border ws-border p-5 ws-ink sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Share project
          </DialogTitle>
          <DialogDescription className="text-sm ws-muted">
            Give existing, verified accounts access to this project.
          </DialogDescription>
        </DialogHeader>
        {isOwner ? (
          <>
            <form
              className="mt-3 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void perform({
                  method: "POST",
                  data: { email: email.trim(), permission },
                }).then((ok) => {
                  if (ok) setEmail("");
                });
              }}
            >
              <label
                htmlFor="collaborator-email"
                className="block text-xs font-medium ws-ink"
              >
                Email address
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="collaborator-email"
                  type="email"
                  required
                  maxLength={320}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  className="h-10 min-w-0 flex-1 rounded-md border ws-border ws-surface-soft px-3 text-sm ws-ink ws-placeholder focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00E5A0]"
                />
                <label
                  className="sr-only"
                  htmlFor="new-collaborator-permission"
                >
                  Access for new collaborator
                </label>
                <select
                  id="new-collaborator-permission"
                  value={permission}
                  onChange={(event) =>
                    setPermission(event.target.value as CollaboratorPermission)
                  }
                  className="h-10 rounded-md border ws-border ws-raised-surface px-3 text-sm ws-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00E5A0]"
                >
                  <option value="view">Can view</option>
                  <option value="edit">Can edit</option>
                </select>
                <button
                  type="submit"
                  disabled={change.isPending}
                  className="h-10 rounded-md ws-primary px-4 text-sm font-semibold disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                >
                  {change.isPending ? "Saving…" : "Add"}
                </button>
              </div>
            </form>
            {error && (
              <p role="alert" className="mt-2 text-sm ws-error-text">
                {error}
              </p>
            )}
            <div className="mt-5 border-t ws-border pt-4">
              <h3 className="text-sm font-medium">People with access</h3>
              <div className="mt-3 flex items-center justify-between gap-4 py-2 text-sm">
                <span className="truncate">
                  {ownerName} <span className="ws-muted">(you)</span>
                </span>
                <span className="text-xs ws-muted">Owner</span>
              </div>
              {isLoading && (
                <p className="py-3 text-sm ws-muted">Loading collaborators…</p>
              )}
              {isError && (
                <p role="alert" className="py-3 text-sm ws-error-text">
                  Couldn’t load collaborators.{" "}
                  <button onClick={() => void refetch()} className="underline">
                    Try again
                  </button>
                </p>
              )}
              {!isLoading && !isError && data?.collaborators.length === 0 && (
                <p className="py-3 text-sm ws-muted">
                  No direct collaborators yet.
                </p>
              )}
              <ul className="max-h-56 overflow-y-auto">
                {data?.collaborators.map((member) => (
                  <li
                    key={member.userId}
                    className="flex items-center gap-2 border-t ws-border py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        {member.profile?.name || "Unavailable account"}
                      </p>
                      <p className="truncate text-xs ws-muted">
                        {member.profile?.email || member.userId}
                      </p>
                    </div>
                    <label
                      className="sr-only"
                      htmlFor={`access-${member.userId}`}
                    >
                      Access for {member.profile?.name || member.userId}
                    </label>
                    <select
                      id={`access-${member.userId}`}
                      disabled={change.isPending}
                      value={member.permission}
                      onChange={(event) =>
                        void perform({
                          method: "PATCH",
                          userId: member.userId,
                          data: { permission: event.target.value },
                        })
                      }
                      className="h-9 rounded-md border ws-border ws-raised-surface px-2 text-xs ws-ink disabled:opacity-50"
                    >
                      <option value="view">Can view</option>
                      <option value="edit">Can edit</option>
                    </select>
                    <button
                      type="button"
                      disabled={change.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Remove ${member.profile?.name || "this collaborator"} from this project?`,
                          )
                        )
                          void perform({
                            method: "DELETE",
                            userId: member.userId,
                          });
                      }}
                      className="rounded-md px-2 py-2 text-xs ws-muted ws-hover-surface ws-hover-ink disabled:opacity-50"
                      aria-label={`Remove ${member.profile?.name || member.userId}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-relaxed ws-muted">
                Removing a collaborator revokes their project access.
              </p>
            </div>
          </>
        ) : (
          <p className="py-3 text-sm ws-muted">
            Only the project owner can manage direct collaborators.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
