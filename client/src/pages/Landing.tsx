import React, { useRef, useEffect, useState, useMemo } from "react";
import {
  motion,
  useScroll,
  useTransform,
  Variants,
  AnimatePresence,
} from "framer-motion";
import {
  ArrowRight,
  Sparkles,
  FileCode2,
  Network,
  GitBranch,
  Terminal,
  Search,
  ChevronRight,
  X,
  Copy,
  BookOpen,
  ShieldCheck,
  Layers,
  CodeIcon,
  MenuIcon,
  XIcon,
} from "lucide-react";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavGridCard,
  NavSmallItem,
  NavLargeItem,
  NavItemMobile,
  NavItemType,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

import Lenis from "lenis";
import { Link, useLocation } from "wouter";
import {
  PRELOADED_TEMPLATES,
  TemplateDefinition,
} from "../features/workspace/utils/preloadedTemplates";
import { Helmet } from "react-helmet-async";
import { MeshworkLogo } from "@/components/MeshworkLogo";
import { PromptInput } from "@/components/ui/ai-chat-input";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useToast } from "@/hooks/use-toast";

interface BlogPost {
  id: number;
  title: string;
  subtitle: string;
  date: string;
  category: string;
  readTime: string;
  author?: string;
  content?: string;
}

const blogPosts: BlogPost[] = [
  {
    id: 1,
    title: "Canvas Engine Pipeline & Architecture",
    subtitle:
      "Render math, DAG layouts, interaction modes, and PostgreSQL diffing strategies.",
    date: "May 10, 2026",
    category: "Engineering",
    readTime: "12 min read",
    author: "Meshwork Engineering",
    content: `
## Render & Math Layer

The canvas maps React Flow node/edge arrays to DOM elements. Absolute positioning is avoided for nested nodes. Instead, spatial containment math calculates relative \`(x, y)\` coordinate offsets when nodes are dragged inside parent nodes. This enables infinite nesting without Z-index conflicts.

Auto-layout uses a localized \`dagre\` implementation. Top-to-bottom and left-to-right graphs are generated dynamically by parsing edges into a directed acyclic graph (DAG), running the layout algorithm, and dispatching coordinates to the state store via optimistic UI updates.

## Strict Mode Interactions

Interaction states are explicitly decoupled to prevent layout destruction:
- **Select Mode**: Sets \`nodesDraggable=false\` to prevent movement during box-selection.
- **Pan Mode**: Sets \`elementsSelectable=false\` and \`panOnDrag=true\` for safe viewport navigation.

## Upsert Diffing Protocol

The client calculates a deterministic hash of the initial canvas state. On autosave, the engine diffs the current state against the hash. Only modified nodes/edges are sent to the API.

The backend executes PostgreSQL \`ON CONFLICT (id) DO UPDATE\` queries with this partial payload. This avoids row-deletion/re-insertion, reducing lock contention and decreasing payload size by up to 98% for large documents.
    `,
  },
  {
    id: 2,
    title: "AI Integration Architecture",
    subtitle: "SSE streaming, BYOK key management, and exponential backoff.",
    date: "May 8, 2026",
    category: "Technical",
    readTime: "8 min read",
    author: "Meshwork Engineering",
    content: `
## Key Management (BYOK)

User API keys are encrypted at rest via AES-256-GCM. A randomly generated IV is prefixed to the ciphertext on every write. Decryption occurs exclusively in-memory on the Node.js backend when proxying requests to external provider APIs. Raw key material is never exposed to the client.

## Fault-Tolerant Event Streaming

AI architecture generation uses Server-Sent Events (SSE). The backend buffers LLM JSON chunks and streams them to the client.

Since streaming JSON is malformed until completion, the client uses a fault-tolerant parser that strips trailing commas and unclosed brackets before calling \`JSON.parse()\`. Upon successful parsing, temporary "pseudo-nodes" mount on the canvas to allocate coordinate space, providing immediate structural feedback before final data mapping.

## Exponential Backoff Resilience

LLM providers return HTTP 429 and 503 frequently under load. Meshwork handles these natively. The client pauses the stream and enters a retry loop using: \`wait_time = base_delay * (2 ^ attempt_count)\`. Jitter is applied to prevent thundering herd problems on proxy servers.
    `,
  },
  {
    id: 3,
    title: "Security Posture & API Defenses",
    subtitle:
      "Middleware boundaries, Redis lockouts, and recursive log sanitization.",
    date: "May 5, 2026",
    category: "Engineering",
    readTime: "6 min read",
    author: "Meshwork Security Team",
    content: `
## API & Validation Boundaries

All HTTP requests route through multi-layered middleware. Helmet.js enforces strict HTTP headers (HSTS, NoSniff, FrameGuard). Authentication state uses \`express-session\` via a Redis store, avoiding stateless JWT vulnerabilities. 

State-changing requests require CSRF double-submit validation. Request bodies are mapped against Zod schemas prior to reaching the controller, preventing Prototype Pollution and injection attacks.

## Rate Limiting & Lockouts

API endpoints enforce sliding-window rate limits (e.g., 100 requests / 15 min). Sensitive endpoints (e.g., \`/api/v1/auth/login\`) use a Redis-backed progressive timeout. Successive failures trigger exponential lockout periods mapped to both the requester's IP and the target username to mitigate credential stuffing and brute-force attacks.

## Log Sanitization

The application logger uses a recursive redaction transport. Before payloads write to standard output, they are scanned for sensitive keys (e.g., \`password\`, \`token\`, \`email\`, \`apiKey\`). Values are replaced with an irreversible \`[REDACTED]\` string, ensuring zero credentials enter the log pipeline.
    `,
  },
  {
    id: 4,
    title: "Design System Implementation",
    subtitle:
      "Tailwind utility architecture, opacity mapping, and accessible primitives.",
    date: "May 2, 2026",
    category: "Design",
    readTime: "5 min read",
    author: "Meshwork Design",
    content: `
## Tailwind Utility Foundation

Meshwork uses Tailwind CSS explicitly without \`@apply\` directives in CSS files. This preserves specificity and prevents cascading overrides. The design enforces brutalist geometry via \`rounded-none\` on structural components, while floating elements use \`backdrop-blur-xl\` over semi-transparent backgrounds to achieve depth without drop-shadows.

## Variable Opacity Mapping

The root theme maps semantic color variables (\`--primary\`) to raw HSL values rather than hex codes. This enables arbitrary opacity modifiers in Tailwind classes (e.g., \`bg-primary/10\`) without requiring manual RGBA color definitions for every alpha step. This ensures clean light/dark mode transitions and strict adherence to WCAG contrast requirements.

## Accessible React Primitives

Interactive components (Dialogs, Dropdowns, Tooltips, Accordions) use Radix UI primitives. This delegates focus management, keyboard navigation (Escape, Arrow keys), and ARIA attribute assignment to the primitive layer. Tooltips render descriptions via React portals to escape hidden overflow boundaries while maintaining context to the targeted node.
    `,
  },
  {
    id: 5,
    title: "Canvas Node & Workspace Schema",
    subtitle:
      "The complete JSON data model behind every node, edge, and diagram in Meshwork Studio.",
    date: "June 7, 2026",
    category: "Technical",
    readTime: "10 min read",
    author: "Meshwork Engineering",
    content: `
## What Is the Canvas Schema?

Every diagram in Meshwork Studio is represented as a JSON object with two arrays: \`nodes\` and \`edges\`. This payload is what gets stored in the database, exchanged with the Mosh AI co-pilot, and synced across collaborators in real time. Understanding it is essential for building integrations, debugging AI output, or extending the canvas renderer.

## Node Structure

Each node has four required fields:

- \`id\` — a unique string identifier, stable across saves (e.g. \`"db-primary"\`, \`"k8s-api-gateway"\`)
- \`type\` — the visual renderer key, drawn from a strict registry of ~50 valid types (\`database\`, \`microservice\`, \`vpc\`, \`k8s-pod\`, etc.)
- \`position\` — \`{ x, y }\` in logical canvas pixels, where \`x\` increases right and \`y\` increases downward
- \`data\` — application metadata: \`label\`, \`category\`, \`description\`, \`tags\`, \`provider\`, and \`ai\` annotations

Optional fields include \`style\` (visual overrides: background color, border, opacity, font size, theme variant) and \`parentId\` + \`extent: "parent"\` for nesting nodes inside containers like \`vpc\` or \`k8s-namespace\`.

## Canonical Node Sizes

Every node type has a canonical width and height baked into the renderer. For example: \`database\` is 144×120px, \`gateway\` is 192×72px, \`vpc\` is 408×312px. The \`validateAndRepairCanvas\` utility automatically corrects any AI-generated node that uses non-canonical dimensions — making the canvas resilient to imperfect model output.

## Type Aliases & AI Normalisation

Mosh and external importers often emit common technology names that don't map directly to valid types. A built-in alias table normalises these automatically: \`postgres\` → \`database\`, \`redis\` → \`cache\`, \`nginx\` → \`loadBalancer\`, \`lambda\` → \`logic\`, \`kafka\` → \`bus\`, \`s3\` → \`storage\`, and so on. Any unrecognised type falls back to \`server\`.

## Parent–Child Nesting

Container nodes (\`vpc\`, \`region\`, \`k8s-namespace\`) support nesting. To nest a node inside a container, set \`parentId\` to the container's ID and \`extent\` to \`"parent"\`. Child positions are then relative to the container's top-left corner, not the global canvas origin. This enables clean visual grouping without coordinate clashes.

## Edge Structure

Edges require \`id\`, \`source\`, and \`target\`. Optional fields control how the connection is drawn: \`type\` (\`smoothstep\`, \`bezier\`, \`straight\`, \`step\`), \`label\` (a protocol badge rendered at the midpoint), \`animated\` (marching-ants for active data flows), \`style\` (stroke color, width, dash pattern), and \`markerEnd\` (arrowhead type and color).

The \`data\` sub-object stores metadata readable by the Properties sidebar: a \`label\` mirror, a \`description\`, and \`ai.notes\` populated by Mosh during analysis.

> [!NOTE]
> AI metadata is completely stripped out before generating a public shareable link.

## JSON Schema & Validation

A full Draft-07 JSON Schema covering every field, enum, and constraint lives at \`docs/canvas-schema.json\` in the repository. Integrate it with any JSON Schema validator (e.g. Ajv) to validate canvas payloads in CI pipelines, import tools, or external editors. The \`validateAndRepairCanvas\` runtime utility in \`client/src/lib/ai-canvas-utils.ts\` performs a repair pass instead of hard rejection — correcting types, deduplicating IDs, and placing orphaned nodes at safe fallback coordinates.
    `,
  },
  {
    id: 6,
    title: "Working with JSON in Meshwork",
    subtitle:
      "Programmatically build, import, and manipulate diagrams using the Meshwork canvas JSON format.",
    date: "July 20, 2026",
    category: "Technical",
    readTime: "14 min read",
    author: "Meshwork Engineering",
    content: `
## Overview

Every canvas in Meshwork is backed by a plain JSON document. You can write it by hand, generate it from code, or pipe it in from AI models — and Meshwork will render it faithfully. This guide walks through the full schema, every valid node type, edge options, nesting rules, and a complete worked example you can paste directly into the API.

## The Top-Level Document

\`\`\`json
{
  "nodes": [ ...Node[] ],
  "edges": [ ...Edge[] ]
}
\`\`\`

That's it. Two arrays. POST this to \`/api/v1/workspaces/:id/canvas\` and the canvas renders immediately.

## Node Schema

\`\`\`json
{
  "id": "string (required, unique)",
  "type": "string (required, see type registry below)",
  "position": { "x": 0, "y": 0 },
  "data": {
    "label": "Human-readable name",
    "category": "optional grouping label",
    "description": "optional longer description",
    "provider": "optional e.g. 'postgresql', 'aws'",
    "tags": ["optional", "string", "array"]
  },
  "style": {
    "width": 192,
    "height": 72,
    "background": "#1a1a2e",
    "border": "1px solid #444",
    "opacity": 1,
    "fontSize": 13
  },
  "parentId": "optional — ID of a container node",
  "extent": "parent"
}
\`\`\`

> [!IMPORTANT]
> \`id\` must be globally unique within a document. Duplicate IDs will be automatically deduplicated by the repair utility — the second occurrence gets a \`_dup\` suffix appended.

## Complete Node Type Registry

Meshwork has three groups of node types.

### Core (17 types — cover ~95% of diagrams)

| Type | Visual Label | Use For |
|---|---|---|
| \`server\` | Server | Any backend process, VM, EC2 instance |
| \`database\` | Database | Any SQL/NoSQL database (Postgres, MySQL, Mongo) |
| \`cache\` | Redis | In-memory stores, Redis, Memcached |
| \`gateway\` | API Gateway | API gateways, reverse proxies, entry points |
| \`loadBalancer\` | Load Balancer | ALB, NLB, NGINX upstream |
| \`microservice\` | Docker | Containerised services, pods |
| \`worker\` | Worker | Background jobs, Celery, BullMQ workers |
| \`logic\` | Lambda | Serverless functions, AWS Lambda, Edge Functions |
| \`queue\` | Queue | SQS, RabbitMQ, AMQP |
| \`bus\` | Kafka | Event buses, Kafka, NATS JetStream |
| \`storage\` | Storage (S3) | Object stores, S3, GCS, Azure Blob |
| \`cdn\` | CDN | Cloudflare, CloudFront, Fastly |
| \`vpc\` | VPC | Network boundary containers |
| \`region\` | Region | Geographic or logical grouping containers |
| \`user\` | User | End users, external actors |
| \`app\` | Client App | Frontend apps, mobile clients |
| \`api\` | External API | Third-party APIs and webhooks |

### Vendor-Specific (14 types)

| Type | Renders As |
|---|---|
| \`search\` | Elasticsearch |
| \`influxdb\` | InfluxDB |
| \`snowflake\` | Snowflake |
| \`clickhouse\` | ClickHouse |
| \`route53\` | AWS Route 53 |
| \`nats\` | NATS |
| \`socketio\` | Socket.io |
| \`github_actions\` | GitHub Actions |
| \`jenkins\` | Jenkins |
| \`gitlab\` | GitLab CI |
| \`argocd\` | Argo CD |
| \`vault\` | HashiCorp Vault |
| \`auth0\` | Auth0 |
| \`waf\` | WAF |
| \`prometheus\` | Prometheus |
| \`grafana\` | Grafana |
| \`datadog\` | Datadog |
| \`stripe\` | Stripe |
| \`twilio\` | Twilio |
| \`shopify\` | Shopify |

### Annotation & Layout Types

| Type | Use For |
|---|---|
| \`annotation\` | Markdown headers rendered above diagrams — supports \`## H2\` syntax |
| \`note\` | Inline sticky notes with plain text or markdown |
| \`junction\` | Invisible routing point for edge bundling |
| \`k8s-pod\` | Kubernetes Pod |
| \`k8s-deployment\` | Kubernetes Deployment |
| \`k8s-replicaset\` | Kubernetes ReplicaSet |
| \`k8s-statefulset\` | Kubernetes StatefulSet |
| \`k8s-daemonset\` | Kubernetes DaemonSet |
| \`k8s-service\` | Kubernetes Service |
| \`k8s-ingress\` | Kubernetes Ingress |
| \`k8s-configmap\` | Kubernetes ConfigMap |
| \`k8s-secret\` | Kubernetes Secret |
| \`k8s-pvc\` | Kubernetes PVC |
| \`k8s-job\` | Kubernetes Job |
| \`k8s-cronjob\` | Kubernetes CronJob |
| \`k8s-hpa\` | Kubernetes HPA |
| \`k8s-namespace\` | Kubernetes Namespace (container) |

## Type Aliases — Flexible Input

The renderer accepts common aliases and normalises them automatically. You don't need to memorise the exact type keys:

| You write | Meshwork renders |
|---|---|
| \`postgres\`, \`postgresql\`, \`mysql\`, \`mongodb\` | \`database\` |
| \`redis\`, \`memcached\` | \`cache\` |
| \`nginx\`, \`haproxy\` | \`loadBalancer\` |
| \`lambda\`, \`function\`, \`serverless\` | \`logic\` |
| \`kafka\`, \`eventbridge\`, \`pubsub\` | \`bus\` |
| \`s3\`, \`gcs\`, \`blob\` | \`storage\` |
| \`cloudflare\`, \`cloudfront\` | \`cdn\` |
| \`docker\`, \`container\`, \`service\` | \`microservice\` |
| \`elasticsearch\`, \`opensearch\` | \`search\` |
| \`anything unknown\` | \`server\` (fallback) |

## Edge Schema

\`\`\`json
{
  "id": "e-unique-id",
  "source": "source-node-id",
  "target": "target-node-id",
  "type": "smoothstep",
  "label": "gRPC",
  "animated": true,
  "style": {
    "stroke": "#6366f1",
    "strokeWidth": 2,
    "strokeDasharray": "5,5"
  },
  "markerEnd": {
    "type": "arrowclosed",
    "color": "#6366f1"
  },
  "data": {
    "label": "gRPC",
    "description": "Internal service call"
  }
}
\`\`\`

**Edge type options:**
- \`smoothstep\` — rounded right-angle routing (default, recommended)
- \`step\` — sharp right-angle routing
- \`bezier\` — curved spline
- \`straight\` — direct line

**Using \`animated: true\`** renders marching-ant dashes, indicating active data flow. Use it for real-time connections, streams, and event buses.

**Using \`strokeDasharray: "5,5"\`** renders a static dashed line — ideal for async or gRPC calls.

## Nesting Nodes Inside Containers

Container types (\`vpc\`, \`region\`, \`k8s-namespace\`, \`app\`, \`microservice\`, \`server\`) can hold child nodes. To nest a node:

1. Give the container a large enough \`style.width\` / \`style.height\`
2. Set \`parentId\` on each child to the container's \`id\`
3. Set \`extent: "parent"\` on each child
4. Use coordinates relative to the container's top-left corner (not global canvas)

\`\`\`json
{
  "id": "vpc-prod",
  "type": "vpc",
  "position": { "x": 100, "y": 100 },
  "style": { "width": 500, "height": 400 },
  "data": { "label": "Production VPC" }
},
{
  "id": "api-svc",
  "type": "gateway",
  "parentId": "vpc-prod",
  "extent": "parent",
  "position": { "x": 50, "y": 80 },
  "data": { "label": "API Gateway" }
}
\`\`\`

> [!NOTE]
> Containers must appear **before** their children in the \`nodes\` array. Order matters for the renderer to correctly resolve parent dimensions before mounting children.

## Annotations & Notes

Use \`annotation\` nodes to add section headers to diagrams. The \`label\` field supports markdown headings:

\`\`\`json
{
  "id": "header",
  "type": "annotation",
  "position": { "x": 50, "y": -100 },
  "width": 500,
  "height": 80,
  "data": {
    "label": "## My Architecture\\nBuilt for scale and resilience."
  }
}
\`\`\`

Use \`note\` nodes for inline callouts and commentary anywhere on the canvas.

## Complete Worked Example

A minimal three-tier web app in pure JSON — paste this directly into the canvas API:

\`\`\`json
{
  "nodes": [
    {
      "id": "header",
      "type": "annotation",
      "position": { "x": 50, "y": -100 },
      "width": 500, "height": 80,
      "data": { "label": "## Three-Tier Web App" }
    },
    {
      "id": "client",
      "type": "user",
      "position": { "x": 200, "y": 0 },
      "data": { "label": "Browser Client" }
    },
    {
      "id": "cdn",
      "type": "cdn",
      "position": { "x": 200, "y": 120 },
      "data": { "label": "Cloudflare CDN" }
    },
    {
      "id": "lb",
      "type": "loadBalancer",
      "position": { "x": 200, "y": 240 },
      "data": { "label": "NGINX Proxy" }
    },
    {
      "id": "api",
      "type": "gateway",
      "position": { "x": 200, "y": 360 },
      "data": { "label": "API Gateway" }
    },
    {
      "id": "svc",
      "type": "microservice",
      "position": { "x": 50, "y": 500 },
      "data": { "label": "App Service" }
    },
    {
      "id": "db",
      "type": "database",
      "position": { "x": 350, "y": 500 },
      "data": { "label": "PostgreSQL", "provider": "postgresql" }
    },
    {
      "id": "cache",
      "type": "cache",
      "position": { "x": 50, "y": 680 },
      "data": { "label": "Redis Cache" }
    }
  ],
  "edges": [
    { "id": "e1", "source": "client", "target": "cdn", "animated": true },
    { "id": "e2", "source": "cdn", "target": "lb", "animated": true },
    { "id": "e3", "source": "lb", "target": "api", "animated": true },
    { "id": "e4", "source": "api", "target": "svc" },
    { "id": "e5", "source": "svc", "target": "db" },
    {
      "id": "e6", "source": "svc", "target": "cache",
      "label": "cache lookup",
      "style": { "strokeDasharray": "5,5" }
    }
  ]
}
\`\`\`

## Generating JSON Programmatically

Since it's just JSON, any language works:

\`\`\`typescript
// TypeScript example — generate a service mesh diagram
const services = ["auth", "workspace", "mosh", "mcp", "worker"];

const nodes = services.map((name, i) => ({
  id: \`svc-\${name}\`,
  type: "microservice",
  position: { x: i * 200, y: 0 },
  data: { label: \`\${name.charAt(0).toUpperCase() + name.slice(1)} Service\` },
}));

const edges = services.slice(1).map((name) => ({
  id: \`e-\${name}-auth\`,
  source: \`svc-\${name}\`,
  target: "svc-auth",
  label: "gRPC",
  style: { strokeDasharray: "5,5" },
}));

const canvas = { nodes, edges };

await fetch(\`/api/v1/workspaces/\${workspaceId}/canvas\`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(canvas),
});
\`\`\`

## Validation & Error Handling

The canvas API runs the \`validateAndRepairCanvas\` pass on every import. Rather than rejecting malformed JSON, it heals it:

- Unknown \`type\` values fall back to \`server\`
- Duplicate \`id\` values get a \`_dup\` suffix
- Nodes missing \`position\` are placed at \`{ x: 0, y: 0 }\`
- Edges referencing nonexistent node IDs are silently dropped
- Non-canonical \`width\`/\`height\` values are reset to type defaults

This means AI-generated JSON — which is often slightly malformed — renders correctly without manual fixup.

> [!TIP]
> To validate your JSON before sending it, use the \`validateAndRepairCanvas\` function directly. Import it from \`@/lib/ai-canvas-utils\` in the client, or run it via the Node.js backend in a pre-import step.
    `,
  },
];

// Helper to extract headings from markdown for TOC
function extractHeadings(markdown: string) {
  const headings: { level: number; text: string; id: string }[] = [];
  const lines = markdown.split("\n");
  lines.forEach((line) => {
    const match = /^(#{2,3})\s+(.*)$/.exec(line);
    if (match) {
      const level = match[1].length;
      const text = match[2];
      const id = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      headings.push({ level, text, id });
    }
  });
  return headings;
}

const productNavLinks: NavItemType[] = [
  {
    title: "Canvas Engine",
    href: "#features",
    description: "DAG graph layouts, PostgreSQL diffing & infinite nesting",
    icon: Network,
  },
  {
    title: "Mosh AI Co-Pilot",
    href: "#hero",
    description: "Natural language prompt to cloud infrastructure generation",
    icon: Sparkles,
  },
  {
    title: "JSON Canvas Schema",
    href: "#",
    description: "Open JSON specification for nodes, edges & containers",
    icon: FileCode2,
  },
  {
    title: "Architecture Templates",
    href: "#templates",
    icon: GitBranch,
  },
  {
    title: "REST & SSE API",
    href: "#",
    icon: Terminal,
  },
  {
    title: "Security Defenses",
    href: "#",
    icon: ShieldCheck,
  },
];

const docsNavLinks: NavItemType[] = [
  {
    title: "Canvas Pipeline & Math",
    href: "#",
    description: "Spatial containment, Dagre layouts and optimistic UI diffing",
    icon: BookOpen,
  },
  {
    title: "AI Integration Architecture",
    href: "#",
    description: "Fault-tolerant SSE event streaming and BYOK AES-256 keys",
    icon: Sparkles,
  },
  {
    title: "Security Posture & Lockouts",
    href: "#",
    description:
      "Helmet HTTP headers, CSRF tokens and Redis progressive lockouts",
    icon: ShieldCheck,
  },
  {
    title: "Design System Tokens",
    href: "#",
    description:
      "Tailwind utility architecture, Radix primitives and accessibility",
    icon: Layers,
  },
  {
    title: "Canvas JSON Schema",
    href: "#",
    description:
      "Full node registry, type aliases and parent-child nesting rules",
    icon: FileCode2,
  },
  {
    title: "Working with Canvas JSON",
    href: "#",
    description:
      "Programmatically generate diagrams with Ajv schema validation",
    icon: CodeIcon,
  },
];

const Home = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [, setLocation] = useLocation();

  // State to toggle Documentation View vs Main Landing Page
  const [showDocsView, setShowDocsViewState] = useState(() => {
    if (typeof window !== "undefined") {
      return window.location.pathname === "/docs";
    }
    return false;
  });

  const setShowDocsView = (show: boolean) => {
    setShowDocsViewState(show);
    if (!show && typeof window !== "undefined" && window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  };

  // Docs state
  const [searchTerm, setSearchTerm] = useState("");
  const [activePostId, setActivePostId] = useState<number>(blogPosts[0].id);
  const [activeHeadingId, setActiveHeadingId] = useState<string>("");
  const { toast } = useToast();

  const activePost = useMemo(
    () => blogPosts.find((p) => p.id === activePostId) || blogPosts[0],
    [activePostId],
  );
  const headings = useMemo(
    () => (activePost.content ? extractHeadings(activePost.content) : []),
    [activePost],
  );

  const categoriesMap = useMemo(() => {
    const map: Record<string, BlogPost[]> = {};
    blogPosts.forEach((post) => {
      if (!map[post.category]) map[post.category] = [];
      map[post.category].push(post);
    });
    return map;
  }, []);

  const handleTemplateClick = (template: TemplateDefinition) => {
    localStorage.setItem("meshwork_pending_template", JSON.stringify(template));
    setLocation("/register");
  };

  const activeTemplates = PRELOADED_TEMPLATES;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });

    const lenis = new Lenis({
      lerp: 0.08,
      wheelMultiplier: 1.2,
    });
    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    return () => {
      window.removeEventListener("scroll", onScroll);
      lenis.destroy();
    };
  }, []);

  // Scroll spy for TOC when in docs view
  useEffect(() => {
    if (!showDocsView) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveHeadingId(entry.target.id);
          }
        });
      },
      { rootMargin: "0px 0px -80% 0px" },
    );

    headings.forEach((heading) => {
      const el = document.getElementById(heading.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings, activePostId, showDocsView]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({
      title: "Link Copied",
      description: "Documentation link copied to clipboard.",
    });
  };

  const barOpacity = useTransform(scrollYProgress, [0, 0.05], [0, 1]);

  // High-performance smooth intro variants with blur & physics curves
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.12, delayChildren: 0.15 },
    },
  };

  const heroItemVariants: Variants = {
    hidden: { opacity: 0, y: 35, scale: 0.97, filter: "blur(12px)" },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      transition: { duration: 0.85, ease: [0.16, 1, 0.3, 1] },
    },
  };

  // Custom Markdown Components
  type MdNode = Record<string, unknown>;
  type MdProps<T extends keyof JSX.IntrinsicElements> =
    React.ComponentPropsWithoutRef<T> & {
      node?: MdNode;
      children?: React.ReactNode;
    };

  const markdownComponents: Record<string, React.FC<MdProps<never>>> = {
    h2: ({ children, node: _node, ...props }: MdProps<"h2">) => {
      const text = String(children).replace(/\n/g, "");
      const id = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      return (
        <h2
          id={id}
          className="text-2xl font-semibold mt-12 mb-4 text-white/90 border-b border-white/10 pb-2 font-sans tracking-tight"
          {...props}
        >
          {children}
        </h2>
      );
    },
    h3: ({ children, node: _node, ...props }: MdProps<"h3">) => {
      const text = String(children).replace(/\n/g, "");
      const id = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      return (
        <h3
          id={id}
          className="text-xl font-medium mt-8 mb-4 text-white/80 font-sans tracking-tight"
          {...props}
        >
          {children}
        </h3>
      );
    },
    p: ({ children, node: _node, ...props }: MdProps<"p">) => (
      <p
        className="leading-relaxed mb-6 text-white/70 font-sans font-light text-base"
        {...props}
      >
        {children}
      </p>
    ),
    a: ({ children, node: _node, ...props }: MdProps<"a">) => (
      <a
        className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
        {...props}
      >
        {children}
      </a>
    ),
    ul: ({ children, node: _node, ...props }: MdProps<"ul">) => (
      <ul
        className="list-disc list-outside ml-6 mb-6 space-y-2 text-white/70 font-sans font-light"
        {...props}
      >
        {children}
      </ul>
    ),
    ol: ({ children, node: _node, ...props }: MdProps<"ol">) => (
      <ol
        className="list-decimal list-outside ml-6 mb-6 space-y-2 text-white/70 font-sans font-light"
        {...props}
      >
        {children}
      </ol>
    ),
    li: ({ children, node: _node, ...props }: MdProps<"li">) => (
      <li {...props}>{children}</li>
    ),
    blockquote: ({
      children,
      node: _node,
      ...props
    }: MdProps<"blockquote">) => {
      const textContent = String(
        (children as React.ReactElement[])?.[1]?.props?.children?.[0] || "",
      );
      if (textContent.includes("[!NOTE]")) {
        return (
          <div className="border border-blue-500/30 bg-blue-500/10 p-4 rounded-lg my-8 flex gap-3 text-white/80">
            <div className="text-blue-400 mt-0.5">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>{children}</div>
          </div>
        );
      }
      if (textContent.includes("[!IMPORTANT]")) {
        return (
          <div className="border border-purple-500/30 bg-purple-500/10 p-4 rounded-lg my-8 flex gap-3 text-white/80">
            <div className="text-purple-400 mt-0.5">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>{children}</div>
          </div>
        );
      }
      return (
        <blockquote
          className="border-l-4 border-[#3a3a3a] pl-4 my-6 italic text-white/60"
          {...props}
        >
          {children}
        </blockquote>
      );
    },
    code: ({
      children,
      node: _node,
      className,
      ...props
    }: MdProps<"code"> & { inline?: boolean }) => {
      const match = /language-(\w+)/.exec(className ?? "");
      const isBlock = !!(className && match);
      return isBlock ? (
        <div className="rounded-xl overflow-hidden border border-white/10 my-8 shadow-lg shadow-black/50">
          <div className="bg-[#1a1a1a] px-4 py-2 text-xs text-white/40 font-mono border-b border-white/5 flex justify-between items-center">
            <span>{match ? match[1] : "text"}</span>
          </div>
          <pre className="p-5 overflow-x-auto text-[13px] bg-[#0A0A0A] leading-relaxed">
            <code className={className} {...props}>
              {children}
            </code>
          </pre>
        </div>
      ) : (
        <code
          className="bg-white/10 px-1.5 py-0.5 rounded-md text-[0.9em] font-mono text-blue-300"
          {...props}
        >
          {children}
        </code>
      );
    },
    table: ({ children, node: _node, ...props }: MdProps<"table">) => (
      <div className="overflow-x-auto my-8 border border-white/10 rounded-xl">
        <table className="w-full text-left text-sm text-white/70" {...props}>
          {children}
        </table>
      </div>
    ),
    th: ({ children, node: _node, ...props }: MdProps<"th">) => (
      <th
        className="bg-[#1a1a1a] px-5 py-4 font-medium text-white/90 border-b border-white/10 whitespace-nowrap"
        {...props}
      >
        {children}
      </th>
    ),
    td: ({ children, node: _node, ...props }: MdProps<"td">) => (
      <td
        className="px-5 py-4 border-b border-white/5 last:border-0 bg-[#0A0A0A]"
        {...props}
      >
        {children}
      </td>
    ),
  };

  const DocsSidebar = () => (
    <div className="w-full h-full flex flex-col bg-[#0A0A0A] border-r border-white/10">
      <div className="p-4 sticky top-0 bg-[#0A0A0A]/95 backdrop-blur-xl z-10 border-b border-white/5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <Input
            placeholder="Search docs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-[#1a1a1a] border-white/10 text-white placeholder:text-white/30 h-9 rounded-lg text-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
        {Object.entries(categoriesMap).map(([category, posts]) => {
          const filtered = posts.filter(
            (p) =>
              p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
              p.subtitle.toLowerCase().includes(searchTerm.toLowerCase()),
          );
          if (filtered.length === 0) return null;

          return (
            <div key={category}>
              <h4 className="text-xs font-bold tracking-wider uppercase text-white/40 mb-3 px-2 font-sans">
                {category}
              </h4>
              <ul className="space-y-1">
                {filtered.map((post) => (
                  <li key={post.id}>
                    <button
                      onClick={() => setActivePostId(post.id)}
                      className={cn(
                        "w-full text-left px-2 py-1.5 rounded-md text-[14px] transition-colors font-sans flex items-center justify-between group",
                        activePostId === post.id
                          ? "bg-white/10 text-white font-medium"
                          : "text-white/60 hover:text-white hover:bg-white/5",
                      )}
                    >
                      <span className="truncate">{post.title}</span>
                      {activePostId === post.id && (
                        <ChevronRight className="w-3.5 h-3.5 text-white/40" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="relative font-sans text-white min-h-screen flex flex-col bg-background overflow-x-hidden"
    >
      <Helmet>
        <title>Meshwork Studio — Cloud Infrastructure Canvas</title>
        <meta
          name="description"
          content="Design, visualize, and auto-sync your cloud architecture with Meshwork Studio. Explore comprehensive technical guides and JSON schemas."
        />
        <link rel="canonical" href="https://meshwork-studio.duckdns.org/" />
        <meta property="og:title" content="Meshwork Studio" />
        <meta
          property="og:description"
          content="The open-source, local-first canvas for visualizing cloud infrastructure."
        />
        <meta property="og:type" content="website" />
        <meta
          property="og:url"
          content="https://meshwork-studio.duckdns.org/"
        />
      </Helmet>

      <motion.div
        className="fixed top-0 left-0 right-0 h-[2px] bg-primary z-[100] origin-left"
        style={{ scaleX: scrollYProgress, opacity: barOpacity }}
      />

      {/* FIXED NAVBAR AT ROOT LEVEL (OUTSIDE ANIMATEPRESENCE CONTAINING BLOCK) */}
      {!showDocsView && (
        <motion.nav
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.7,
            ease: [0.16, 1, 0.3, 1],
            delay: 0.05,
          }}
          className={cn(
            "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
            scrolled
              ? "bg-[#09090b]/80 backdrop-blur-xl border-b border-white/[0.08] shadow-[0_4px_30px_rgba(0,0,0,0.5)]"
              : "bg-transparent border-b border-transparent shadow-none",
          )}
        >
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            {/* Brand Logo */}
            <Link href="/" className="flex items-center gap-3 group shrink-0">
              <div className="w-8 h-8 flex items-center justify-center transition-all group-hover:drop-shadow-[0_0_12px_rgba(26,115,232,0.5)]">
                <MeshworkLogo />
              </div>
              <span className="text-lg font-headline font-bold tracking-tight hidden sm:block text-white">
                Meshwork Studio
              </span>
            </Link>

            {/* Desktop Radix Navigation Menu */}
            <NavigationMenu className="hidden lg:flex">
              <NavigationMenuList>
                {/* PRODUCT DROPDOWN */}
                <NavigationMenuItem>
                  <NavigationMenuTrigger
                    onClick={() => {
                      document
                        .getElementById("templates")
                        ?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    Product
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="grid w-full md:w-[680px] md:grid-cols-[1fr_.42fr] p-2 bg-[#0A0A0A]">
                      <ul className="grid grow gap-2 p-3 md:grid-cols-2 md:border-r md:border-white/10">
                        {productNavLinks.slice(0, 2).map((link) => (
                          <li key={link.title}>
                            <NavGridCard link={link} />
                          </li>
                        ))}
                        <li className="col-span-2">
                          <NavGridCard
                            link={{
                              ...productNavLinks[2],
                              onClick: () => setShowDocsView(true),
                            }}
                            className="min-h-[80px]"
                          />
                        </li>
                      </ul>
                      <ul className="space-y-1 p-3 flex flex-col justify-center">
                        {productNavLinks.slice(3).map((link) => (
                          <li key={link.title}>
                            <NavSmallItem
                              item={{
                                ...link,
                                onClick:
                                  link.href === "#documentation"
                                    ? () => setShowDocsView(true)
                                    : undefined,
                              }}
                              href={link.href}
                              className="gap-x-2"
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>

                {/* DOCUMENTATION DROPDOWN */}
                <NavigationMenuItem>
                  <NavigationMenuTrigger onClick={() => setShowDocsView(true)}>
                    Documentation
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="grid w-full md:w-[720px] md:grid-cols-[1fr_.45fr] p-2 bg-[#0A0A0A]">
                      <ul className="grid grow grid-cols-2 gap-2.5 p-3 md:border-r md:border-white/10">
                        {docsNavLinks.slice(0, 2).map((link, idx) => (
                          <li key={link.title}>
                            <NavGridCard
                              link={{
                                ...link,
                                onClick: () => {
                                  setActivePostId(idx + 1);
                                  setShowDocsView(true);
                                },
                              }}
                              className="min-h-[110px]"
                            />
                          </li>
                        ))}
                        <div className="col-span-2 grid grid-cols-2 gap-2">
                          {docsNavLinks.slice(2, 4).map((link, idx) => (
                            <li key={link.title}>
                              <NavLargeItem
                                link={{
                                  ...link,
                                  onClick: () => {
                                    setActivePostId(idx + 3);
                                    setShowDocsView(true);
                                  },
                                }}
                              />
                            </li>
                          ))}
                        </div>
                      </ul>
                      <ul className="space-y-2 p-3 flex flex-col justify-center">
                        {docsNavLinks.slice(4).map((link, idx) => (
                          <li key={link.title}>
                            <NavLargeItem
                              link={{
                                ...link,
                                onClick: () => {
                                  setActivePostId(idx + 5);
                                  setShowDocsView(true);
                                },
                              }}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>

                {/* DIRECT DOCS / ABOUT DEV LINK */}
                <NavigationMenuItem>
                  <NavigationMenuLink
                    onClick={() => setShowDocsView(true)}
                    className="cursor-pointer"
                  >
                    About Dev
                  </NavigationMenuLink>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>

            {/* Right CTAs & Mobile Drawer Trigger */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setLocation("/login")}
                className="font-sans font-medium text-sm text-white/70 hover:text-white transition-colors cursor-pointer px-3 py-1.5"
              >
                Log in
              </button>
              <button
                onClick={() => setLocation("/register")}
                className="bg-primary text-white rounded-lg py-2 px-5 text-sm font-bold hover:brightness-110 transition-all cursor-pointer shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98]"
              >
                Get Started
              </button>

              {/* Mobile Sheet Trigger */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="rounded-lg lg:hidden text-white hover:bg-white/10 border border-white/10 h-9 w-9 flex items-center justify-center"
                  >
                    <MenuIcon className="size-5" />
                    <span className="sr-only">Toggle navigation</span>
                  </Button>
                </SheetTrigger>
                <SheetContent
                  className="bg-[#0A0A0A]/95 backdrop-blur-2xl border-l border-white/10 w-full text-white gap-0 p-0"
                  showClose={false}
                >
                  <div className="flex h-16 items-center justify-between border-b border-white/10 px-6">
                    <div className="flex items-center gap-3">
                      <MeshworkLogo />
                      <span className="font-headline font-bold text-white text-base">
                        Meshwork Studio
                      </span>
                    </div>
                    <SheetClose asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="rounded-full text-white/60 hover:text-white hover:bg-white/10"
                      >
                        <XIcon className="size-5" />
                        <span className="sr-only">Close</span>
                      </Button>
                    </SheetClose>
                  </div>

                  <div className="overflow-y-auto px-6 pt-4 pb-12 space-y-6">
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem
                        value="product"
                        className="border-white/10"
                      >
                        <AccordionTrigger className="capitalize text-white font-medium hover:no-underline text-base py-3">
                          Product Features
                        </AccordionTrigger>
                        <AccordionContent className="space-y-1">
                          <ul className="grid gap-1 pt-1">
                            {productNavLinks.map((link) => (
                              <li key={link.title}>
                                <SheetClose asChild>
                                  <NavItemMobile
                                    item={link}
                                    href={link.href}
                                    onClick={() => {
                                      if (link.href === "#documentation") {
                                        setShowDocsView(true);
                                      }
                                    }}
                                  />
                                </SheetClose>
                              </li>
                            ))}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="docs" className="border-white/10">
                        <AccordionTrigger className="capitalize text-white font-medium hover:no-underline text-base py-3">
                          Technical Docs
                        </AccordionTrigger>
                        <AccordionContent className="space-y-1">
                          <ul className="grid gap-1 pt-1">
                            {docsNavLinks.map((link, idx) => (
                              <li key={link.title}>
                                <SheetClose asChild>
                                  <NavItemMobile
                                    item={link}
                                    href={link.href}
                                    onClick={() => {
                                      setActivePostId(idx + 1);
                                      setShowDocsView(true);
                                    }}
                                  />
                                </SheetClose>
                              </li>
                            ))}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>

                    <div className="pt-4 border-t border-white/10 flex flex-col gap-3">
                      <button
                        onClick={() => setShowDocsView(true)}
                        className="w-full py-3 rounded-lg bg-white/10 text-white font-medium text-sm hover:bg-white/15 transition-colors cursor-pointer"
                      >
                        Explore Documentation
                      </button>
                      <button
                        onClick={() => setLocation("/register")}
                        className="w-full py-3 rounded-lg bg-primary text-white font-bold text-sm hover:brightness-110 transition-colors cursor-pointer"
                      >
                        Get Started Free
                      </button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </motion.nav>
      )}

      <AnimatePresence mode="wait">
        {/* FULL-PAGE DOCUMENTATION VIEW */}
        {showDocsView ? (
          <motion.div
            key="docs-view"
            initial={{ opacity: 0, y: 25, filter: "blur(10px)", scale: 0.99 }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)", scale: 1 }}
            exit={{ opacity: 0, y: -20, filter: "blur(8px)", scale: 0.99 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="min-h-screen bg-[#0A0A0A] flex flex-col"
          >
            {/* Docs Top Bar: Exit Button on left, beside Logo */}
            <header className="h-16 border-b border-white/10 bg-[#0A0A0A]/95 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-50">
              <div className="flex items-center gap-4">
                {/* EXIT BUTTON */}
                <button
                  onClick={() => setShowDocsView(false)}
                  className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors border border-white/10 flex items-center justify-center gap-2 text-sm font-medium cursor-pointer"
                  title="Exit Documentation"
                  aria-label="Exit Documentation"
                >
                  <X className="w-4 h-4" />
                  <span className="hidden sm:inline">Exit</span>
                </button>

                {/* LOGO BESIDE EXIT BUTTON */}
                <div
                  onClick={() => setShowDocsView(false)}
                  className="flex items-center gap-3 cursor-pointer group"
                >
                  <div className="w-8 h-8 flex items-center justify-center transition-all group-hover:drop-shadow-[0_0_12px_rgba(26,115,232,0.5)]">
                    <MeshworkLogo />
                  </div>
                  <span className="text-lg font-headline font-bold tracking-tight text-white hidden sm:block">
                    Meshwork Studio
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono border border-blue-500/20">
                    Docs
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={handleCopyLink}
                  className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-white/70 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy link</span>
                </button>

                <button
                  onClick={() => setLocation("/register")}
                  className="bg-primary text-white rounded-lg py-1.5 px-4 text-xs font-bold hover:brightness-110 transition-all cursor-pointer"
                >
                  Get Started
                </button>
              </div>
            </header>

            {/* Docs Body Layout */}
            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
              <aside className="w-full lg:w-[280px] shrink-0 bg-[#0A0A0A] border-b lg:border-b-0 lg:border-r border-white/10">
                <DocsSidebar />
              </aside>

              <main className="flex-1 min-w-0 bg-[#0A0A0A] p-6 lg:p-12 overflow-y-auto max-h-[calc(100vh-4rem)]">
                <div className="max-w-4xl mx-auto">
                  {/* Breadcrumbs */}
                  <div className="flex items-center gap-2 text-[13px] font-medium text-white/40 font-sans tracking-wide mb-8">
                    <span
                      onClick={() => setShowDocsView(false)}
                      className="hover:text-white/70 transition-colors cursor-pointer"
                    >
                      Home
                    </span>
                    <ChevronRight className="w-3.5 h-3.5" />
                    <span>Documentation</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                    <span>{activePost.category}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                    <span className="text-white/70 truncate max-w-[200px]">
                      {activePost.title}
                    </span>
                  </div>

                  <motion.article
                    key={activePost.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="mb-10">
                      <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white mb-4 font-sans leading-tight">
                        {activePost.title}
                      </h1>
                      <p className="text-base sm:text-xl text-white/60 font-sans font-light leading-relaxed">
                        {activePost.subtitle}
                      </p>
                    </div>

                    <div className="prose prose-invert prose-blue max-w-none prose-pre:bg-transparent prose-pre:p-0 prose-p:leading-relaxed">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={markdownComponents}
                      >
                        {activePost.content || ""}
                      </ReactMarkdown>
                    </div>

                    <div className="mt-16 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between text-sm text-white/40 gap-4">
                      <div>Last updated: {activePost.date}</div>
                      <div>Written by {activePost.author}</div>
                    </div>
                  </motion.article>
                </div>
              </main>

              {/* Right TOC Sidebar */}
              {headings.length > 0 && (
                <aside className="hidden xl:block w-[240px] shrink-0 border-l border-white/10 p-6 overflow-y-auto max-h-[calc(100vh-4rem)] scrollbar-hide bg-[#0A0A0A]">
                  <h4 className="text-xs font-bold tracking-wider uppercase text-white/40 mb-4 font-sans">
                    On this page
                  </h4>
                  <ul className="space-y-2.5 text-[13px] font-sans font-medium">
                    {headings.map((heading) => (
                      <li
                        key={heading.id}
                        style={{ paddingLeft: `${(heading.level - 2) * 10}px` }}
                      >
                        <a
                          href={`#${heading.id}`}
                          className={cn(
                            "block transition-colors leading-snug",
                            activeHeadingId === heading.id
                              ? "text-blue-400 font-semibold"
                              : "text-white/50 hover:text-white/80",
                          )}
                          onClick={(e) => {
                            e.preventDefault();
                            document
                              .getElementById(heading.id)
                              ?.scrollIntoView({ behavior: "smooth" });
                          }}
                        >
                          {heading.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </aside>
              )}
            </div>
          </motion.div>
        ) : (
          /* MAIN LANDING PAGE VIEW */
          <motion.div
            key="landing-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* HERO SECTION — subtle, elegant dark atmospheric gradient starting from bottom */}
            <main className="w-full relative z-10 min-h-screen flex flex-col items-center justify-center overflow-x-hidden pt-16 bg-[#080911]">
              <div className="absolute inset-0 pointer-events-none -z-10 overflow-hidden">
                {/* Subtle Top-center Deep Blue Veil */}
                <div className="absolute -top-[20%] left-[20%] right-[20%] h-[40vh] rounded-full bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.18)_0%,_transparent_70%)] blur-[90px]" />
                {/* Refined Bottom Glow starting from the bottom — Blue / Indigo / Magenta */}
                <div className="absolute -bottom-[10%] left-[10%] right-[10%] h-[45vh] rounded-full bg-[radial-gradient(ellipse_at_bottom,_rgba(236,72,153,0.35)_0%,_rgba(139,92,246,0.30)_35%,_rgba(59,130,246,0.22)_65%,_transparent_85%)] blur-[90px]" />
                {/* Soft ambient dark vignette */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(8,9,17,0.3)_0%,_transparent_80%)]" />
              </div>
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="flex flex-col items-center text-center px-4 w-full max-w-2xl mx-auto"
              >
                <motion.h1
                  variants={heroItemVariants}
                  className="text-[clamp(2rem,5vw,3.5rem)] font-bold text-white leading-[1.1] tracking-tight mb-4"
                  style={{ fontFamily: "var(--font-headline)" }}
                >
                  Build with Meshwork Studio
                </motion.h1>
                <motion.p
                  variants={heroItemVariants}
                  className="text-[15px] text-white/50 font-medium max-w-[440px] mb-10 leading-relaxed"
                >
                  Describe your infrastructure and Mosh AI generates a complete,
                  interactive cloud diagram — instantly.
                </motion.p>
                <motion.div
                  variants={heroItemVariants}
                  className="w-full max-w-xl flex justify-center"
                >
                  <PromptInput
                    initialExpanded={true}
                    onSubmit={(val, meta) => {
                      if (val.trim()) {
                        localStorage.setItem("meshwork_pending_prompt", val);
                        if (meta?.model) {
                          localStorage.setItem(
                            "meshwork_pending_model",
                            meta.model,
                          );
                        }
                      }
                      setLocation("/register");
                    }}
                    placeholder="Describe your infrastructure, e.g. A multi-region Kubernetes cluster..."
                  />
                </motion.div>
              </motion.div>
            </main>

            {/* TEMPLATES SECTION */}
            <section
              id="templates"
              className="w-full relative z-10 py-20 border-t border-white/10"
            >
              <div className="max-w-6xl mx-auto px-6">
                <div className="text-center mb-14">
                  <h2 className="font-sans text-fluid-h1 font-bold text-white tracking-tight">
                    Templates ready to Remix
                  </h2>
                </div>

                <div className="border-t border-white/[0.06] mb-10" />

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {activeTemplates.map((template) => {
                    const BRAND_LOGOS: Record<string, React.ReactNode> = {
                      go: (
                        <svg
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="w-6 h-6 text-[#00ACD7]"
                        >
                          <path d="M1.811 10.231c-.047 0-.058-.023-.035-.059l1.73-1.922a.106.106 0 01.1-.03c.033.014.064.053.064.086v3.578c0 .05-.044.1-.114.1a.106.106 0 01-.1-.059l-.795-1.078a.106.106 0 01-.04-.092c0-.033.02-.064.053-.08l.053-.021c.03-.012.064-.007.097.012l1.507 1.023c.04.028.1.018.132-.02.033-.04.023-.1-.017-.123L4.06 9.362c-.03-.02-.064-.035-.1-.035s-.07.015-.1.037l-1.54 1.14a.116.116 0 00-.04.092c0 .033.02.064.053.08l.053.021c.03.012.064.007.097-.012l1.697-1.178c.04-.028.1-.018.132.02.033.04.023.1-.017.123l-.86 1.156a.106.106 0 01-.1.059l-.114-.096zm11.386-3.266c-1.594 0-2.876 1.214-2.876 2.71s1.282 2.71 2.876 2.71c1.594 0 2.876-1.214 2.876-2.71s-1.282-2.71-2.876-2.71zm0 4.36c-.638 0-1.153-.49-1.153-1.097s.515-1.097 1.153-1.097c.638 0 1.154.49 1.154 1.097s-.516 1.097-1.154 1.097zm6.224-1.293c-.638 0-1.154.49-1.154 1.097s.516 1.097 1.154 1.097c.638 0 1.153-.49 1.153-1.097s-.515-1.097-1.153-1.097zm-2.71.618c0 1.594-1.282 2.71-2.876 2.71-1.594 0-2.876-1.214-2.876-2.71 0-1.494 1.282-2.71 2.876-2.71 1.594 0 2.876 1.216 2.876 2.71z" />
                        </svg>
                      ),
                      flutter: (
                        <svg
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="w-6 h-6 text-[#02569B]"
                        >
                          <path d="M13.9 2L3.6 12.2l2.6 2.6L12 8.3l7.4 6.5 2.6-2.6L13.9 2zm-2.3 5.2L7.5 13.5l4.1 3.6 4.1-4.3H11.6z" />
                        </svg>
                      ),
                      kubernetes: (
                        <svg
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="w-6 h-6 text-[#326CE5]"
                        >
                          <path d="M13.26 3.2s.13.08.17.14c-.33-.07-.67-.12-1.02-.1a3.79 3.79 0 00-.2 1.75c0 .82.16 1.52.44 2.15.1-.84.3-1.56.6-2.16a3.63 3.63 0 00.01-1.63zm-1.515.93c1.06-.04 1.99.34 2.74.95-.17.48-.39.98-.65 1.5-.46-.59-1.06-1.07-1.79-1.38a3.63 3.63 0 00-.3-1.07zm1.06 1.35c.5.46.86 1.05 1.04 1.74-.36.36-.76.68-1.2.95a3.63 3.63 0 01.16-2.69zm4.44-.6c.95.6 1.64 1.5 2 2.58-.54.26-1.14.45-1.8.52.06-.6.06-1.22.02-1.82-.03-.46-.13-.92-.29-1.35.04-.03.04-.06.07-.09zm-5.2 2.07a9.3 9.3 0 01-.26-.26c-.72-.73-1.48-1.4-2.26-2.01.1.64.46 1.2.97 1.63a4.1 4.1 0 011.46.63zm-2.38-1.37a6.08 6.08 0 012.59-.52c.43.01.84.07 1.24.17.02.11.03.22.03.34 0 .7-.2 1.35-.54 1.92.39.46.72.98.97 1.55-1.53-.54-2.6-.5-3.07.28a2.94 2.94 0 00-.22-1.59 5.78 5.78 0 00-.08-1.15zm4.11-.17c.07-.37.08-.75.06-1.13.07.38.08.76.06 1.13h-.02c.05-.37.01-.75-.1-1.13zm-2.46 5.7a4.1 4.1 0 00.92-2.53 6.3 6.3 0 01.55-1.48c1.63.64 2.93 1.77 3.9 3.24-1.38.56-2.94.82-4.58.73a8.5 8.5 0 01-.79-.96zm-.52 3.12c.75.15 1.56.17 2.38.05a5.6 5.6 0 00-1.14-1.7 5.75 5.75 0 00-2.54-1.48c-1.76-.54-3.67-.45-5.47.27-.18 1.27.01 2.53.57 3.67h.2c.96-.7 2.1-1.24 3-1.19 1.56 0 2.9.8 3.8.38zm-2.95-1.2c-.95.3-2 .63-2.75 1.73-1.66 1.62-2.6 3.96-2.4 6.49.3 1.85.43 3.88.72 5.76-1.53.88-2.57 2.42-2.57 4.24 0 .55.07 1.08.2 1.58.28-.14.57-.28.86-.43a.36.36 0 01.46.2l3.1 5.53c.13.24.47.3.7.14a7.6 7.6 0 002.71-2.71.35.35 0 01.46-.1c.17.1.33.2.5.3.06.35.16.85.3 1.5.11.47.35.89.83 1.06.3.1.62.05.9-.15a.43.43 0 01.47.07l.62.62a.36.36 0 01-.07.54 8.6 8.6 0 01-3.34 2.03c-.34.1-.58.37-.68.7a6.2 6.2 0 01-.28 1.53 6.46 6.46 0 01-1.26 2.46c-.17.2-.18.48-.02.68l.73.87a.36.36 0 01-.1.54c-.6.4-1.3.65-2.04.72a.42.42 0 01-.47-.32c-.34-1.2-.75-2.43-.97-3.68-.04-.24-.07-.47-.1-.7a6.13 6.13 0 01-1.47 3.73c-.17.2-.18.48-.02.68l.73.87a.36.36 0 01-.1.54c-.6.4-1.3.65-2.04.72a.42.42 0 01-.47-.32c-.34-1.2-.75-2.43-.97-3.68a8 8 0 01-.1-.7 8.4 8.4 0 01-.13-3.6c.17-.94.53-1.8 1.05-2.53a5.66 5.66 0 00-2.7-1.5c-.56-.13-1.13-.17-1.7-.1a.36.36 0 01-.42-.24 7.3 7.3 0 01-.16-1.07 5.22 5.22 0 01.85-3.3z" />
                        </svg>
                      ),
                      react: (
                        <svg
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="w-6 h-6 text-[#61DAFB]"
                        >
                          <path d="M12 9.5c-.8 0-1.55.16-2.25.44a6.5 6.5 0 00-1.73 1.12h-.01A6.5 6.5 0 005 14.5c0 .5.06.98.17 1.45.38-.1.77-.18 1.18-.24A6.5 6.5 0 0112 9.5zm0 9.5a6.5 6.5 0 01-2.35-.44c-.41.06-.8.13-1.18.24A6.5 6.5 0 018.5 14.5a6.5 6.5 0 01.01-1.3h.01A6.5 6.5 0 0112 14.5zm0-3.18a3.32 3.32 0 100-6.64 3.32 3.32 0 000 6.64zm0-8.66a6.5 6.5 0 012.35.44c.41-.06.8-.13 1.18-.24V6.05a6.5 6.5 0 01-3.53.93zm8.23 5.13a6.5 6.5 0 01-1.73-1.12h-.01c-.44.18-.94.34-1.48.46a6.5 6.5 0 01.24 3.28v.01h.01a6.5 6.5 0 003.53-1.17 6.5 6.5 0 01-.46-2.46zm-1.77 2.3c-.1-.5-.25-.98-.45-1.43a6.5 6.5 0 01-2.35 1.13c.12.5.19 1.02.22 1.55h.01c.33 0 .65-.02.96-.07.08.16.16.32.22.49a6.5 6.5 0 012.39-1.67zm1.85 3.32a6.5 6.5 0 01-3.53 1.17v.01a6.5 6.5 0 01-2.93-1.5 6.5 6.5 0 01-.01 1.3h.01a6.5 6.5 0 003.53.93c.51 0 1-.06 1.47-.17.1.45.17.93.22 1.43h.01a6.5 6.5 0 001.2-2.68zm-1.2 3.23a6.5 6.5 0 01-2.39-1.67 6.5 6.5 0 01-1.25 2.55 6.5 6.5 0 013.53.93 6.5 6.5 0 01.2-1.63v-.01a6.5 6.5 0 01-.09-.17zm2.35-2.74a6.5 6.5 0 01-1.2 2.68 6.54 6.54 0 01-2 .62 6.5 6.5 0 01-.22-1.55h-.01a6.5 6.5 0 01-.22-.49 6.5 6.5 0 012.93 1.5 6.5 6.5 0 01.28-1.5 6.5 6.5 0 01.44-.26zm-3.44 2.24a5.7 5.7 0 00-.02-.58 6.5 6.5 0 00-2.93-1.5 6.5 6.5 0 00-.24 1.55l.01.01a6.5 6.5 0 002.93 1.5c.5 0 .98-.07 1.43-.2a6.5 6.5 0 00-.22-.78zm-2.93-4.5a6.5 6.5 0 00-.22 1.55l.01.01a6.5 6.5 0 012.93-1.5c.5 0 .98.07 1.43.2a6.5 6.5 0 002.39-1.67 6.5 6.5 0 00-5.75 1.41zm.46 2.29a6.5 6.5 0 01-2.39 1.67 6.5 6.5 0 01-1.25-2.55 6.5 6.5 0 012.93-1.5 6.5 6.5 0 01.71 2.38zm5.26-5.14a6.5 6.5 0 012.93 1.5 6.5 6.5 0 01.46 2.46l.01-.01a6.5 6.5 0 01-3.53.93c-.33 0-.65-.03-.96-.09a6.5 6.5 0 01.22-1.73c.45.05.94.07 1.46.07a3.32 3.32 0 000-6.64h.02c-.03.17-.06.34-.09.5a6.5 6.5 0 01-.82.05zM12 0a12 12 0 100 24A12 12 0 0012 0z" />
                        </svg>
                      ),
                      "python-sdk": (
                        <svg
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="w-6 h-6 text-[#3776AB]"
                        >
                          <path d="M12 0C5.37 0 5.36.04 5.36.04v3.2h-.04C5.04 3.32 5 3.28 5 3.28S8.52 1 12 1c3.52 0 7 .04 7 1.28v-.04h.04c.04 1.24.04 1.28.04 1.28S18.64 0 12 0zm-1.6 3.2h3.2c.32 0 .64.04.84.12V4c0 .04-.04.12-.16.12H10.4c-.16 0-.24-.08-.24-.12v-.8c.08-.08.44-.12.64-.12zM19.2 5h-.12c-.6 0-1.24.08-1.76.24a5.88 5.88 0 00-3.48-.56A5.9 5.9 0 009.84 5.6 5.88 5.88 0 009.28 7.6l.8.4-1.12.96-.8-.4-.96.8 2.48 1.04 2.48-1.04.8.4 2.48-1.04-2.48-1.04-.8.4-.96-.8-1.12.96.8-.4a5.88 5.88 0 00-2.88 3.52 5.9 5.9 0 003.52-1.72A5.88 5.88 0 0015.2 17.2v.08l-.24.4c.16.4.4.72.72.96a3.2 3.2 0 00-1.28 2.56 3.2 3.2 0 003.2 3.2 3.2 3.2 0 003.2-3.2V5h-1.6zm0 14.4a1.6 1.6 0 01-1.6-1.6 1.6 1.6 0 011.6-1.6 1.6 1.6 0 011.6 1.6 1.6 1.6 0 01-1.6 1.6zm-17.6-3.2A1.6 1.6 0 010 14.4a1.6 1.6 0 011.6-1.6h.32A1.6 1.6 0 014.48 14.4a1.6 1.6 0 01-1.6 1.6h-.32zm1.6-4.8H0V7.2h2.24v.08c.8-2 2.56-2.64 4.32-2.64A5.92 5.92 0 0112 9.2a5.92 5.92 0 01-5.44 5.52l-2.72 1.44 1.04-2.72A5.88 5.88 0 011.6 11.6z" />
                        </svg>
                      ),
                      opencalw: (
                        <svg
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="w-6 h-6 text-[#EF4444]"
                        >
                          <path d="M12 2C9 2 7 4 7 7v1H6c-2.2 0-4 1.8-4 4v7c0 2.2 1.8 4 4 4h12c2.2 0 4-1.8 4-4v-7c0-2.2-1.8-4-4-4h-1V7c0-3-2-5-5-5zM9 7c0-1.7 1.3-3 3-3s3 1.3 3 3v1H9V7zm3 10c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3-6H6V7h12v4z" />
                        </svg>
                      ),
                    };

                    const logo = BRAND_LOGOS[template.slug || template.id] || (
                      <Sparkles className="w-5 h-5 text-white/60" />
                    );

                    return (
                      <div
                        key={template.id}
                        onClick={() => handleTemplateClick(template)}
                        className="group relative cursor-pointer rounded-2xl bg-[#090b10]/90 border border-white/[0.08] hover:border-blue-500/50 p-6 flex flex-col justify-between h-[210px] transition-all duration-300 hover:shadow-[0_10px_35px_rgba(37,99,235,0.18)] hover:-translate-y-1 overflow-hidden"
                      >
                        {/* Glistening border sheen on hover / active */}
                        <div
                          aria-hidden="true"
                          className="absolute -inset-[1px] rounded-[17px] pointer-events-none p-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"
                          style={{
                            background:
                              "linear-gradient(115deg, transparent 0%, rgba(255,255,255,0.5) 20%, rgba(59,130,246,0.5) 50%, transparent 80%)",
                            backgroundSize: "250% 250%",
                            animation: "glisten-sweep 8s linear infinite",
                            WebkitMask:
                              "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                            WebkitMaskComposite: "xor",
                            maskComposite: "exclude",
                          }}
                        />

                        {/* Top Header: Title Left, Brand Logo Right */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-white text-xl font-bold font-sans tracking-tight group-hover:text-blue-400 transition-colors">
                              {template.title}
                            </h3>
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] group-hover:border-white/20 transition-all">
                              {logo}
                            </div>
                          </div>

                          {/* Description */}
                          <p className="text-white/50 text-sm leading-relaxed font-sans line-clamp-3">
                            {template.description}
                          </p>
                        </div>

                        {/* Footer Stats & Remix indicator */}
                        <div className="flex items-center justify-between pt-4 border-t border-white/[0.05] mt-auto text-xs text-white/40 font-mono">
                          <div className="flex items-center gap-1.5 text-white/50 group-hover:text-white/80 transition-colors">
                            <span className="text-xs">☆</span>
                            <span>
                              {template.stars ||
                                `${template.nodes.length} nodes`}
                            </span>
                          </div>
                          <span className="text-[11px] font-sans font-semibold text-blue-400/80 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all flex items-center gap-1">
                            Remix <span className="text-xs">→</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* CALL TO ACTION */}
            <section className="relative min-h-[60vh] flex items-center justify-center border-t border-white/10 overflow-hidden">
              <div className="absolute inset-0 z-0">
                {/* eslint-disable-next-line no-secrets/no-secrets */}
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNCkiLz48L3N2Zz4=')] bg-[length:24px_24px] bg-repeat [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
              </div>

              <div className="relative z-10 w-full max-w-2xl mx-auto px-6 text-center">
                <motion.div
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  viewport={{ once: true, margin: "-15%" }}
                >
                  <h2 className="font-sans text-fluid-h1 font-medium text-white tracking-tight leading-tight mb-12">
                    Bring your ideas to life
                  </h2>

                  <div className="bg-[#1a1a1d] rounded-xl border border-white/[0.08] flex items-center px-5 py-3.5 gap-3 mb-8">
                    <span className="text-white/30 text-sm font-sans flex-1 text-left">
                      Describe your infrastructure in a sentence or two
                    </span>
                    <button
                      onClick={() => setLocation("/register")}
                      className="text-white/40 text-sm font-medium whitespace-nowrap hover:text-white/60 transition-colors cursor-pointer"
                    >
                      Get started
                    </button>
                  </div>

                  <div className="flex flex-col items-start gap-3 max-w-md mx-auto">
                    <div className="flex items-center gap-3 text-white/35 text-sm">
                      <Network className="w-4 h-4 shrink-0" />
                      <span>
                        A multi-region Kubernetes cluster with auto-scaling
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-white/35 text-sm">
                      <Sparkles className="w-4 h-4 shrink-0" />
                      <span>
                        A real-time data pipeline with event-driven triggers
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-white/35 text-sm">
                      <Terminal className="w-4 h-4 shrink-0" />
                      <span>Help me design a serverless API gateway</span>
                    </div>
                  </div>
                </motion.div>
              </div>
            </section>

            {/* HIDDEN CRAWLABLE CONTENT FOR GOOGLEBOT / SEO INDEXING */}
            <div className="sr-only aria-hidden" aria-hidden="true">
              {blogPosts.map((post) => (
                <article key={post.id}>
                  <h2>{post.title}</h2>
                  <p>{post.subtitle}</p>
                  <div>{post.content}</div>
                </article>
              ))}
            </div>

            {/* FOOTER */}
            <footer className="w-full bg-background relative z-10 border-t border-white/10">
              <div className="max-w-6xl mx-auto px-6 py-16">
                <div className="flex flex-col md:flex-row justify-between items-start gap-14">
                  <div className="flex flex-col gap-5 max-w-xs">
                    <h3 className="font-sans text-xl font-medium text-white leading-snug">
                      Start exploring and building
                      <br />
                      with Meshwork Studio.
                    </h3>
                    <button
                      onClick={() => setLocation("/register")}
                      className="text-white text-sm font-medium border border-white/20 rounded-full px-6 py-2.5 hover:bg-white/[0.06] transition-all w-fit cursor-pointer"
                    >
                      Sign up and get started
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-10 md:gap-14">
                    <div className="flex flex-col gap-3">
                      <h4 className="font-sans font-semibold text-white text-sm mb-1">
                        Platform
                      </h4>
                      <a
                        href="#features"
                        className="text-white/40 hover:text-white transition-colors text-sm"
                      >
                        Canvas
                      </a>
                      <Link href="/templates">
                        <span className="text-white/40 hover:text-white transition-colors text-sm cursor-pointer">
                          Templates
                        </span>
                      </Link>
                    </div>
                    <div className="flex flex-col gap-3">
                      <h4 className="font-sans font-semibold text-white text-sm mb-1">
                        Product
                      </h4>
                      <a
                        href="#features"
                        className="text-white/40 hover:text-white transition-colors text-sm"
                      >
                        Features
                      </a>
                      <button
                        onClick={() => setShowDocsView(true)}
                        className="text-white/40 hover:text-white transition-colors text-sm text-left cursor-pointer"
                      >
                        Documentation
                      </button>
                    </div>
                    <div className="flex flex-col gap-3">
                      <h4 className="font-sans font-semibold text-white text-sm mb-1">
                        Resources
                      </h4>
                      <button
                        onClick={() => setShowDocsView(true)}
                        className="text-white/40 hover:text-white transition-colors text-sm text-left cursor-pointer"
                      >
                        Docs & Blog
                      </button>
                      <a
                        href="https://github.com/Andiewitz/Meshwork-Studio_/discussions"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/40 hover:text-white transition-colors text-sm"
                      >
                        Community
                      </a>
                    </div>
                    <div className="flex flex-col gap-3">
                      <h4 className="font-sans font-semibold text-white text-sm mb-1">
                        Legal
                      </h4>
                      <Link href="/privacy">
                        <span className="text-white/40 hover:text-white transition-colors text-sm cursor-pointer">
                          Privacy
                        </span>
                      </Link>
                      <Link href="/terms">
                        <span className="text-white/40 hover:text-white transition-colors text-sm cursor-pointer">
                          Terms
                        </span>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>

              <div className="w-full overflow-hidden pb-8 pt-4">
                <div className="max-w-6xl mx-auto px-6">
                  <h2
                    className="font-sans font-bold text-[clamp(3rem,10vw,8rem)] text-white/[0.06] leading-none tracking-tighter select-none"
                    aria-hidden="true"
                  >
                    Meshwork Studio
                  </h2>
                </div>
              </div>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Home;
