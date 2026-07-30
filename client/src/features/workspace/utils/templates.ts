import { Node, Edge } from "@xyflow/react";
import { validateAndRepairCanvas } from "@/lib/ai-canvas-utils";

export interface TemplateResult {
  nodes: Node[];
  edges: Edge[];
}

export const generateTemplate = (
  templateType: string,
  base: { x: number; y: number },
): TemplateResult => {
  let newNodes: any[] = [];
  let newEdges: any[] = [];
  const now = Date.now();

  if (templateType === "template:go") {
    const internet = {
      id: `internet-${now}`,
      type: "user",
      position: { x: base.x, y: base.y },
      data: { label: "Users", category: "Core" },
    };
    const cdn = {
      id: `cdn-${now}`,
      type: "cdn",
      position: { x: base.x + 240, y: base.y },
      data: { label: "CDN", category: "Core" },
      style: { width: 168, height: 72 },
    };
    const lb = {
      id: `lb-${now}`,
      type: "loadBalancer",
      position: { x: base.x + 480, y: base.y },
      data: { label: "Load Balancer", category: "Core" },
      style: { width: 168, height: 72 },
    };
    const api = {
      id: `api-${now}`,
      type: "microservice",
      position: { x: base.x + 720, y: base.y },
      data: { label: "Go API", category: "Core" },
      style: { width: 168, height: 72 },
    };
    const db = {
      id: `db-${now}`,
      type: "database",
      position: { x: base.x + 960, y: base.y },
      data: { label: "PostgreSQL", provider: "postgresql", category: "Core" },
      style: { width: 144, height: 120 },
    };

    newNodes = [internet, cdn, lb, api, db];
    newEdges = [
      { id: `e-${now}-1`, source: internet.id, target: cdn.id, type: "step" },
      { id: `e-${now}-2`, source: cdn.id, target: lb.id, type: "step" },
      { id: `e-${now}-3`, source: lb.id, target: api.id, type: "step" },
      { id: `e-${now}-4`, source: api.id, target: db.id, type: "step" },
    ];
  } else if (templateType === "template:flutter") {
    const user = {
      id: `user-${now}`,
      type: "user",
      position: { x: base.x, y: base.y },
      data: { label: "iOS / Android / Web", category: "Core" },
    };
    const app = {
      id: `app-${now}`,
      type: "app",
      position: { x: base.x + 240, y: base.y },
      data: { label: "Flutter App", category: "Core" },
      style: { width: 168, height: 72 },
    };
    const hosting = {
      id: `hosting-${now}`,
      type: "app",
      position: { x: base.x + 480, y: base.y },
      data: { label: "Firebase Hosting", category: "Core" },
      style: { width: 168, height: 72 },
    };
    const api = {
      id: `api-${now}`,
      type: "gateway",
      position: { x: base.x + 480, y: base.y + 140 },
      data: { label: "API Gateway", category: "Core" },
      style: { width: 168, height: 72 },
    };
    const db = {
      id: `db-${now}`,
      type: "database",
      position: { x: base.x + 740, y: base.y + 140 },
      data: { label: "Firestore", provider: "firebase", category: "Core" },
      style: { width: 144, height: 120 },
    };

    newNodes = [user, app, hosting, api, db];
    newEdges = [
      { id: `e-${now}-1`, source: user.id, target: app.id, type: "step" },
      { id: `e-${now}-2`, source: app.id, target: hosting.id, type: "step" },
      { id: `e-${now}-3`, source: hosting.id, target: api.id, type: "step" },
      { id: `e-${now}-4`, source: api.id, target: db.id, type: "step" },
    ];
  } else if (templateType === "template:kubernetes") {
    const user = {
      id: `user-${now}`,
      type: "user",
      position: { x: base.x, y: base.y },
      data: { label: "Users", category: "Core" },
    };
    const lb = {
      id: `lb-${now}`,
      type: "loadBalancer",
      position: { x: base.x + 240, y: base.y },
      data: { label: "External LB", category: "Core" },
      style: { width: 168, height: 72 },
    };
    const ingress = {
      id: `ingress-${now}`,
      type: "k8s-ingress",
      position: { x: base.x + 480, y: base.y },
      data: { label: "Ingress", category: "Kubernetes" },
      style: { width: 168, height: 72 },
    };
    const svc = {
      id: `svc-${now}`,
      type: "k8s-service",
      position: { x: base.x + 720, y: base.y },
      data: { label: "API Service", category: "Kubernetes" },
      style: { width: 168, height: 72 },
    };
    const pod = {
      id: `pod-${now}`,
      type: "k8s-pod",
      position: { x: base.x + 960, y: base.y },
      data: { label: "App Pod", category: "Kubernetes" },
      style: { width: 144, height: 96 },
    };
    const db = {
      id: `db-${now}`,
      type: "database",
      position: { x: base.x + 960, y: base.y + 160 },
      data: { label: "PostgreSQL", provider: "postgresql", category: "Core" },
      style: { width: 144, height: 120 },
    };

    newNodes = [user, lb, ingress, svc, pod, db];
    newEdges = [
      { id: `e-${now}-1`, source: user.id, target: lb.id, type: "step" },
      { id: `e-${now}-2`, source: lb.id, target: ingress.id, type: "step" },
      { id: `e-${now}-3`, source: ingress.id, target: svc.id, type: "step" },
      { id: `e-${now}-4`, source: svc.id, target: pod.id, type: "step" },
      { id: `e-${now}-5`, source: pod.id, target: db.id, type: "step" },
    ];
  } else if (templateType === "template:react") {
    const user = {
      id: `user-${now}`,
      type: "user",
      position: { x: base.x, y: base.y },
      data: { label: "User", category: "Core" },
    };
    const cdn = {
      id: `cdn-${now}`,
      type: "cdn",
      position: { x: base.x + 240, y: base.y },
      data: { label: "CDN", category: "Core" },
      style: { width: 168, height: 72 },
    };
    const app = {
      id: `app-${now}`,
      type: "app",
      position: { x: base.x + 480, y: base.y },
      data: { label: "React SPA", category: "Core" },
      style: { width: 168, height: 72 },
    };
    const api = {
      id: `api-${now}`,
      type: "microservice",
      position: { x: base.x + 720, y: base.y },
      data: { label: "REST API", category: "Core" },
      style: { width: 168, height: 72 },
    };
    const db = {
      id: `db-${now}`,
      type: "database",
      position: { x: base.x + 960, y: base.y },
      data: { label: "PostgreSQL", provider: "postgresql", category: "Core" },
      style: { width: 144, height: 120 },
    };

    newNodes = [user, cdn, app, api, db];
    newEdges = [
      { id: `e-${now}-1`, source: user.id, target: cdn.id, type: "step" },
      { id: `e-${now}-2`, source: cdn.id, target: app.id, type: "step" },
      { id: `e-${now}-3`, source: app.id, target: api.id, type: "step" },
      { id: `e-${now}-4`, source: api.id, target: db.id, type: "step" },
    ];
  } else if (templateType === "template:python-sdk") {
    const client = {
      id: `client-${now}`,
      type: "user",
      position: { x: base.x, y: base.y },
      data: { label: "Client", category: "Core" },
    };
    const sdk = {
      id: `sdk-${now}`,
      type: "worker",
      position: { x: base.x + 240, y: base.y },
      data: { label: "Python SDK", category: "Core" },
      style: { width: 168, height: 72 },
    };
    const mcp = {
      id: `mcp-${now}`,
      type: "logic",
      position: { x: base.x + 480, y: base.y },
      data: { label: "MCP Server", category: "Core" },
      style: { width: 168, height: 72 },
    };
    const vdb = {
      id: `vdb-${now}`,
      type: "database",
      position: { x: base.x + 480, y: base.y + 140 },
      data: { label: "Vector DB", category: "Core" },
      style: { width: 144, height: 120 },
    };
    const cache = {
      id: `cache-${now}`,
      type: "cache",
      position: { x: base.x + 720, y: base.y + 140 },
      data: { label: "Redis", category: "Core" },
      style: { width: 144, height: 120 },
    };

    newNodes = [client, sdk, mcp, vdb, cache];
    newEdges = [
      { id: `e-${now}-1`, source: client.id, target: sdk.id, type: "step" },
      { id: `e-${now}-2`, source: sdk.id, target: mcp.id, type: "step" },
      { id: `e-${now}-3`, source: mcp.id, target: vdb.id, type: "step" },
      { id: `e-${now}-4`, source: mcp.id, target: cache.id, type: "step" },
    ];
  } else if (templateType === "template:opencalw") {
    const user = {
      id: `user-${now}`,
      type: "user",
      position: { x: base.x, y: base.y },
      data: { label: "User", category: "Core" },
    };
    const chat = {
      id: `chat-${now}`,
      type: "app",
      position: { x: base.x + 240, y: base.y },
      data: { label: "AI Chat UI", category: "Core" },
      style: { width: 168, height: 72 },
    };
    const engine = {
      id: `engine-${now}`,
      type: "worker",
      position: { x: base.x + 480, y: base.y },
      data: { label: "AI Engine", category: "Core" },
      style: { width: 168, height: 72 },
    };
    const memory = {
      id: `memory-${now}`,
      type: "cache",
      position: { x: base.x + 720, y: base.y },
      data: { label: "Memory", category: "Core" },
      style: { width: 168, height: 72 },
    };
    const db = {
      id: `history-${now}`,
      type: "database",
      position: { x: base.x + 720, y: base.y + 140 },
      data: { label: "History DB", category: "Core" },
      style: { width: 144, height: 120 },
    };

    newNodes = [user, chat, engine, memory, db];
    newEdges = [
      { id: `e-${now}-1`, source: user.id, target: chat.id, type: "step" },
      { id: `e-${now}-2`, source: chat.id, target: engine.id, type: "step" },
      { id: `e-${now}-3`, source: engine.id, target: memory.id, type: "step" },
      { id: `e-${now}-4`, source: engine.id, target: db.id, type: "step" },
    ];
  }

  const repaired = validateAndRepairCanvas({
    nodes: newNodes,
    edges: newEdges,
  });
  return repaired || { nodes: newNodes as Node[], edges: newEdges as Edge[] };
};
