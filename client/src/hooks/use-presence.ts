import { useEffect, useRef, useState, useCallback } from "react";
import type { NodeChange, EdgeChange } from "@xyflow/react";
import { useAuth } from "@/auth";

// ─── Types ───────────────────────────────────────────────────────────

export interface PresenceUser {
  userId: string;
  name: string;
  color: string;
  cursor: { x: number; y: number } | null;
}

/** Serialised node/edge shape sent over the WebSocket wire */
type SerializedNode = Record<string, unknown>;
type SerializedEdge = Record<string, unknown>;

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
  users?: PresenceUser[];
  userId?: string;
  name?: string;
  color?: string;
  x?: number;
  y?: number;
  message?: string;
  code?: string;
  requestId?: string;
  nodeId?: string;
  nodeX?: number;
  nodeY?: number;
  parentId?: string | null;
  nodes?: SerializedNode[];
  edges?: SerializedEdge[];
  changes?: NodeChange[] | EdgeChange[];
}

const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;
/** Only retry on abnormal/protocol close; clean close (1000) and
 *  going-away (1001) are intentional — don't reconnect. */
const RETRYABLE_CLOSE_CODES = new Set([
  1002, 1003, 1006, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014, 1015,
]);

// ─── Hook ────────────────────────────────────────────────────────────

export function usePresence(
  workspaceId: string | number | null,
  onNodeMove?: (
    nodeId: string,
    x: number,
    y: number,
    parentId?: string | null,
  ) => void,
  onCanvasSync?: (nodes: SerializedNode[], edges: SerializedEdge[]) => void,
  onNodesChange?: (changes: NodeChange[]) => void,
  onEdgesChange?: (changes: EdgeChange[]) => void,
) {
  const { isAuthenticated } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const connectingRef = useRef(false);
  const onNodeMoveRef = useRef(onNodeMove);
  onNodeMoveRef.current = onNodeMove;
  const onCanvasSyncRef = useRef(onCanvasSync);
  onCanvasSyncRef.current = onCanvasSync;
  const onNodesChangeRef = useRef(onNodesChange);
  onNodesChangeRef.current = onNodesChange;
  const onEdgesChangeRef = useRef(onEdgesChange);
  onEdgesChangeRef.current = onEdgesChange;
  const [collaborators, setCollaborators] = useState<Map<string, PresenceUser>>(
    new Map(),
  );
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const backoffRef = useRef(INITIAL_BACKOFF_MS);

  const connect = useCallback(() => {
    if (!workspaceId || !isAuthenticated) return;
    // Prevent duplicate connections
    const existing = wsRef.current;
    if (
      existing &&
      (existing.readyState === WebSocket.CONNECTING ||
        existing.readyState === WebSocket.OPEN)
    ) {
      return;
    }
    // Clean up any lingering socket in CLOSING/CLOSED state
    if (existing) {
      existing.onclose = null;
      existing.onerror = null;
      existing.onopen = null;
      existing.onmessage = null;
      wsRef.current = null;
    }
    connectingRef.current = true;

    // Build WS URL from current location
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const rawUrl = (import.meta.env.VITE_API_URL as string) || "";
    const host =
      rawUrl && !rawUrl.includes("railway")
        ? new URL(rawUrl).host
        : window.location.host;
    const url = `${protocol}//${host}/ws`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      connectingRef.current = false;
      setIsConnected(true);
      backoffRef.current = INITIAL_BACKOFF_MS;
      // Authenticate and join the workspace room
      ws.send(JSON.stringify({ type: "join", workspaceId }));
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data as string);

        switch (msg.type) {
          case "presence": {
            // Full state sync on join
            const map = new Map<string, PresenceUser>();
            for (const user of msg.users || []) {
              map.set(user.userId, user);
            }
            setCollaborators(map);
            break;
          }

          case "joined": {
            if (msg.userId && msg.name && msg.color) {
              setCollaborators((prev) => {
                const next = new Map(prev);
                next.set(msg.userId!, {
                  userId: msg.userId!,
                  name: msg.name!,
                  color: msg.color!,
                  cursor: null,
                });
                return next;
              });
            }
            break;
          }

          case "cursor": {
            if (msg.userId) {
              setCollaborators((prev) => {
                const next = new Map(prev);
                const existing = next.get(msg.userId!);
                if (existing) {
                  next.set(msg.userId!, {
                    ...existing,
                    cursor: { x: msg.x || 0, y: msg.y || 0 },
                  });
                }
                return next;
              });
            }
            break;
          }

          case "left": {
            if (msg.userId) {
              setCollaborators((prev) => {
                const next = new Map(prev);
                next.delete(msg.userId!);
                return next;
              });
            }
            break;
          }

          case "error": {
            console.warn(
              "[Presence] Server error:",
              msg.code ?? "UNKNOWN",
              msg.message,
              msg.requestId ? `(request ${msg.requestId})` : "",
            );
            break;
          }

          case "node-move": {
            if (msg.nodeId != null && msg.nodeX != null && msg.nodeY != null) {
              onNodeMoveRef.current?.(
                msg.nodeId,
                msg.nodeX,
                msg.nodeY,
                msg.parentId,
              );
            }
            break;
          }

          case "canvas-sync": {
            if (msg.nodes && msg.edges) {
              onCanvasSyncRef.current?.(msg.nodes, msg.edges);
            }
            break;
          }

          case "nodes-change": {
            if (msg.changes) {
              onNodesChangeRef.current?.(msg.changes as NodeChange[]);
            }
            break;
          }

          case "edges-change": {
            if (msg.changes) {
              onEdgesChangeRef.current?.(msg.changes as EdgeChange[]);
            }
            break;
          }
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = (event) => {
      connectingRef.current = false;
      wsRef.current = null;
      setIsConnected(false);

      // Session revoked / expired, or room access denied — stop reconnecting.
      if (event.code === 4001 || event.code === 4401 || event.code === 4403)
        return;

      // Clean close or intentional navigation — don't reconnect
      if (!RETRYABLE_CLOSE_CODES.has(event.code)) return;

      // Auth lost — stop reconnecting
      if (!isAuthenticated) return;

      // Exponential backoff with cap
      const delay = backoffRef.current;
      backoffRef.current = Math.min(delay * 2, MAX_BACKOFF_MS);
      reconnectTimer.current = setTimeout(() => connect(), delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [workspaceId, isAuthenticated]);

  // Single effect: connect / disconnect lifecycle
  useEffect(() => {
    if (!isAuthenticated || !workspaceId) return;

    connect();

    return () => {
      clearTimeout(reconnectTimer.current);
      const ws = wsRef.current;
      if (ws) {
        ws.onclose = null; // prevent backoff reconnect on cleanup
        ws.onerror = null;
        ws.onopen = null;
        ws.onmessage = null;
        try {
          ws.send(JSON.stringify({ type: "leave" }));
        } catch {
          // socket may already be closed
        }
        ws.close(1000, "unmount");
        wsRef.current = null;
      }
      setCollaborators(new Map());
      setIsConnected(false);
      connectingRef.current = false;
    };
  }, [isAuthenticated, workspaceId, connect]);

  // Send cursor position (throttled by caller)
  const sendCursor = useCallback((x: number, y: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "cursor", x, y }));
    }
  }, []);

  const sendNodeMove = useCallback(
    (nodeId: string, x: number, y: number, parentId?: string | null) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "node-move",
            nodeId,
            nodeX: x,
            nodeY: y,
            parentId: parentId ?? null,
          }),
        );
      }
    },
    [],
  );

  const sendCanvasSync = useCallback(
    (nodes: SerializedNode[], edges: SerializedEdge[]) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: "canvas-sync", nodes, edges }),
        );
      }
    },
    [],
  );

  const sendNodesChange = useCallback((changes: NodeChange[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "nodes-change", changes }));
    }
  }, []);

  const sendEdgesChange = useCallback((changes: EdgeChange[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "edges-change", changes }));
    }
  }, []);

  return {
    collaborators: Array.from(collaborators.values()),
    isConnected,
    sendCursor,
    sendNodeMove,
    sendCanvasSync,
    sendNodesChange,
    sendEdgesChange,
  };
}
