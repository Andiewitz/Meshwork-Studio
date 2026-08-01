import { useState, useEffect, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import {
  MagnifyingGlassIcon as Search,
  ChevronRightIcon as ChevronRight,
  Bars3Icon as Menu,
  XMarkIcon as X,
  DocumentDuplicateIcon as Copy,
  BookOpenIcon as BookOpen,
} from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

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

## AI Metadata Fields

Every node and edge carries an \`ai\` sub-object — never rendered directly in the UI, but used by Mosh as working memory across follow-up prompts. Fields include \`summary\` (Mosh's understanding of the component's role), \`notes\` (extended design observations), and \`lastAnalyzed\` (ISO 8601 timestamp of the last Mosh interaction).

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
  "position": { "x": 0, "y": -120 },
  "width": 600,
  "height": 100,
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

// Helper to extract headings from markdown for the right-side TOC
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

export default function DevDocs() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activePostId, setActivePostId] = useState<number>(blogPosts[0].id);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
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

  // Group posts by category
  const categoriesMap = useMemo(() => {
    const map: Record<string, BlogPost[]> = {};
    blogPosts.forEach((post) => {
      if (!map[post.category]) map[post.category] = [];
      map[post.category].push(post);
    });
    return map;
  }, []);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({
      title: "Link Copied",
      description: "Documentation link copied to clipboard.",
    });
  };

  // Scroll spy for TOC
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveHeadingId(entry.target.id);
          }
        });
      },
      { rootMargin: "0px 0px -80% 0px" }, // trigger near top
    );

    headings.forEach((heading) => {
      const el = document.getElementById(heading.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings, activePostId]);

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
          className="text-2xl font-semibold mt-16 mb-4 text-white/90 border-b border-white/10 pb-2 font-sans tracking-tight"
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
        className="leading-relaxed mb-6 text-white/70 font-sans font-light"
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
      // Look for github style alerts like > [!NOTE]
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
          <div className="bg-[#1a1a1a] px-4 py-2.5 text-xs text-white/40 font-mono border-b border-white/5 flex justify-between items-center">
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

  const Sidebar = () => (
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

      <div className="flex-1 overflow-y-auto p-4 space-y-8 scrollbar-hide">
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
                      onClick={() => {
                        setActivePostId(post.id);
                        setIsMobileNavOpen(false);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
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

  const canonicalUrl = `https://meshwork-studio.duckdns.org/docs`;
  const pageTitle = `${activePost.title} — Meshwork Studio Docs`;
  const pageDescription = activePost.subtitle;

  return (
    <div className="flex min-h-screen bg-[#0A0A0A] text-white">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="Meshwork Studio" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={pageDescription} />
        <meta name="robots" content="index, follow" />
      </Helmet>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-[280px] shrink-0 sticky top-16 h-[calc(100vh-64px)] overflow-hidden">
        <Sidebar />
      </aside>

      {/* Mobile Nav Toggle */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-[#0A0A0A]/90 backdrop-blur-xl border-b border-white/10 z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-2 font-medium text-sm">
          <BookOpen className="w-4 h-4 text-blue-400" />
          <span>Documentation</span>
        </div>
        <button
          onClick={() => setIsMobileNavOpen(true)}
          className="p-2 -mr-2 text-white/60 hover:text-white"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile Nav Drawer */}
      <AnimatePresence>
        {isMobileNavOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileNavOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-[280px] bg-[#0A0A0A] z-[70] lg:hidden shadow-2xl border-r border-white/10"
            >
              <div className="absolute top-2 right-2 z-10">
                <button
                  onClick={() => setIsMobileNavOpen(false)}
                  className="p-2 text-white/50 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <Sidebar />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 bg-[#0A0A0A] flex pt-14 lg:pt-0">
        <div className="flex-1 px-6 lg:px-12 py-10 lg:py-16 max-w-[800px] mx-auto lg:mx-0 w-full">
          {/* Breadcrumbs & Copy */}
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-2 text-[13px] font-medium text-white/40 font-sans tracking-wide">
              <a href="/docs" className="hover:text-white/70 transition-colors">
                Docs
              </a>
              <ChevronRight className="w-3.5 h-3.5" />
              <span>{activePost.category}</span>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-white/70 truncate max-w-[200px]">
                {activePost.title}
              </span>
            </div>

            <button
              onClick={handleCopyLink}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-white/70 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Copy page</span>
            </button>
          </div>

          <motion.article
            key={activePost.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Header */}
            <div className="mb-12">
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-6 font-sans leading-tight">
                {activePost.title}
              </h1>
              <p className="text-lg sm:text-xl text-white/60 font-sans font-light leading-relaxed">
                {activePost.subtitle}
              </p>
            </div>

            {/* Markdown Body */}
            <div className="prose prose-invert prose-blue max-w-none prose-pre:bg-transparent prose-pre:p-0 prose-p:leading-relaxed">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {activePost.content || ""}
              </ReactMarkdown>
            </div>

            {/* Footer */}
            <div className="mt-20 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between text-sm text-white/40 gap-4">
              <div>Last updated: {activePost.date}</div>
              <div>Written by {activePost.author}</div>
            </div>
          </motion.article>
        </div>

        {/* Right Sidebar (Table of Contents) */}
        {headings.length > 0 && (
          <aside className="hidden xl:block w-[240px] shrink-0 sticky top-16 h-[calc(100vh-64px)] overflow-y-auto py-16 pr-8 pl-4 border-l border-white/5 scrollbar-hide">
            <h4 className="text-xs font-bold tracking-wider uppercase text-white/40 mb-4 font-sans">
              On this page
            </h4>
            <ul className="space-y-2.5 text-[13px] font-sans font-medium">
              {headings.map((heading) => (
                <li
                  key={heading.id}
                  style={{ paddingLeft: `${(heading.level - 2) * 12}px` }}
                >
                  <a
                    href={`#${heading.id}`}
                    className={cn(
                      "block transition-colors leading-snug",
                      activeHeadingId === heading.id
                        ? "text-blue-400"
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
      </main>
    </div>
  );
}
