import React from "react";
import { SystemNode } from "@/components/canvas/nodes/SystemNode";
import { NODE_DEFINITIONS } from "./nodeRegistry";
export { EXPANDABLE_TYPES } from "./nodeRegistry";
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
} from "@heroicons/react/24/outline";

// ── Node types registry for ReactFlow ──
export const nodeTypes = Object.fromEntries(
  NODE_DEFINITIONS.map(({ id }) => [id, SystemNode]),
);

// ── All nodes for lookup (used by sidebar, context menu, properties) ──
const PALETTE_ICONS: Record<string, React.ComponentType<any>> = {
  Activity,
  BarChart3,
  Box,
  Cpu,
  CreditCard,
  Database,
  GitBranch,
  Globe,
  HardDrive,
  K8sConfigMapIcon,
  K8sCronJobIcon,
  K8sDaemonIcon,
  K8sDeployIcon,
  K8sHPAIcon,
  K8sIngressIcon,
  K8sJobIcon,
  K8sNamespaceIcon,
  K8sPVCIcon,
  K8sPodIcon,
  K8sReplicaSetIcon,
  K8sSecretIcon,
  K8sServiceIcon,
  K8sStatefulIcon,
  Key,
  Layers,
  Lock,
  MessageCircle,
  MessageSquare,
  Network,
  PieChart,
  PlayCircle,
  Search,
  Server,
  Settings,
  Share2,
  Shield,
  ShoppingCart,
  Square,
  UserIcon,
  Zap,
};

export const nodeTypesList = [
  ...NODE_DEFINITIONS.filter((definition) => definition.palette)
    .sort((a, b) => a.palette!.order - b.palette!.order)
    .map((definition) => ({
      type: definition.id,
      label: definition.palette!.label,
      icon: PALETTE_ICONS[definition.palette!.icon],
      category: definition.palette!.category,
    })),
  {
    type: "template:airbnb",
    label: "Airbnb",
    icon: Server,
    category: "Templates",
  },
  {
    type: "template:netflix",
    label: "Netflix",
    icon: PlayCircle,
    category: "Templates",
  },
  {
    type: "template:stripe",
    label: "Stripe",
    icon: CreditCard,
    category: "Templates",
  },
  {
    type: "template:uber",
    label: "Uber",
    icon: Smartphone,
    category: "Templates",
  },
  {
    type: "template:discord",
    label: "Discord",
    icon: MessageCircle,
    category: "Templates",
  },
  {
    type: "template:meshwork-studio",
    label: "Meshwork Target Stack",
    icon: Network,
    category: "Templates",
  },
];

// Favorites use the same labels and icons as the palette.
export const DEFAULT_FAVORITES = [
  "server",
  "database",
  "gateway",
  "microservice",
  "cache",
  "loadBalancer",
].map((type) => {
  const entry = nodeTypesList.find((node) => node.type === type);
  if (!entry) throw new Error(`Missing default favorite node: ${type}`);
  return { type: entry.type, label: entry.label, icon: entry.icon };
});

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

export const NODE_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  NODE_DEFINITIONS.flatMap(({ id, description }) =>
    description ? [[id, description]] : [],
  ),
);
