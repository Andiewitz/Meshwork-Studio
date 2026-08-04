import React from "react";
import { SystemNode } from "@/components/canvas/nodes/SystemNode";
import {
  K8sPodIcon,
  K8sDeployIcon,
  K8sReplicaSetIcon,
  K8sStatefulIcon,
  K8sDaemonIcon,
  K8sServiceIcon,
  K8sIngressIcon,
  K8sConfigMapIcon,
  K8sSecretIcon,
  K8sPVCIcon,
  K8sJobIcon,
  K8sCronJobIcon,
  K8sHPAIcon,
  K8sNamespaceIcon,
} from "@/components/canvas/icons/KubernetesIcons";

import {
  ServerIcon as Server,
  CircleStackIcon as Database,
  CpuChipIcon as Cpu,
  GlobeAltIcon as Globe,
  ChatBubbleLeftIcon as MessageSquare,
  CircleStackIcon as HardDrive,
  BoltIcon as Zap,
  CubeIcon as Box,
  ShareIcon as Share2,
  PlayIcon as PlayCircle,
  ShareIcon as GitBranch,
  Cog6ToothIcon as Settings,
  ShieldCheckIcon as Shield,
  LockClosedIcon as Lock,
  KeyIcon as Key,
  ChartBarIcon as Activity,
  ChartBarIcon as BarChart3,
  ChartPieIcon as PieChart,
  Square2StackIcon as Square,
  HashtagIcon as Type,
  CreditCardIcon as CreditCard,
  ChatBubbleLeftRightIcon as MessageCircle,
  ShoppingCartIcon as ShoppingCart,
  MagnifyingGlassIcon as Search,
  UserIcon,
  Square2StackIcon as Layers,
  ShareIcon as Network,
  DevicePhoneMobileIcon as Smartphone,
  CodeBracketIcon as Code2,
  DocumentTextIcon as FileCode,
} from "@heroicons/react/24/outline";

// ── Node types registry for ReactFlow ──
export const nodeTypes = {
  server: SystemNode,
  database: SystemNode,
  loadBalancer: SystemNode,
  gateway: SystemNode,
  queue: SystemNode,
  storage: SystemNode,
  logic: SystemNode,
  cdn: SystemNode,
  microservice: SystemNode,
  worker: SystemNode,
  cache: SystemNode,
  search: SystemNode,
  bus: SystemNode,
  region: SystemNode,
  vpc: SystemNode,
  user: SystemNode,
  app: SystemNode,
  api: SystemNode,
  note: SystemNode,
  annotation: SystemNode,
  junction: SystemNode,
  "k8s-pod": SystemNode,
  "k8s-deployment": SystemNode,
  "k8s-replicaset": SystemNode,
  "k8s-statefulset": SystemNode,
  "k8s-daemonset": SystemNode,
  "k8s-service": SystemNode,
  "k8s-ingress": SystemNode,
  "k8s-configmap": SystemNode,
  "k8s-secret": SystemNode,
  "k8s-pvc": SystemNode,
  "k8s-job": SystemNode,
  "k8s-cronjob": SystemNode,
  "k8s-hpa": SystemNode,
  "k8s-namespace": SystemNode,
  route53: SystemNode,
  nats: SystemNode,
  socketio: SystemNode,
  github_actions: SystemNode,
  jenkins: SystemNode,
  gitlab: SystemNode,
  argocd: SystemNode,
  vault: SystemNode,
  auth0: SystemNode,
  waf: SystemNode,
  prometheus: SystemNode,
  grafana: SystemNode,
  datadog: SystemNode,
  influxdb: SystemNode,
  snowflake: SystemNode,
  clickhouse: SystemNode,
  stripe: SystemNode,
  twilio: SystemNode,
  shopify: SystemNode,
};

// ── Expandable node types — these support nested sub-canvases ──
export const EXPANDABLE_TYPES = new Set([
  "microservice",
  "vpc",
  "region",
  "k8s-namespace",
  "server",
  "app",
]);

// ── Default favorites (used when user has no usage history) ──
export const DEFAULT_FAVORITES = [
  { type: "server", label: "Server", icon: Server },
  { type: "database", label: "Database", icon: Database },
  { type: "gateway", label: "API Gateway", icon: Globe },
  { type: "microservice", label: "Docker", icon: Box },
  { type: "cache", label: "Redis", icon: Zap },
  { type: "loadBalancer", label: "Load Balancer", icon: Cpu },
];

// ── All nodes for lookup (used by sidebar, context menu, properties) ──
export const nodeTypesList = [
  // ── Core: the 17 nodes that cover 95% of diagrams ──
  { type: "server", label: "Server", icon: Server, category: "Core" },
  { type: "database", label: "Database", icon: Database, category: "Core" },
  { type: "cache", label: "Redis", icon: Zap, category: "Core" },
  { type: "gateway", label: "API Gateway", icon: Globe, category: "Core" },
  { type: "loadBalancer", label: "Load Balancer", icon: Cpu, category: "Core" },
  { type: "microservice", label: "Docker", icon: Box, category: "Core" },
  { type: "worker", label: "Worker", icon: Cpu, category: "Core" },
  { type: "logic", label: "Lambda", icon: Zap, category: "Core" },
  { type: "queue", label: "Queue", icon: MessageSquare, category: "Core" },
  { type: "bus", label: "Kafka", icon: Share2, category: "Core" },
  { type: "storage", label: "Storage (S3)", icon: HardDrive, category: "Core" },
  { type: "cdn", label: "CDN", icon: Globe, category: "Core" },
  { type: "vpc", label: "VPC", icon: Square, category: "Core" },
  { type: "region", label: "Region", icon: Globe, category: "Core" },
  { type: "user", label: "User", icon: UserIcon, category: "Core" },
  { type: "app", label: "Client App", icon: Box, category: "Core" },
  { type: "api", label: "External API", icon: Globe, category: "Core" },

  // ── More: vendor-specific, collapsed by default ──
  { type: "search", label: "Elasticsearch", icon: Search, category: "More" },
  { type: "influxdb", label: "InfluxDB", icon: BarChart3, category: "More" },
  { type: "snowflake", label: "Snowflake", icon: Layers, category: "More" },
  { type: "clickhouse", label: "Clickhouse", icon: Database, category: "More" },
  { type: "route53", label: "Route 53", icon: Globe, category: "More" },
  { type: "nats", label: "NATS", icon: Activity, category: "More" },
  {
    type: "socketio",
    label: "Socket.io",
    icon: MessageCircle,
    category: "More",
  },
  {
    type: "github_actions",
    label: "GitHub Actions",
    icon: PlayCircle,
    category: "More",
  },
  { type: "jenkins", label: "Jenkins", icon: Settings, category: "More" },
  { type: "gitlab", label: "GitLab CI", icon: GitBranch, category: "More" },
  { type: "argocd", label: "Argo CD", icon: PlayCircle, category: "More" },
  { type: "vault", label: "Vault", icon: Lock, category: "More" },
  { type: "auth0", label: "Auth0", icon: Key, category: "More" },
  { type: "waf", label: "WAF", icon: Shield, category: "More" },
  { type: "prometheus", label: "Prometheus", icon: Activity, category: "More" },
  { type: "grafana", label: "Grafana", icon: BarChart3, category: "More" },
  { type: "datadog", label: "Datadog", icon: PieChart, category: "More" },
  { type: "stripe", label: "Stripe", icon: CreditCard, category: "More" },
  { type: "twilio", label: "Twilio", icon: MessageCircle, category: "More" },
  { type: "shopify", label: "Shopify", icon: ShoppingCart, category: "More" },

  // ── Kubernetes ──
  { type: "k8s-pod", label: "Pod", icon: K8sPodIcon, category: "Kubernetes" },
  {
    type: "k8s-deployment",
    label: "Deployment",
    icon: K8sDeployIcon,
    category: "Kubernetes",
  },
  {
    type: "k8s-replicaset",
    label: "ReplicaSet",
    icon: K8sReplicaSetIcon,
    category: "Kubernetes",
  },
  {
    type: "k8s-statefulset",
    label: "StatefulSet",
    icon: K8sStatefulIcon,
    category: "Kubernetes",
  },
  {
    type: "k8s-daemonset",
    label: "DaemonSet",
    icon: K8sDaemonIcon,
    category: "Kubernetes",
  },
  { type: "k8s-job", label: "Job", icon: K8sJobIcon, category: "Kubernetes" },
  {
    type: "k8s-cronjob",
    label: "CronJob",
    icon: K8sCronJobIcon,
    category: "Kubernetes",
  },
  {
    type: "k8s-service",
    label: "Service",
    icon: K8sServiceIcon,
    category: "Kubernetes",
  },
  {
    type: "k8s-ingress",
    label: "Ingress",
    icon: K8sIngressIcon,
    category: "Kubernetes",
  },
  {
    type: "k8s-configmap",
    label: "ConfigMap",
    icon: K8sConfigMapIcon,
    category: "Kubernetes",
  },
  {
    type: "k8s-secret",
    label: "Secret",
    icon: K8sSecretIcon,
    category: "Kubernetes",
  },
  { type: "k8s-pvc", label: "PVC", icon: K8sPVCIcon, category: "Kubernetes" },
  {
    type: "k8s-hpa",
    label: "Autoscaler",
    icon: K8sHPAIcon,
    category: "Kubernetes",
  },
  {
    type: "k8s-namespace",
    label: "Namespace",
    icon: K8sNamespaceIcon,
    category: "Kubernetes",
  },

  // ── Templates ──
  {
    type: "template:go",
    label: "Go",
    icon: Server,
    category: "Templates",
  },
  {
    type: "template:flutter",
    label: "Flutter",
    icon: Smartphone,
    category: "Templates",
  },
  {
    type: "template:react",
    label: "React",
    icon: Code2,
    category: "Templates",
  },
  {
    type: "template:python-sdk",
    label: "Python SDK",
    icon: FileCode,
    category: "Templates",
  },
  {
    type: "template:opencalw",
    label: "OpenClaw",
    icon: MessageSquare,
    category: "Templates",
  },
  {
    type: "template:meshwork-studio",
    label: "Meshwork Target Stack",
    icon: Network,
    category: "Templates",
  },
];

// ── Usage tracking for dynamic favorites ──
const USAGE_KEY = "meshwork:node-usage";

export interface NodeUsageStats {
  counts: Record<string, number>;
  lastUsed: Record<string, number>;
}

export function getNodeUsage(): NodeUsageStats {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    return raw ? JSON.parse(raw) : { counts: {}, lastUsed: {} };
  } catch {
    return { counts: {}, lastUsed: {} };
  }
}

export function trackNodeUsage(nodeType: string): void {
  const stats = getNodeUsage();
  stats.counts[nodeType] = (stats.counts[nodeType] || 0) + 1;
  stats.lastUsed[nodeType] = Date.now();
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(stats));
  } catch {
    /* localStorage full — ignore */
  }
}

export function getDynamicFavorites(): {
  type: string;
  label: string;
  icon: React.ComponentType<any>;
}[] {
  const stats = getNodeUsage();
  const now = Date.now();

  // Score each node type the user has used
  const scored = Object.entries(stats.counts).map(([type, count]) => {
    const hoursSinceUse =
      (now - (stats.lastUsed[type] || 0)) / (1000 * 60 * 60);
    const recencyBonus = Math.max(0, 10 - hoursSinceUse);
    return { type, score: count * 2 + recencyBonus };
  });

  scored.sort((a, b) => b.score - a.score);
  const topTypes = scored.slice(0, 6).map((s) => s.type);

  if (topTypes.length < 6) {
    return DEFAULT_FAVORITES; // Not enough usage data yet
  }

  return topTypes.map((type) => {
    const info = nodeTypesList.find((n) => n.type === type);
    return info
      ? { type: info.type, label: info.label, icon: info.icon }
      : DEFAULT_FAVORITES[0]; // fallback
  });
}

export const NODE_DESCRIPTIONS: Record<string, string> = {
  server: "General purpose compute instance (e.g. EC2, VM)",
  database: "Relational or NoSQL database server",
  cache: "In-memory data store (e.g. Redis, Memcached)",
  gateway: "API Gateway for routing client requests",
  loadBalancer: "Distributes traffic across multiple targets",
  microservice: "Containerized application or service",
  worker: "Background processing or job queue worker",
  logic: "Serverless function (e.g. AWS Lambda)",
  queue: "Message queue (e.g. SQS, RabbitMQ)",
  bus: "Event stream / Message bus (e.g. Kafka)",
  storage: "Object storage (e.g. S3, GCS)",
  cdn: "Content Delivery Network for edge caching",
  vpc: "Virtual Private Cloud network boundary",
  region: "Cloud region or physical datacenter",
  user: "End user or client application",
  app: "Frontend client application (Web/Mobile)",
  api: "External 3rd-party API service",
  search: "Search engine or indexing service",
  "k8s-pod": "Smallest deployable Kubernetes object",
  "k8s-deployment": "Manages stateless applications",
  "k8s-service": "Network endpoint for a set of Pods",
};
