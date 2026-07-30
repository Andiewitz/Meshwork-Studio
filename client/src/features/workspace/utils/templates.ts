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

  if (templateType === "template:ecommerce") {
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
      data: { label: "API Server", category: "Core" },
      style: { width: 168, height: 72 },
    };
    const db = {
      id: `db-${now}`,
      type: "database",
      position: { x: base.x + 960, y: base.y },
      data: { label: "Database", provider: "postgresql", category: "Core" },
      style: { width: 144, height: 120 },
    };

    newNodes = [internet, cdn, lb, api, db];
    newEdges = [
      { id: `e-${now}-1`, source: internet.id, target: cdn.id, type: "step" },
      { id: `e-${now}-2`, source: cdn.id, target: lb.id, type: "step" },
      { id: `e-${now}-3`, source: lb.id, target: api.id, type: "step" },
      { id: `e-${now}-4`, source: api.id, target: db.id, type: "step" },
    ];
  } else if (templateType === "template:ai-platform") {
    const client = {
      id: `client-${now}`,
      type: "app",
      position: { x: base.x, y: base.y },
      data: { label: "Client App", category: "Core" },
      style: { width: 168, height: 72 },
    };
    const api = {
      id: `api-${now}`,
      type: "gateway",
      position: { x: base.x + 240, y: base.y },
      data: { label: "API Gateway", category: "Core" },
      style: { width: 168, height: 72 },
    };
    const worker = {
      id: `worker-${now}`,
      type: "worker",
      position: { x: base.x + 480, y: base.y },
      data: { label: "Inference Worker", category: "Core" },
      style: { width: 168, height: 72 },
    };
    const db = {
      id: `db-${now}`,
      type: "database",
      position: { x: base.x + 720, y: base.y },
      data: { label: "Model Store", provider: "postgresql", category: "Core" },
      style: { width: 144, height: 120 },
    };

    newNodes = [client, api, worker, db];
    newEdges = [
      { id: `e-${now}-1`, source: client.id, target: api.id, type: "step" },
      { id: `e-${now}-2`, source: api.id, target: worker.id, type: "step" },
      { id: `e-${now}-3`, source: worker.id, target: db.id, type: "step" },
    ];
  } else if (templateType === "template:meshwork-target-architecture") {
    const internet = {
      id: `internet-${now}`,
      type: "user",
      position: { x: base.x, y: base.y },
      data: { label: "Internet Clients", category: "Core" },
    };
    const gateway = {
      id: `gtw-${now}`,
      type: "gateway",
      position: { x: base.x + 240, y: base.y },
      data: { label: "API Gateway (JWT)", category: "Core" },
      style: { width: 192, height: 72 },
    };
    const auth = {
      id: `auth-${now}`,
      type: "microservice",
      position: { x: base.x + 500, y: base.y },
      data: { label: "Auth Service", category: "Core" },
      style: { width: 168, height: 72 },
    };
    const app = {
      id: `app-${now}`,
      type: "microservice",
      position: { x: base.x + 500, y: base.y + 140 },
      data: { label: "App Service", category: "Core" },
      style: { width: 168, height: 72 },
    };
    const pg = {
      id: `pg-${now}`,
      type: "database",
      position: { x: base.x + 740, y: base.y - 60 },
      data: { label: "PostgreSQL\n(auth_db)", category: "Core" },
      style: { width: 144, height: 120 },
    };
    const redis = {
      id: `red-${now}`,
      type: "cache",
      position: { x: base.x + 740, y: base.y + 120 },
      data: { label: "Redis\n(queue)", category: "Core" },
      style: { width: 144, height: 120 },
    };

    newNodes = [internet, gateway, auth, app, pg, redis];
    newEdges = [
      {
        id: `e-${now}-1`,
        source: internet.id,
        target: gateway.id,
        type: "step",
      },
      { id: `e-${now}-2`, source: gateway.id, target: auth.id, type: "step" },
      { id: `e-${now}-3`, source: gateway.id, target: app.id, type: "step" },
      { id: `e-${now}-4`, source: auth.id, target: pg.id, type: "step" },
      { id: `e-${now}-5`, source: app.id, target: pg.id, type: "step" },
      { id: `e-${now}-6`, source: app.id, target: redis.id, type: "step" },
      {
        id: `e-${now}-7`,
        source: app.id,
        target: auth.id,
        type: "step",
        label: "gRPC",
        style: { strokeDasharray: "5,5" },
      },
    ];
  }

  const repaired = validateAndRepairCanvas({
    nodes: newNodes,
    edges: newEdges,
  });
  return repaired || { nodes: newNodes as Node[], edges: newEdges as Edge[] };
};
