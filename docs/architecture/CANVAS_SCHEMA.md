# Canvas Schema — Developer Guide

> Reference documentation for the Meshwork Studio canvas data model. Covers the full JSON shape for nodes, edges, and workspace payloads, including the canonical type registry, coordinate system, nesting rules, style overrides, and AI metadata fields.

The machine-readable JSON Schema is at [`docs/canvas-schema.json`](./canvas-schema.json) (Draft-07). Use it to validate canvas payloads in tooling, tests, or external integrations.

---

## Table of Contents

1. [Canvas Payload Structure](#canvas-payload-structure)
2. [Coordinate System](#coordinate-system)
3. [Node Schema](#node-schema)
   - [Required Fields](#required-fields)
   - [Node Type Registry](#node-type-registry)
   - [Canonical Sizes](#canonical-sizes)
   - [Node Data Object](#node-data-object)
   - [Node Style Object](#node-style-object)
   - [AI Metadata](#ai-metadata)
4. [Parent–Child Nesting](#parentchild-nesting)
5. [Edge Schema](#edge-schema)
   - [Required Fields](#required-fields-1)
   - [Edge Style](#edge-style)
   - [Edge Markers](#edge-markers)
   - [Edge Data Object](#edge-data-object)
6. [Type Aliases (AI Normalisation)](#type-aliases-ai-normalisation)
7. [Full Worked Examples](#full-worked-examples)
   - [Single Node](#single-node)
   - [Single Edge](#single-edge)
   - [Minimal Canvas](#minimal-canvas)
   - [VPC with Nested Services](#vpc-with-nested-services)
8. [Validation](#validation)
9. [Key Source Files](#key-source-files)

---

## Canvas Payload Structure

Every canvas is represented as a JSON object with exactly two top-level arrays:

```json
{
  "nodes": [ ...Node[] ],
  "edges": [ ...Edge[] ]
}
```

This is the format stored in the `nodes` and `edges` Postgres tables per workspace, exchanged with the Meshwork AI co-pilot on every `/api/ai/chat` request, and returned from `/api/workspaces/:id/canvas`.

---

## Coordinate System

Positions are in **logical canvas pixels** — not screen pixels. The canvas is infinite and panned/zoomed independently of the browser window.

- `x` increases to the **right**
- `y` increases **downward**
- The origin `(0, 0)` is the default center of a blank canvas

When the Meshwork AI generates new nodes, the viewport center is injected into the system prompt so new components land near the visible area. The `validateAndRepairCanvas` utility enforces that any node without a position is placed at `(i * 220 + 100, 100)` as a safe fallback.

---

## Node Schema

### Required Fields

| Field      | Type                       | Description                                                    |
| ---------- | -------------------------- | -------------------------------------------------------------- |
| `id`       | `string`                   | Unique node identifier. Stable across saves.                   |
| `type`     | `string`                   | Must be a value from the [Type Registry](#node-type-registry). |
| `position` | `{ x: number, y: number }` | Canvas coordinate (logical pixels).                            |
| `data`     | `NodeData`                 | Application metadata (label, tags, AI notes, etc.).            |

### Node Type Registry

Node types control which SVG icon, colour accent, and layout renderer is used. All types are lowercase or kebab-case strings.

#### Compute

| Type           | Description                             | Size (w×h) |
| -------------- | --------------------------------------- | ---------- |
| `server`       | Generic VM or bare-metal host           | 168×96     |
| `microservice` | Containerised service or API pod        | 168×72     |
| `worker`       | Background job or async processor       | 168×72     |
| `logic`        | Serverless function (Lambda, Cloud Run) | 120×72     |

#### Data

| Type         | Description                               | Size (w×h) |
| ------------ | ----------------------------------------- | ---------- |
| `database`   | Relational or document database           | 144×120    |
| `cache`      | In-memory cache (Redis, Memcached)        | 144×120    |
| `storage`    | Object/blob store (S3, GCS)               | 144×120    |
| `search`     | Search engine (Elasticsearch, OpenSearch) | 144×120    |
| `influxdb`   | Time-series database                      | 144×120    |
| `snowflake`  | Cloud data warehouse                      | 144×120    |
| `clickhouse` | Columnar analytics database               | 144×120    |

#### Networking

| Type           | Description                        | Size (w×h) |
| -------------- | ---------------------------------- | ---------- |
| `gateway`      | API Gateway                        | 192×72     |
| `loadBalancer` | L4/L7 load balancer (ALB, NGINX)   | 192×72     |
| `cdn`          | Content delivery network           | 192×72     |
| `bus`          | Event bus / message broker (Kafka) | 192×72     |
| `queue`        | Message queue (RabbitMQ, SQS)      | 192×72     |
| `route53`      | DNS / Route53                      | 192×72     |
| `nats`         | NATS messaging                     | 192×72     |
| `socketio`     | WebSocket server                   | 144×72     |

#### Security

| Type    | Description                       | Size (w×h) |
| ------- | --------------------------------- | ---------- |
| `vault` | Secrets manager (HashiCorp Vault) | 168×72     |
| `auth0` | Identity provider (Auth0, Okta)   | 168×72     |
| `waf`   | Web application firewall          | 168×72     |

#### Monitoring

| Type         | Description            | Size (w×h) |
| ------------ | ---------------------- | ---------- |
| `prometheus` | Metrics collection     | 168×72     |
| `grafana`    | Metrics dashboards     | 168×72     |
| `datadog`    | Observability platform | 168×72     |

#### Infrastructure Containers

These types act as **grouping containers** — other nodes can be nested inside them using `parentId`.

| Type            | Description           | Size (w×h) |
| --------------- | --------------------- | ---------- |
| `vpc`           | Virtual Private Cloud | 408×312    |
| `region`        | Cloud region boundary | 600×408    |
| `k8s-namespace` | Kubernetes namespace  | 408×312    |

#### Kubernetes Workloads

| Type             | Size (w×h) | Type              | Size (w×h) |
| ---------------- | ---------- | ----------------- | ---------- |
| `k8s-pod`        | 144×96     | `k8s-deployment`  | 192×96     |
| `k8s-replicaset` | 192×96     | `k8s-statefulset` | 192×96     |
| `k8s-daemonset`  | 192×96     | `k8s-service`     | 168×72     |
| `k8s-ingress`    | 168×72     | `k8s-configmap`   | 168×72     |
| `k8s-secret`     | 168×72     | `k8s-pvc`         | 168×96     |
| `k8s-job`        | 144×72     | `k8s-cronjob`     | 168×96     |
| `k8s-hpa`        | 168×96     |                   |            |

#### External / SaaS

| Type     | Size (w×h) | Type      | Size (w×h) |
| -------- | ---------- | --------- | ---------- |
| `user`   | 96×96      | `app`     | 168×72     |
| `api`    | 168×72     | `stripe`  | 168×72     |
| `twilio` | 168×72     | `shopify` | 168×72     |

#### CI/CD

| Type             | Size (w×h) | Type      | Size (w×h) |
| ---------------- | ---------- | --------- | ---------- |
| `github_actions` | 168×72     | `jenkins` | 168×72     |
| `gitlab`         | 168×72     | `argocd`  | 168×72     |

#### Text & Labels

| Type         | Description                          | Size (w×h) |
| ------------ | ------------------------------------ | ---------- |
| `annotation` | Inline text label / callout          | 160×48     |
| `note`       | Sticky-note block with markdown body | 192×192    |

### Canonical Sizes

**Always use the sizes from the table above.** The `validateAndRepairCanvas` utility enforces them — any AI or external tool that emits a different size will be silently corrected to the canonical value.

You may intentionally override dimensions in `style.width` / `style.height` (e.g. for container nodes that need to fit their children), but doing so disables automatic size correction for that node.

### Node Data Object

```ts
interface NodeData {
  label: string; // Required. Display name on the node card. Max 64 chars.
  category?: string; // Logical group: "Core" | "Data" | "Networking" | etc.
  description?: string; // Optional notes shown in the Properties sidebar.
  tags?: string[]; // Freeform tags for filtering and AI context.
  ai?: NodeAiMetadata; // Meshwork AI-generated annotations.
  provider?: string; // Cloud provider badge: "aws" | "gcp" | "azure" | "self-hosted"
  accentColor?: string; // Hex color override for the node accent glow.
  note?: string; // Markdown body text — 'note' type nodes only.
}
```

**Example:**

```json
{
  "label": "Primary PostgreSQL",
  "category": "Data",
  "description": "Main transactional database. Multi-AZ with automated failover.",
  "tags": ["postgres", "rds", "critical"],
  "provider": "aws",
  "accentColor": "#3B82F6",
  "ai": {
    "summary": "Stores all user and transaction records.",
    "notes": "Should have read replicas in us-east-1b to reduce query latency.",
    "lastAnalyzed": "2026-06-04T12:00:00Z"
  }
}
```

### Node Style Object

All style fields are optional. Missing values fall back to the design-system defaults from `THEMING.md`.

```ts
interface NodeStyle {
  width?: number; // px. Use canonical sizes unless intentionally overriding.
  height?: number; // px.
  backgroundColor?: string; // Card fill. Default: "#1a1a2e"
  borderColor?: string; // Border color. Default: "#555"
  borderRadius?: number; // Corners in px. Default: 8, max: 48
  opacity?: number; // 0–1. Default: 1
  fontColor?: string; // Label text color. Default: "#ffffff"
  fontSize?: number; // px. Default: 13
  icon?: string | null; // Lucide icon name or image URL override.
  theme?: "default" | "minimal" | "glass" | "neon"; // Default: "default"
}
```

### AI Metadata

Every node carries an `ai` sub-object populated by the Meshwork AI co-pilot. It is **never rendered in the UI directly** — it serves as context for follow-up AI prompts.

```ts
interface NodeAiMetadata {
  summary?: string; // Short AI description of this component's role.
  notes?: string; // Extended design notes authored by Meshwork AI.
  lastAnalyzed?: string | null; // ISO 8601 timestamp of last AI interaction.
}
```

---

## Parent–Child Nesting

Container nodes (`vpc`, `region`, `k8s-namespace`) can hold child nodes. To nest a node:

1. Set `parentId` to the **ID of the container node**.
2. Set `extent` to `"parent"` (this constrains drag movement to inside the container).

```json
{
  "id": "my-service",
  "type": "microservice",
  "position": { "x": 80, "y": 120 },
  "parentId": "vpc-1",
  "extent": "parent",
  "data": { "label": "Auth Service" }
}
```

> [!IMPORTANT]
> Child positions are **relative to the parent's top-left corner**, not the canvas origin. When Meshwork AI generates nested architectures, it places children at offsets like `(80, 120)` inside a VPC positioned at `(50, 50)` on the canvas — the child's absolute canvas position would be `(130, 170)`.

> [!WARNING]
> Never set `extent: "parent"` without also setting `parentId`, and vice versa. The `validateAndRepairCanvas` utility will silently strip a mismatched `extent` without `parentId`.

---

## Edge Schema

### Required Fields

| Field    | Type     | Description                                                |
| -------- | -------- | ---------------------------------------------------------- |
| `id`     | `string` | Unique edge identifier.                                    |
| `source` | `string` | ID of the originating node. Must exist in the same canvas. |
| `target` | `string` | ID of the destination node. Must exist in the same canvas. |

### Edge Style

```ts
interface EdgeStyle {
  stroke?: string; // Line color. Default: "#555"
  strokeWidth?: number; // Line thickness in px. Default: 1.5
  strokeDasharray?: string; // SVG dash pattern (e.g. "5 3" for dashes, "2 2" for dots).
}
```

**Connection type** (`type` field) controls the path shape:

| Value        | Description                                       |
| ------------ | ------------------------------------------------- |
| `smoothstep` | _(Default)_ Right-angle path with rounded corners |
| `bezier`     | Smooth S-curve                                    |
| `straight`   | Direct line                                       |
| `step`       | Right-angle path without rounding                 |
| `default`    | ReactFlow default (bezier)                        |

### Edge Markers

Arrowheads are set via `markerEnd`:

```json
{
  "markerEnd": {
    "type": "arrowclosed",
    "color": "#10B981"
  }
}
```

| Field    | Type                       | Description                          |
| -------- | -------------------------- | ------------------------------------ |
| `type`   | `"arrow" \| "arrowclosed"` | Open or filled arrowhead             |
| `color`  | `string`                   | Should match the edge `stroke` color |
| `width`  | `number`                   | Arrowhead width multiplier           |
| `height` | `number`                   | Arrowhead height multiplier          |

### Edge Data Object

```ts
interface EdgeData {
  label?: string; // Mirrors top-level label for sidebar editing.
  description?: string; // What this connection represents (protocol, SLA, etc.).
  ai?: {
    notes?: string; // Mosh AI notes about this connection.
  };
}
```

**Labelled edge example** — label appears at the midpoint as a pill badge:

```json
{
  "id": "edge-gw-svc",
  "source": "api-gateway",
  "target": "auth-service",
  "type": "smoothstep",
  "label": "REST / JWT",
  "labelStyle": { "fill": "#999", "fontSize": 10 },
  "labelBgStyle": { "fill": "#1A1A1A", "fillOpacity": 0.9 },
  "labelBgPadding": [6, 4],
  "labelBgBorderRadius": 6,
  "style": { "stroke": "#10B981", "strokeWidth": 1.5 },
  "markerEnd": { "type": "arrowclosed", "color": "#10B981" },
  "data": {
    "label": "REST / JWT",
    "description": "API Gateway forwards authenticated requests to the Auth microservice."
  }
}
```

---

## Type Aliases (AI Normalisation)

Mosh and external importers may emit common technology names that don't match valid types. The `validateAndRepairCanvas` utility in [`client/src/lib/ai-canvas-utils.ts`](../client/src/lib/ai-canvas-utils.ts) normalises these automatically before applying them to the canvas:

| Input alias(es)                                          | Resolved type  |
| -------------------------------------------------------- | -------------- |
| `postgres`, `postgresql`, `mysql`, `mongodb`, `dynamodb` | `database`     |
| `redis`, `elasticache`, `memcached`                      | `cache`        |
| `api-gateway`, `apigw`, `api_gateway`                    | `gateway`      |
| `nginx`, `alb`, `elb`, `haproxy`                         | `loadBalancer` |
| `lambda`, `aws-lambda`, `azure-function`                 | `logic`        |
| `service`, `docker`, `container`                         | `microservice` |
| `kafka`, `kinesis`                                       | `bus`          |
| `rabbitmq`, `sqs`, `celery`                              | `queue`        |
| `s3`, `blob`, `gcs`                                      | `storage`      |
| `cloudfront`, `fastly`, `akamai`                         | `cdn`          |
| `react`, `vue`, `angular`, `nextjs`, `nuxt`              | `app`          |
| `text`                                                   | `annotation`   |

Any type string not in the registry **and** not in the alias table falls back to `server`.

---

## Full Worked Examples

### Single Node

```json
{
  "id": "cache-1",
  "type": "cache",
  "position": { "x": 440, "y": 200 },
  "data": {
    "label": "Redis Session Cache",
    "category": "Data",
    "description": "Stores session tokens and hot-path query results.",
    "tags": ["redis", "session", "cache"],
    "provider": "aws",
    "ai": {
      "summary": "In-memory cache reducing DB read load.",
      "notes": "Set maxmemory-policy to allkeys-lru in production.",
      "lastAnalyzed": null
    }
  },
  "style": {
    "width": 144,
    "height": 120,
    "backgroundColor": "#1a1a2e",
    "borderColor": "#555",
    "borderRadius": 8,
    "opacity": 1,
    "fontColor": "#ffffff",
    "fontSize": 13,
    "theme": "default"
  }
}
```

### Single Edge

```json
{
  "id": "e-api-cache",
  "source": "api-service",
  "target": "cache-1",
  "type": "smoothstep",
  "label": "GET /session",
  "style": { "stroke": "#555", "strokeWidth": 1.5 },
  "markerEnd": { "type": "arrowclosed", "color": "#555" },
  "data": {
    "label": "GET /session",
    "description": "API checks the cache before querying the database."
  }
}
```

### Minimal Canvas

```json
{
  "nodes": [
    {
      "id": "user-1",
      "type": "user",
      "position": { "x": 100, "y": 200 },
      "data": { "label": "End User" }
    },
    {
      "id": "app-1",
      "type": "app",
      "position": { "x": 340, "y": 200 },
      "data": { "label": "Web App", "category": "Core" }
    },
    {
      "id": "db-1",
      "type": "database",
      "position": { "x": 580, "y": 200 },
      "data": { "label": "PostgreSQL", "category": "Data", "provider": "aws" }
    }
  ],
  "edges": [
    {
      "id": "e-user-app",
      "source": "user-1",
      "target": "app-1",
      "type": "smoothstep",
      "style": { "stroke": "#555", "strokeWidth": 1.5 },
      "markerEnd": { "type": "arrowclosed", "color": "#555" }
    },
    {
      "id": "e-app-db",
      "source": "app-1",
      "target": "db-1",
      "type": "smoothstep",
      "label": "SQL",
      "style": { "stroke": "#555", "strokeWidth": 1.5 },
      "markerEnd": { "type": "arrowclosed", "color": "#555" }
    }
  ]
}
```

### VPC with Nested Services

Demonstrates the container-nesting pattern. Children use positions **relative to the VPC**.

```json
{
  "nodes": [
    {
      "id": "vpc-1",
      "type": "vpc",
      "position": { "x": 50, "y": 50 },
      "data": { "label": "Production VPC", "category": "Networking" },
      "style": { "width": 480, "height": 320 }
    },
    {
      "id": "gw-1",
      "type": "gateway",
      "position": { "x": 40, "y": 60 },
      "parentId": "vpc-1",
      "extent": "parent",
      "data": { "label": "API Gateway", "category": "Networking" }
    },
    {
      "id": "svc-1",
      "type": "microservice",
      "position": { "x": 280, "y": 80 },
      "parentId": "vpc-1",
      "extent": "parent",
      "data": { "label": "User Service", "category": "Core" }
    },
    {
      "id": "db-1",
      "type": "database",
      "position": { "x": 280, "y": 200 },
      "parentId": "vpc-1",
      "extent": "parent",
      "data": { "label": "Users DB", "category": "Data", "provider": "aws" }
    }
  ],
  "edges": [
    {
      "id": "e-gw-svc",
      "source": "gw-1",
      "target": "svc-1",
      "type": "smoothstep",
      "label": "REST",
      "style": { "stroke": "#10B981", "strokeWidth": 1.5 },
      "markerEnd": { "type": "arrowclosed", "color": "#10B981" }
    },
    {
      "id": "e-svc-db",
      "source": "svc-1",
      "target": "db-1",
      "type": "smoothstep",
      "style": { "stroke": "#555", "strokeWidth": 1.5 },
      "markerEnd": { "type": "arrowclosed", "color": "#555" }
    }
  ]
}
```

---

## Validation

Use `docs/canvas-schema.json` to validate a canvas payload programmatically:

```ts
import Ajv from "ajv";
import schema from "../docs/canvas-schema.json";

const ajv = new Ajv({ strict: false });
const validate = ajv.compile(schema);

const valid = validate(canvasPayload);
if (!valid) {
  console.error("Canvas validation errors:", validate.errors);
}
```

At runtime, the [`validateAndRepairCanvas`](../client/src/lib/ai-canvas-utils.ts) function performs a **repair pass** rather than a hard rejection — invalid types are aliased or fall back to `server`, missing positions are auto-placed, and duplicate IDs are de-duplicated. This makes the canvas resilient to imperfect AI output.

---

## Key Source Files

| File                                                                                                                        | Purpose                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [`docs/canvas-schema.json`](./canvas-schema.json)                                                                           | Machine-readable JSON Schema (Draft-07) for the full canvas format                          |
| [`client/src/lib/ai-canvas-utils.ts`](../client/src/lib/ai-canvas-utils.ts)                                                 | `validateAndRepairCanvas` — runtime type normalisation, size enforcement, ID deduplication  |
| [`shared/schema.ts`](../shared/schema.ts)                                                                                   | Drizzle ORM schema for `nodes`, `edges`, and `workspaces` Postgres tables                   |
| [`server/modules/canvas/storage.ts`](../server/modules/canvas/storage.ts)                                                   | `syncCanvas()` — persistence layer that writes nodes and edges to the DB                    |
| [`client/src/features/workspace/components/AiChatDrawer.tsx`](../client/src/features/workspace/components/AiChatDrawer.tsx) | Mosh AI drawer — constructs system prompt using node/edge registry, parses AI JSON response |
| [`docs/mosh-ai-architecture.md`](./mosh-ai-architecture.md)                                                                 | How Mosh uses the canvas schema in prompts and responses                                    |
| [`docs/WORKSPACES.md`](./WORKSPACES.md)                                                                                     | Workspace and collection API reference                                                      |
