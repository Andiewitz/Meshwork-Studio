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
  const [activeCategory, setActiveCategory] =
    useState<TemplateDefinition["category"]>("Featured");

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

  const activeTemplates = PRELOADED_TEMPLATES.filter(
    (t) => t.category === activeCategory,
  );

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

  const heroBadgeVariants: Variants = {
    hidden: { opacity: 0, y: -18, scale: 0.94, filter: "blur(10px)" },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      transition: { duration: 0.75, ease: [0.16, 1, 0.3, 1] },
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
          className="fixed top-0 left-0 right-0 z-50 bg-[#09090b]/80 backdrop-blur-xl border-b border-white/[0.08] shadow-[0_4px_30px_rgba(0,0,0,0.5)] transition-all duration-300"
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
            {/* Background Atmosphere */}
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 overflow-hidden pointer-events-none -z-10 technical-gradient"
            >
              <div className="absolute top-[10%] left-[10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[150px]" />
              <div className="absolute top-[20%] right-[10%] w-[30%] h-[50%] rounded-full bg-purple-500/10 blur-[150px]" />
              <div
                className="absolute inset-0 opacity-[0.03]"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(26,115,232,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(26,115,232,0.06) 1px, transparent 1px)",
                  backgroundSize: "100px 100px",
                }}
              />
            </motion.div>

            {/* HERO SECTION */}
            <main className="w-full relative z-10 min-h-screen flex flex-col items-center justify-center overflow-x-hidden pt-16">
              <div className="absolute inset-0 z-[-1] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/10 via-[#09090b] to-[#09090b]">
                {/* eslint-disable-next-line no-secrets/no-secrets */}
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] bg-[length:24px_24px] bg-repeat [mask-image:radial-gradient(ellipse_at_top,black_40%,transparent_70%)] opacity-70" />
              </div>

              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="flex flex-col items-center text-center px-4"
              >
                {/* Smooth Badge Reveal */}
                <motion.div
                  variants={heroBadgeVariants}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-xs font-medium text-white/80 backdrop-blur-md mb-6 shadow-lg shadow-black/20"
                >
                  <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
                  <span>Mosh AI 2.0 Infrastructure Co-Pilot — Now Live</span>
                </motion.div>

                <motion.h1
                  variants={heroItemVariants}
                  className="text-fluid-hero font-medium font-sans text-white leading-[1.08] tracking-tight mb-6 drop-shadow-md max-w-4xl"
                >
                  Build with Meshwork Studio
                </motion.h1>
                <motion.p
                  variants={heroItemVariants}
                  className="text-fluid-body text-white/60 font-medium tracking-wide max-w-[650px] mb-8 leading-relaxed"
                >
                  Go from prompt to production with automated infrastructure,
                  seamless scaling, and interactive architecture documentation.
                </motion.p>
                <motion.div
                  variants={heroItemVariants}
                  className="w-full max-w-xl flex justify-center mb-8"
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
                <motion.div variants={heroItemVariants} className="flex gap-4">
                  <button
                    onClick={() => setLocation("/register")}
                    className="bg-primary text-white rounded-lg py-3 px-8 text-base font-bold hover:brightness-110 transition-all cursor-pointer shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Get Started
                  </button>
                  <button
                    onClick={() => setShowDocsView(true)}
                    className="bg-white/10 text-white hover:bg-white/20 rounded-lg py-3 px-8 text-base font-bold transition-all cursor-pointer flex items-center gap-2 backdrop-blur-sm hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <BookOpen className="w-5 h-5" /> Explore Documentation
                  </button>
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

                  <div className="flex flex-wrap justify-center gap-2 mt-10">
                    {[
                      "Featured",
                      "Cloud Architectures",
                      "Full-Stack",
                      "Data Pipelines",
                    ].map((category) => (
                      <button
                        key={category}
                        onClick={() =>
                          setActiveCategory(
                            category as TemplateDefinition["category"],
                          )
                        }
                        className={`rounded-full px-5 py-2 text-[13px] font-medium flex items-center gap-2 transition-all ${
                          activeCategory === category
                            ? "bg-white/[0.08] text-white border border-white/10 backdrop-blur-sm"
                            : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
                        }`}
                      >
                        {category === "Featured" && (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        {category === "Cloud Architectures" && (
                          <Network className="w-3.5 h-3.5" />
                        )}
                        {category === "Full-Stack" && (
                          <FileCode2 className="w-3.5 h-3.5" />
                        )}
                        {category === "Data Pipelines" && (
                          <GitBranch className="w-3.5 h-3.5" />
                        )}
                        {category}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-white/[0.06] mb-10" />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {activeTemplates.map((template, idx) => {
                    const colors = [
                      "from-indigo-500/[0.07] via-transparent to-purple-600/[0.05]",
                      "from-emerald-500/[0.07] via-transparent to-teal-600/[0.05]",
                      "from-blue-500/[0.07] via-transparent to-indigo-600/[0.05]",
                    ];
                    const bgClass = colors[idx % colors.length];

                    return (
                      <div
                        key={template.id}
                        className="group cursor-pointer"
                        onClick={() => handleTemplateClick(template)}
                      >
                        <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-[#0f1114] border border-white/[0.06] mb-5 transition-all duration-300 group-hover:border-white/15 group-hover:-translate-y-1 group-hover:shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
                          <div
                            className={`absolute inset-0 bg-gradient-to-br ${bgClass}`}
                          />
                          <div className="absolute inset-0 p-5 flex flex-col justify-between opacity-40 group-hover:opacity-60 transition-opacity">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-red-400/60" />
                              <div className="w-2 h-2 rounded-full bg-yellow-400/60" />
                              <div className="w-2 h-2 rounded-full bg-green-400/60" />
                            </div>
                            <div className="space-y-2">
                              <div className="h-1.5 w-3/4 bg-white/10 rounded-full" />
                              <div className="h-1.5 w-1/2 bg-white/10 rounded-full" />
                              <div className="h-1.5 w-2/3 bg-white/10 rounded-full" />
                            </div>
                          </div>
                        </div>
                        <h3 className="text-white font-semibold text-base mb-1.5 group-hover:text-primary transition-colors">
                          {template.title}
                        </h3>
                        <p className="text-white/40 text-sm leading-relaxed">
                          {template.description}
                        </p>
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
