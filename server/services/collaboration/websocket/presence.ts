import { WebSocketServer, WebSocket, type RawData } from "ws";
import { createChildLogger } from "@server/lib/logger";
import { logTraceback } from "@server/lib/traceback";
import type { ApiErrorCode } from "@server/lib/errorCodes";
import type { Server as HttpServer } from "http";
import type { IncomingMessage } from "http";
import cookie from "cookie";
import type { WorkspaceRole } from "@shared/permissions";
import type { WorkspaceAccess } from "@shared/schema/workspace-contract";
import {
  authenticateUpgrade,
  verifyAssertionToken,
  revokedSessions,
} from "../../../auth";
import { getRedis, createRedisClient } from "@server/lib/redis";
import type { Redis as RedisType } from "ioredis";
import {
  websocketConnectionsActive,
  websocketRoomsActive,
} from "@server/lib/metrics";
import crypto from "crypto";

// Auth: the Go service signs assertions; we verify locally (no auth_db).
// SECURITY: revocation fan-out. The Go identity service publishes revoked
// session/user ids here; live sockets must die immediately on logout,
// password change or ban — not at next natural disconnect.
const SESSION_REVOCATION_CHANNEL = "identity:sessions:revoked";

const log = createChildLogger("collaboration-websocket");

const ORIGIN_SERVER_ID = crypto.randomUUID();
const WS_CLOSE_UNAUTHORIZED = 4401;
const WS_CLOSE_FORBIDDEN = 4403;

function mintRequestId(): string {
  return `req-${crypto.randomBytes(12).toString("hex")}`;
}

function sendWsError(
  ws: WebSocket,
  code: ApiErrorCode,
  message: string,
  requestId: string,
): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "error", code, message, requestId }));
}

let redisSub: RedisType | null = null;
let redisPub: RedisType | null = null;

let redisSubInitialized = false;

function initRedisSub() {
  if (redisSubInitialized) return;
  const sub = getRedisSub();
  if (sub) {
    sub.on("message", (channel: string, message: string) => {
      if (!channel.startsWith("ws:room:")) return;
      try {
        const workspaceId = channel.slice("ws:room:".length);
        const payload = JSON.parse(message);
        if (payload.originServerId === ORIGIN_SERVER_ID) return;
        enqueueBroadcast(workspaceId, payload.data, payload.excludeUserId);
      } catch (err) {
        log.error({ err, channel }, "Error processing pub/sub message");
      }
    });
    redisSubInitialized = true;
  }
}

function ensureRedisSub() {
  if (!redisSubInitialized) initRedisSub();
}

function getRedisSub() {
  redisSub ??= createRedisClient();
  return redisSub;
}

function getRedisPub() {
  redisPub ??= getRedis();
  return redisPub;
}

function publishToRoom(
  workspaceId: string,
  message: ServerMessage,
  excludeUserId?: string,
) {
  enqueueBroadcast(workspaceId, message, excludeUserId);

  const pub = getRedisPub();
  if (pub) {
    ensureRedisSub();
    const payload = JSON.stringify({
      originServerId: ORIGIN_SERVER_ID,
      excludeUserId,
      data: message,
    });
    pub.publish(`ws:room:${workspaceId}`, payload).catch((err: unknown) => {
      log.error({ err, workspaceId }, "Redis publish failed");
    });
  }
}

interface PresenceUser {
  userId: string;
  name: string;
  color: string;
  cursor: { x: number; y: number } | null;
  ws: WebSocket;
}

interface ClientMessage {
  type:
    | "join"
    | "cursor"
    | "leave"
    | "node-move"
    | "canvas-sync"
    | "nodes-change"
    | "edges-change";
  workspaceId?: string;
  x?: number;
  y?: number;
  nodeId?: string;
  nodeX?: number;
  nodeY?: number;
  parentId?: string | null;
  nodes?: Record<string, unknown>[];
  edges?: Record<string, unknown>[];
  changes?: Record<string, unknown>[];
}

interface ServerMessage {
  type:
    | "presence"
    | "cursor"
    | "joined"
    | "left"
    | "error"
    | "node-move"
    | "canvas-sync"
    | "nodes-change"
    | "edges-change";
  [key: string]: unknown;
}

const rooms = new Map<string, Map<string, PresenceUser>>();

// Per-connection auth state captured at the upgrade handshake.
interface SocketAuth {
  sidHash: string;
  userId: string;
  email: string;
  name: string;
  lastValidatedAt: number;
  requestId: string;
}
const socketAuth = new WeakMap<WebSocket, SocketAuth>();

const SESSION_REVALIDATE_MS = 5 * 60 * 1000;

function canMutateCanvas(role: string | null): boolean {
  // owner/admin/editor may mutate; viewers and strangers may not.
  return (
    role === "owner" ||
    role === "admin" ||
    role === "editor" ||
    role === "workspace-owner"
  );
}

let roomPermissionCheck:
  ((userId: string, workspaceId: string) => Promise<boolean>) | undefined;
let roomBatchPermissionCheck:
  | ((workspaceId: string, userIds: string[]) => Promise<Set<string>>)
  | undefined;
const roomDeliveryQueues = new Map<
  string,
  { tail: Promise<void>; pending: number }
>();
const MAX_PENDING_MESSAGES = 128;

function enqueueBroadcast(
  workspaceId: string,
  message: ServerMessage,
  excludeUserId?: string,
) {
  const room = rooms.get(workspaceId);
  if (!room) return;
  const recipients = [...room.entries()].filter(
    ([id, user]) =>
      id !== excludeUserId && user.ws.readyState === WebSocket.OPEN,
  );
  if (!recipients.length) return;
  let queue = roomDeliveryQueues.get(workspaceId);
  if (!queue) {
    queue = { tail: Promise.resolve(), pending: 0 };
    roomDeliveryQueues.set(workspaceId, queue);
  }
  if (queue.pending >= MAX_PENDING_MESSAGES) {
    log.warn(
      { workspaceId },
      "Room delivery queue full; closing sockets for reconnect",
    );
    for (const user of room.values())
      user.ws.close(1013, "Room overloaded; reconnect");
    return;
  }
  const current = queue;
  current.pending++;
  current.tail = current.tail
    .then(() => broadcastToRoom(workspaceId, message, recipients))
    .catch((error: unknown) =>
      log.error({ error, workspaceId }, "Room delivery failed"),
    )
    .finally(() => {
      current.pending--;
      if (
        current.pending === 0 &&
        roomDeliveryQueues.get(workspaceId) === current
      )
        roomDeliveryQueues.delete(workspaceId);
    });
}

async function broadcastToRoom(
  workspaceId: string,
  message: ServerMessage,
  recipients: [string, PresenceUser][],
) {
  // Recheck immediately before each delivery; no permission cache or stale fallback.
  const active = recipients.filter(
    ([uid, user]) =>
      rooms.get(workspaceId)?.get(uid)?.ws === user.ws &&
      user.ws.readyState === WebSocket.OPEN,
  );
  if (!active.length) return;
  try {
    let allowed: Set<string>;
    if (roomBatchPermissionCheck) {
      allowed = await roomBatchPermissionCheck(
        workspaceId,
        active.map(([uid]) => uid),
      );
    } else {
      // Compatibility for callers without a batch port, bounded to 10 lookups.
      if (!roomPermissionCheck)
        throw new Error("Permission checker unavailable");
      allowed = new Set();
      for (let offset = 0; offset < active.length; offset += 10) {
        const decisions = await Promise.all(
          active.slice(offset, offset + 10).map(async ([uid]) => ({
            uid,
            access: await roomPermissionCheck!(uid, workspaceId),
          })),
        );
        for (const decision of decisions)
          if (decision.access) allowed.add(decision.uid);
      }
    }
    const payload = JSON.stringify(message);
    for (const [uid, user] of active) {
      if (
        rooms.get(workspaceId)?.get(uid)?.ws !== user.ws ||
        user.ws.readyState !== WebSocket.OPEN
      )
        continue;
      if (!allowed.has(uid)) user.ws.close(WS_CLOSE_FORBIDDEN, "forbidden");
      else user.ws.send(payload);
    }
  } catch (error) {
    log.error({ error, workspaceId }, "Presence permission check failed");
    for (const [uid, user] of active)
      if (
        rooms.get(workspaceId)?.get(uid)?.ws === user.ws &&
        user.ws.readyState === WebSocket.OPEN
      )
        user.ws.close(WS_CLOSE_FORBIDDEN, "permission unavailable");
  }
}

function getPresenceList(workspaceId: string): Omit<PresenceUser, "ws">[] {
  const room = rooms.get(workspaceId);
  if (!room) return [];

  return Array.from(room.values()).map(({ ws, ...rest }) => rest);
}

function removeFromAllRooms(ws: WebSocket) {
  for (const [workspaceId, room] of rooms.entries()) {
    for (const [userId, user] of room.entries()) {
      if (user.ws === ws) {
        room.delete(userId);
        publishToRoom(workspaceId, { type: "left", userId });

        if (room.size === 0) {
          rooms.delete(workspaceId);
          websocketRoomsActive.set(rooms.size);
          redisSub
            ?.unsubscribe(`ws:room:${workspaceId}`)
            .catch((err: unknown) =>
              log.error({ err }, "Redis unsubscribe failed"),
            );
        }
        return { workspaceId, userId };
      }
    }
  }
  return null;
}

// ─── Handshake helpers ──────────────────────────────────────────────────────

function rejectUpgrade(
  socket: import("net").Socket,
  reason: string,
  requestId: string,
): void {
  socket.write(
    `HTTP/1.1 401 Unauthorized\r\n` +
      `Connection: close\r\n` +
      `Content-Type: text/plain\r\n` +
      `X-Request-Id: ${requestId}\r\n` +
      `Content-Length: ${reason.length}\r\n` +
      `\r\n${reason}`,
  );
  socket.destroy();
}

export interface CollaborationPermissions {
  canAccessWorkspace(userId: string, workspaceId: string): Promise<boolean>;
  canAccessMany?(workspaceId: string, userIds: string[]): Promise<Set<string>>;
  getAccessVersion?(
    workspaceId: string,
    userId: string,
  ): Promise<{ access: WorkspaceAccess; epoch: string | null }>;
  getWorkspaceRole(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceRole | null>;
}

export function initializeWebSocket(
  httpServer: HttpServer,
  permissions: CollaborationPermissions,
) {
  roomPermissionCheck = (userId, workspaceId) =>
    permissions.canAccessWorkspace(userId, workspaceId);
  roomBatchPermissionCheck = permissions.canAccessMany;
  // SECURITY: noServer mode — the HTTP 'upgrade' event is authenticated
  // BEFORE any socket is accepted. Anonymous sockets never exist.
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on(
    "upgrade",
    async (
      req: IncomingMessage,
      socket: import("net").Socket,
      head: Buffer,
    ) => {
      try {
        const url = new URL(req.url || "/", "http://localhost");
        if (url.pathname !== "/ws") {
          socket.destroy();
          return;
        }
        // Fast path: local assertion. Fallback: introspect the opaque
        // session so reconnecting tabs don't bounce users to re-login just
        // because their 5-minute assertion lapsed while idle.
        const identity = await (async () => {
          const cookies = cookie.parse(req.headers.cookie ?? "");
          const direct = verifyAssertionToken(
            cookies["__Host-meshwork_assertion"] || cookies.meshwork_assertion,
          );
          if (direct) {
            log.debug({ userId: direct.sub }, "WS upgrade: assertion verified");
            return direct;
          }
          const viaService = await authenticateUpgrade(req);
          if (viaService) {
            log.debug(
              { userId: viaService.user.id },
              "WS upgrade: introspection verified",
            );
            return {
              sub: viaService.user.id,
              sid: viaService.user.sessionId,
              eml: viaService.user.email ?? "",
              nam: viaService.user.firstName ?? "",
            };
          }
          log.debug(
            "WS upgrade: auth failed (no assertion, introspection null)",
          );
          return null;
        })();
        const inboundRequestId = req.headers["x-request-id"];
        const upgradeRequestId = Array.isArray(inboundRequestId)
          ? inboundRequestId[0]
          : inboundRequestId || mintRequestId();
        if (!identity) {
          rejectUpgrade(socket, "Unauthorized", upgradeRequestId);
          return;
        }
        const claims = identity;

        wss.handleUpgrade(req, req.socket, head, (ws) => {
          socketAuth.set(ws, {
            sidHash: claims.sid,
            userId: claims.sub,
            email: claims.eml ?? "",
            name: claims.nam ?? "",
            lastValidatedAt: Date.now(),
            requestId: upgradeRequestId,
          });
          wss.emit("connection", ws, req);
        });
      } catch (err) {
        const inboundRequestId = req.headers["x-request-id"];
        const requestId = Array.isArray(inboundRequestId)
          ? inboundRequestId[0]
          : inboundRequestId || mintRequestId();
        logTraceback(log, "WS upgrade auth error", err, { requestId });
        rejectUpgrade(socket, "Unauthorized", requestId);
      }
    },
  );

  log.info("Presence server initialized on /ws (handshake-authenticated)");

  // Revocation fan-out subscriber: close sockets of revoked sessions.
  const sub = createRedisClient();
  if (sub) {
    sub
      .subscribe(SESSION_REVOCATION_CHANNEL)
      .then(() => log.info("Subscribed to session revocations"))
      .catch((err: Error) => log.warn({ err }, "Revocation subscribe failed"));
    sub.on("message", (_channel: string, message: string) => {
      try {
        const payload = JSON.parse(message) as {
          userId?: string;
          idHashes?: string[];
        };
        for (const [, room] of rooms.entries()) {
          for (const [uid, user] of room.entries()) {
            const auth = socketAuth.get(user.ws);
            if (!auth) continue;
            if (
              (payload.userId && payload.userId === uid) ||
              payload.idHashes?.includes(auth.sidHash)
            ) {
              user.ws.close(WS_CLOSE_UNAUTHORIZED, "session revoked");
            }
          }
        }
      } catch (err) {
        log.error({ err }, "Revocation message handling failed");
      }
    });
  }

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    websocketConnectionsActive.inc();
    const auth = socketAuth.get(ws);
    const requestId = auth?.requestId ?? mintRequestId();
    log.info(
      { userId: auth?.userId, sidHash: auth?.sidHash, requestId },
      "WS connection opened",
    );
    let currentUserId: string | undefined;
    let currentWorkspaceId: string | undefined;

    let alive = true;
    ws.on("pong", () => {
      alive = true;
    });

    const heartbeat = setInterval(() => {
      if (!alive) {
        log.debug(
          { userId: auth?.userId },
          "WS heartbeat timeout — terminating",
        );
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, 30000);

    // SECURITY: periodic revocation check for this socket. The assertion is
    // verified at upgrade; here we only watch the denylist fed by the auth
    // service's revocation channel.
    const revalidator = setInterval(() => {
      const auth = socketAuth.get(ws);
      if (!auth) return ws.close(WS_CLOSE_UNAUTHORIZED, "session expired");
      if (revokedSessions.has(auth.sidHash)) {
        return ws.close(WS_CLOSE_UNAUTHORIZED, "session revoked");
      }
      auth.lastValidatedAt = Date.now();
    }, SESSION_REVALIDATE_MS);

    const handleMessage = async (raw: RawData) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      try {
        const msg: ClientMessage = JSON.parse(raw.toString());

        switch (msg.type) {
          case "join": {
            if (!msg.workspaceId) {
              sendWsError(
                ws,
                "VALIDATION_FAILED",
                "workspaceId required",
                requestId,
              );
              return;
            }

            // Identity was established at the upgrade handshake; re-check
            // the denylist so a revoked socket cannot rejoin rooms.
            const auth = socketAuth.get(ws);
            if (!auth || revokedSessions.has(auth.sidHash)) {
              sendWsError(ws, "SESSION_EXPIRED", "Unauthorized", requestId);
              ws.close(WS_CLOSE_UNAUTHORIZED, "session revoked");
              return;
            }
            // Assertion carries display fields — no lookups needed.
            const user = {
              id: auth.userId,
              email: auth.email,
              firstName: auth.name || null,
            };

            const hasAccess = await permissions.canAccessWorkspace(
              user.id,
              msg.workspaceId,
            );

            if (!hasAccess) {
              sendWsError(
                ws,
                "FORBIDDEN",
                "No access to this workspace",
                requestId,
              );
              ws.close(WS_CLOSE_FORBIDDEN, "forbidden");
              return;
            }

            // A stable colour needs no Team database lookup.
            const palette = [
              "#FF6600",
              "#3B82F6",
              "#A855F7",
              "#10B981",
              "#EF4444",
              "#EAB308",
            ];
            const colorHash = crypto
              .createHash("sha256")
              .update(user.id)
              .digest()
              .readUInt32BE(0);
            const memberColor = palette[colorHash % palette.length];

            removeFromAllRooms(ws);

            currentUserId = user.id;
            currentWorkspaceId = msg.workspaceId;

            if (!rooms.has(msg.workspaceId)) {
              rooms.set(msg.workspaceId, new Map());
              websocketRoomsActive.set(rooms.size);
              if (redisSub) {
                redisSub
                  .subscribe(`ws:room:${msg.workspaceId}`)
                  .catch((err: Error) =>
                    log.error({ err }, "Redis subscribe failed"),
                  );
              }
            }

            const room = rooms.get(msg.workspaceId);
            if (!room) return;
            room.set(user.id, {
              userId: user.id,
              name: user.firstName || user.email.split("@")[0] || "Guest",
              color: memberColor,
              cursor: null,
              ws,
            });

            publishToRoom(
              msg.workspaceId,
              {
                type: "joined",
                userId: user.id,
                name: user.firstName ?? user.email.split("@")[0] ?? "Guest",
                color: memberColor,
              },
              user.id,
            );

            ws.send(
              JSON.stringify({
                type: "presence",
                users: getPresenceList(msg.workspaceId),
              }),
            );

            break;
          }

          case "cursor": {
            if (!currentUserId || !currentWorkspaceId) return;

            if (
              !(await permissions.canAccessWorkspace(
                currentUserId,
                currentWorkspaceId,
              ))
            ) {
              sendWsError(
                ws,
                "FORBIDDEN",
                "No access to this workspace",
                requestId,
              );
              ws.close(WS_CLOSE_FORBIDDEN, "forbidden");
              return;
            }
            const room = rooms.get(currentWorkspaceId);
            if (!room) return;

            const me = room.get(currentUserId);
            if (me) {
              me.cursor = { x: msg.x ?? 0, y: msg.y ?? 0 };
            }

            publishToRoom(
              currentWorkspaceId,
              {
                type: "cursor",
                userId: currentUserId,
                x: msg.x ?? 0,
                y: msg.y ?? 0,
              },
              currentUserId,
            );

            break;
          }

          case "leave": {
            removeFromAllRooms(ws);
            currentUserId = undefined;
            currentWorkspaceId = undefined;
            break;
          }

          case "node-move": {
            if (!currentUserId || !currentWorkspaceId || !msg.nodeId) return;
            if (!(await mayMutate(currentUserId, currentWorkspaceId, ws)))
              return;
            publishToRoom(
              currentWorkspaceId,
              {
                type: "node-move",
                userId: currentUserId,
                nodeId: msg.nodeId,
                nodeX: msg.nodeX,
                nodeY: msg.nodeY,
                parentId: msg.parentId,
              },
              currentUserId,
            );
            break;
          }

          case "canvas-sync": {
            if (!currentUserId || !currentWorkspaceId) return;
            if (!(await mayMutate(currentUserId, currentWorkspaceId, ws)))
              return;
            publishToRoom(
              currentWorkspaceId,
              {
                type: "canvas-sync",
                userId: currentUserId,
                nodes: msg.nodes,
                edges: msg.edges,
              },
              currentUserId,
            );
            break;
          }

          case "nodes-change": {
            if (!currentUserId || !currentWorkspaceId) return;
            if (!(await mayMutate(currentUserId, currentWorkspaceId, ws)))
              return;
            publishToRoom(
              currentWorkspaceId,
              {
                type: "nodes-change",
                userId: currentUserId,
                changes: msg.changes,
              },
              currentUserId,
            );
            break;
          }

          case "edges-change": {
            if (!currentUserId || !currentWorkspaceId) return;
            if (!(await mayMutate(currentUserId, currentWorkspaceId, ws)))
              return;
            publishToRoom(
              currentWorkspaceId,
              {
                type: "edges-change",
                userId: currentUserId,
                changes: msg.changes,
              },
              currentUserId,
            );
            break;
          }
        }
      } catch (err: unknown) {
        logTraceback(log, "Message handling error", err, { requestId });
        sendWsError(ws, "INTERNAL", "Message failed", requestId);
      }
    };
    let incoming = Promise.resolve();
    let pendingIncoming = 0;
    ws.on("message", (raw) => {
      if (pendingIncoming >= MAX_PENDING_MESSAGES) {
        ws.close(1013, "Too many messages; reconnect");
        return;
      }
      pendingIncoming++;
      incoming = incoming
        .then(() => handleMessage(raw))
        .finally(() => {
          pendingIncoming--;
        });
    });

    // SECURITY: viewers and non-members must not broadcast canvas mutations.
    async function mayMutate(
      userId: string,
      workspaceId: string,
      sock: WebSocket,
    ): Promise<boolean> {
      const role = await permissions.getWorkspaceRole(workspaceId, userId);
      if (canMutateCanvas(role)) return true;
      sendWsError(
        sock,
        "FORBIDDEN",
        "Insufficient permissions for this action",
        requestId,
      );
      return false;
    }

    ws.on("close", (code, reason) => {
      websocketConnectionsActive.dec();
      clearInterval(heartbeat);
      clearInterval(revalidator);
      log.debug(
        { userId: auth?.userId, code, reason: reason?.toString() },
        "WS connection closed",
      );
      removeFromAllRooms(ws);
    });

    ws.on("error", (_err: unknown) => {
      websocketConnectionsActive.dec();
      clearInterval(heartbeat);
      clearInterval(revalidator);
      removeFromAllRooms(ws);
    });
  });

  return wss;
}
