/** Compile-time contract assertions; not executed. */
import type { AppEvents } from "@shared/contracts/events";
import type { Workspace, Team, Conversation, User } from "@shared/schema";

// @ts-expect-error Persistence transaction types must not be exported by the event surface.
import type { DrizzleTx } from "@server/lib/events";

export function checkWireTypes() {
  // @ts-expect-error JSON timestamps are strings, not ORM Date instances.
  const workspaceTime: Workspace["createdAt"] = new Date();
  // @ts-expect-error Team wire timestamps are strings as well.
  const teamTime: Team["createdAt"] = new Date();
  // @ts-expect-error AI wire timestamps cannot contain Date instances.
  const conversationTime: Conversation["createdAt"] = new Date();
  // @ts-expect-error Identity wire timestamps cannot contain Date instances.
  const userTime: User["createdAt"] = new Date();
  // @ts-expect-error Events cannot carry SQL transaction handles.
  const event: AppEvents["workspace.deleted"] = { id: "ws", tx: {} };
  // @ts-expect-error Service bootstrap no longer re-exports its database pool.
  type Pool = typeof import("@services/workspace").pool;
  // @ts-expect-error Service bootstrap no longer re-exports its storage singleton.
  type Storage = typeof import("@services/team").teamStorage;
  return { workspaceTime, teamTime, conversationTime, userTime, event };
}
