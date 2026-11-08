import React from "react";
import {
  Handle,
  Position,
  NodeProps,
  NodeResizer,
  Node,
  useStore,
} from "@xyflow/react";
import { EXPANDABLE_TYPES } from "@/features/workspace/utils/nodeTypes";
import { CONTAINER_TYPES } from "@/features/workspace/utils/nodeRegistry";
import { getNodeMinimumDimensions } from "@/features/workspace/utils/nodeGeometry";
import { fireEnterNode } from "@/features/workspace/utils/canvasEvents";
import type { NodeData } from "@/types/canvas";
import {
  hasLegacyDefaultAppearance,
  legacyFallbackBrand,
} from "./legacyNodeAppearance";
import {
  nodePresentation,
  nodeSubtitle,
  nodeTextColor,
} from "./nodePresentation";
import * as HeroIcons from "@heroicons/react/24/outline";
import {
  UserIcon,
  ServerIcon as LucideServer,
  GlobeAltIcon as LucideGlobe,
  CubeIcon as LucideBox,
  BoltIcon as LucideZap,
  LockClosedIcon as LucideLock,
  ChartBarIcon as LucideActivity,
} from "@heroicons/react/24/outline";
import {
  SiLinux,
  SiDocker,
  SiCelery,
  SiAwslambda,
  SiPostgresql,
  SiRedis,
  SiAmazons3,
  SiElasticsearch,
  SiInfluxdb,
  SiSnowflake,
  SiClickhouse,
  SiNginx,
  SiCloudflare,
  SiApachekafka,
  SiRabbitmq,
  SiSocketdotio,
  SiPusher,
  SiGithubactions,
  SiJenkins,
  SiCircleci,
  SiGitlab,
  SiAuth0,
  SiOkta,
  SiPrometheus,
  SiGrafana,
  SiDatadog,
  SiReact,
  SiStripe,
  SiTwilio,
  SiSendgrid,
  SiShopify,
  SiPaypal,
  SiMongodb,
  SiMysql,
  SiOracle,
  SiAmazondynamodb,
  SiKubernetes,
} from "react-icons/si";
import { K8sLogo } from "../icons/KubernetesIcons";

// ─────────────────────────────────────────────────────────────
// Per-node-type brand mapping — every node gets a unique logo & color
// Logos from https://cdn.simpleicons.org/:slug/white
// ─────────────────────────────────────────────────────────────
interface NodeBrand {
  Icon: React.ElementType | string;
  isReactIcon?: boolean;
  color: string;
  borderColor: string;
  label: string;
}

export const nodeBrands: Record<string, NodeBrand> = {
  // ── Compute ──
  server: {
    Icon: SiLinux,
    isReactIcon: true,
    color: "#1A1A2E",
    borderColor: "#333355",
    label: "SERVER",
  },
  microservice: {
    Icon: SiDocker,
    isReactIcon: true,
    color: "#2496ED",
    borderColor: "#1A7BC9",
    label: "DOCKER",
  },
  worker: {
    Icon: SiCelery,
    isReactIcon: true,
    color: "#37814A",
    borderColor: "#2C6A3C",
    label: "WORKER",
  },
  logic: {
    Icon: SiAwslambda,
    isReactIcon: true,
    color: "#FF9900",
    borderColor: "#CC7A00",
    label: "LAMBDA",
  },

  // ── Data ──
  database: {
    Icon: SiPostgresql,
    isReactIcon: true,
    color: "#4169E1",
    borderColor: "#3050B0",
    label: "DATABASE",
  },
  cache: {
    Icon: SiRedis,
    isReactIcon: true,
    color: "#FF4438",
    borderColor: "#CC362D",
    label: "REDIS",
  },
  storage: {
    Icon: SiAmazons3,
    isReactIcon: true,
    color: "#569A31",
    borderColor: "#457B27",
    label: "S3",
  },
  search: {
    Icon: SiElasticsearch,
    isReactIcon: true,
    color: "#005571",
    borderColor: "#003F55",
    label: "ELASTIC",
  },
  influxdb: {
    Icon: SiInfluxdb,
    isReactIcon: true,
    color: "#22ADF6",
    borderColor: "#1B8AC5",
    label: "INFLUXDB",
  },
  snowflake: {
    Icon: SiSnowflake,
    isReactIcon: true,
    color: "#29B5E8",
    borderColor: "#2191BA",
    label: "SNOWFLAKE",
  },
  clickhouse: {
    Icon: SiClickhouse,
    isReactIcon: true,
    color: "#FFCC01",
    borderColor: "#CCA301",
    label: "CLICKHOUSE",
  },

  // ── Networking ──
  gateway: {
    Icon: LucideZap,
    isReactIcon: true,
    color: "#FF4F8B",
    borderColor: "#CC3F6F",
    label: "GATEWAY",
  },
  loadBalancer: {
    Icon: SiNginx,
    isReactIcon: true,
    color: "#009639",
    borderColor: "#00782E",
    label: "NGINX",
  },
  cdn: {
    Icon: SiCloudflare,
    isReactIcon: true,
    color: "#F38020",
    borderColor: "#C2661A",
    label: "CDN",
  },
  bus: {
    Icon: SiApachekafka,
    isReactIcon: true,
    color: "#231F20",
    borderColor: "#444444",
    label: "KAFKA",
  },
  queue: {
    Icon: SiRabbitmq,
    isReactIcon: true,
    color: "#FF6600",
    borderColor: "#CC5200",
    label: "RABBITMQ",
  },
  route53: {
    Icon: LucideGlobe,
    isReactIcon: true,
    color: "#8C4FFF",
    borderColor: "#703FCC",
    label: "ROUTE 53",
  },
  nats: {
    Icon: LucideActivity,
    isReactIcon: true,
    color: "#27AAE1",
    borderColor: "#1F88B0",
    label: "NATS",
  },
  socketio: {
    Icon: SiSocketdotio,
    isReactIcon: true,
    color: "#010101",
    borderColor: "#333333",
    label: "SOCKET.IO",
  },
  pusher: {
    Icon: SiPusher,
    isReactIcon: true,
    color: "#300D4F",
    borderColor: "#260A3F",
    label: "PUSHER",
  },

  // ── CI/CD ──
  github_actions: {
    Icon: SiGithubactions,
    isReactIcon: true,
    color: "#2088FF",
    borderColor: "#1A6DCC",
    label: "GH ACTIONS",
  },
  jenkins: {
    Icon: SiJenkins,
    isReactIcon: true,
    color: "#D24939",
    borderColor: "#A83A2E",
    label: "JENKINS",
  },
  circleci: {
    Icon: SiCircleci,
    isReactIcon: true,
    color: "#343434",
    borderColor: "#2A2A2A",
    label: "CIRCLECI",
  },
  gitlab: {
    Icon: SiGitlab,
    isReactIcon: true,
    color: "#FC6D26",
    borderColor: "#C9571E",
    label: "GITLAB",
  },
  argocd: {
    Icon: LucideBox,
    isReactIcon: true,
    color: "#EF7B4D",
    borderColor: "#BF623D",
    label: "ARGO CD",
  },

  // ── Security ──
  vault: {
    Icon: LucideLock,
    isReactIcon: true,
    color: "#60BEA3",
    borderColor: "#4D9882",
    label: "VAULT",
  },
  auth0: {
    Icon: SiAuth0,
    isReactIcon: true,
    color: "#EB5424",
    borderColor: "#BC431D",
    label: "AUTH0",
  },
  okta: {
    Icon: SiOkta,
    isReactIcon: true,
    color: "#007DC1",
    borderColor: "#00649A",
    label: "OKTA",
  },
  waf: {
    Icon: SiCloudflare,
    isReactIcon: true,
    color: "#F38020",
    borderColor: "#C2661A",
    label: "WAF",
  },

  // ── Monitoring ──
  prometheus: {
    Icon: SiPrometheus,
    isReactIcon: true,
    color: "#E6522C",
    borderColor: "#B84123",
    label: "PROMETHEUS",
  },
  grafana: {
    Icon: SiGrafana,
    isReactIcon: true,
    color: "#F46800",
    borderColor: "#C35300",
    label: "GRAFANA",
  },
  datadog: {
    Icon: SiDatadog,
    isReactIcon: true,
    color: "#632CA6",
    borderColor: "#4F2385",
    label: "DATADOG",
  },

  // ── Infrastructure ──
  vpc: {
    Icon: LucideServer,
    isReactIcon: true,
    color: "#232F3E",
    borderColor: "#3A4A5C",
    label: "VPC",
  },
  region: {
    Icon: LucideGlobe,
    isReactIcon: true,
    color: "#232F3E",
    borderColor: "#3A4A5C",
    label: "REGION",
  },

  // ── External Services ──
  user: {
    Icon: UserIcon,
    isReactIcon: true,
    color: "#6366F1",
    borderColor: "#4F46E5",
    label: "USER",
  },
  app: {
    Icon: SiReact,
    isReactIcon: true,
    color: "#20232A",
    borderColor: "#383A45",
    label: "APP",
  },
  api: {
    Icon: LucideGlobe,
    isReactIcon: true,
    color: "#6BA539",
    borderColor: "#55842E",
    label: "API",
  },
  stripe: {
    Icon: SiStripe,
    isReactIcon: true,
    color: "#008CDD",
    borderColor: "#0070B1",
    label: "STRIPE",
  },
  twilio: {
    Icon: SiTwilio,
    isReactIcon: true,
    color: "#F22F46",
    borderColor: "#C12538",
    label: "TWILIO",
  },
  sendgrid: {
    Icon: SiSendgrid,
    isReactIcon: true,
    color: "#1A82E2",
    borderColor: "#1568B5",
    label: "SENDGRID",
  },
  shopify: {
    Icon: SiShopify,
    isReactIcon: true,
    color: "#7AB55C",
    borderColor: "#619149",
    label: "SHOPIFY",
  },
  paypal: {
    Icon: SiPaypal,
    isReactIcon: true,
    color: "#003087",
    borderColor: "#00266B",
    label: "PAYPAL",
  },
};

const providerBrands: Record<string, NodeBrand> = {
  postgresql: {
    Icon: SiPostgresql,
    isReactIcon: true,
    color: "#4169E1",
    borderColor: "#3050B0",
    label: "POSTGRESQL",
  },
  mongodb: {
    Icon: SiMongodb,
    isReactIcon: true,
    color: "#47A248",
    borderColor: "#3D8B3E",
    label: "MONGODB",
  },
  mysql: {
    Icon: SiMysql,
    isReactIcon: true,
    color: "#4479A1",
    borderColor: "#366080",
    label: "MYSQL",
  },
  redis: {
    Icon: SiRedis,
    isReactIcon: true,
    color: "#FF4438",
    borderColor: "#CC362D",
    label: "REDIS",
  },
  oracle: {
    Icon: SiOracle,
    isReactIcon: true,
    color: "#F80000",
    borderColor: "#C60000",
    label: "ORACLE",
  },
  dynamodb: {
    Icon: SiAmazondynamodb,
    isReactIcon: true,
    color: "#4053D6",
    borderColor: "#3342AB",
    label: "DYNAMODB",
  },
};

interface NodeStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderRadius?: number;
  opacity?: number;
  fontColor?: string;
  fontSize?: number;
  icon?: string;
  theme?: string;
}

export function SystemNode({
  id,
  data,
  selected,
  type,
  width,
}: NodeProps<Node<NodeData>>) {
  // React Flow applies style to its wrapper and does not pass it as a node prop.
  const storedStyle = useStore(
    (state) => state.nodeLookup.get(id)?.internals.userNode.style,
  ) as (React.CSSProperties & NodeStyle) | undefined;
  const provider = (data.provider ?? "").toLowerCase();
  const isInfrastructure =
    CONTAINER_TYPES.has(type) && type !== "k8s-namespace";
  const isNote = type === "note";
  const isKubernetes = type.startsWith("k8s-");
  const isK8sNamespace = type === "k8s-namespace";
  const k8sStatus = data.status ?? "";

  const zoneLabelSize = width ? Math.max(9, Math.floor(width / 40)) : 9;
  const zoneIconSize = width ? Math.max(12, Math.floor(width / 30)) : 12;

  const brand: NodeBrand = isKubernetes
    ? {
        Icon: K8sLogo,
        isReactIcon: true,
        color: "#326CE5",
        borderColor: "#2457B5",
        label: type.replace("k8s-", "").toUpperCase() || "K8S",
      }
    : providerBrands[provider] ||
      nodeBrands[type] || {
        Icon: "",
        color: "#4F46E5",
        borderColor: "#4338CA",
        label: (data.originalType || type || "NODE").toUpperCase(),
      };

  const statusOverrides: Record<
    string,
    { color: string; borderColor: string }
  > = {
    healthy: { color: "#22C55E", borderColor: "#16A34A" },
    error: { color: "#EF4444", borderColor: "#DC2626" },
    pending: { color: "#6B7280", borderColor: "#4B5563" },
  };
  const statusBrand =
    isKubernetes && k8sStatus ? statusOverrides[k8sStatus] : null;
  const userAccent = data.accentColor;
  const finalColor = userAccent ?? statusBrand?.color ?? brand.color;
  const finalBorder =
    userAccent ?? statusBrand?.borderColor ?? brand.borderColor;

  // Old editor-created nodes stored the old default look as if it were a
  // customization. Recognize only the complete default tuple; keep all other
  // stored styles intact and never modify the saved node during rendering.
  const legacyBrand = nodeBrands[type] || legacyFallbackBrand;
  const legacyDefault = hasLegacyDefaultAppearance(
    { style: storedStyle, data },
    legacyBrand,
  );
  const customBg = legacyDefault ? undefined : storedStyle?.backgroundColor;
  const customBorder = legacyDefault ? undefined : storedStyle?.borderColor;
  const customRadius = legacyDefault ? undefined : storedStyle?.borderRadius;
  const customFontColor = legacyDefault
    ? undefined
    : data.fontColor || storedStyle?.fontColor;
  const customFontSize = legacyDefault ? undefined : storedStyle?.fontSize;
  const customIconName = data.icon || storedStyle?.icon;
  const customTheme = data.theme || storedStyle?.theme || "default";

  const finalBorderColor = customBorder || finalBorder;
  const finalRadius =
    customRadius !== undefined ? `${customRadius}px` : undefined;
  const finalFontSize =
    customFontSize !== undefined ? `${customFontSize}px` : undefined;

  let themeStyles: React.CSSProperties = {};
  if (customTheme === "neon") {
    themeStyles = {
      boxShadow: `0 0 20px ${finalBorderColor}50, inset 0 1px 0 rgba(255,255,255,0.15)`,
      border: `1.5px solid ${finalBorderColor}`,
    };
  } else if (customTheme === "glass") {
    themeStyles = {
      background: "rgba(255, 255, 255, 0.03)",
      backdropFilter: "blur(20px)",
      border: "1px solid rgba(255, 255, 255, 0.08)",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
    };
  } else if (customTheme === "minimal") {
    themeStyles = {
      background: "transparent",
      border: `1px solid rgba(255,255,255,0.15)`,
      boxShadow: "none",
      backdropFilter: "none",
    };
  }

  // ── Junction Point ──
  if (type === "junction") {
    return (
      <div className="relative w-6 h-6 group">
        <div
          className={`
                    absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full transition-all border-2
                    ${selected ? "bg-white border-white ring-4 ring-white/10" : "bg-white/60 border-white/40 group-hover:border-white"}
                `}
        />
        <Handle
          type="source"
          position={Position.Top}
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
          className="!opacity-0 !w-full !h-full !border-0"
        />
      </div>
    );
  }

  const handleCls =
    "!w-2 !h-2 !rounded-full !border-2 !border-blue-400 !bg-white !opacity-0 group-hover:!opacity-100 !transition-opacity !shadow-sm";
  const minimumDimensions = getNodeMinimumDimensions(type);
  const { shape } = nodePresentation(type);
  const subtitle = nodeSubtitle(
    type,
    data.label,
    data.provider,
    data.originalType,
  );
  const iconByType: Record<string, keyof typeof HeroIcons> = {
    user: "UserIcon",
    app: "ComputerDesktopIcon",
    route53: "GlobeAltIcon",
    cdn: "CloudIcon",
    loadBalancer: "ArrowsRightLeftIcon",
    gateway: "GlobeAltIcon",
    server: "ServerIcon",
    microservice: "CodeBracketSquareIcon",
    worker: "CpuChipIcon",
    logic: "BoltIcon",
    database: "CircleStackIcon",
    cache: "BoltIcon",
    search: "MagnifyingGlassIcon",
    storage: "ArchiveBoxIcon",
    queue: "QueueListIcon",
    bus: "QueueListIcon",
    api: "ArrowTopRightOnSquareIcon",
    auth0: "ShieldCheckIcon",
    vault: "ShieldCheckIcon",
    okta: "ShieldCheckIcon",
    waf: "ShieldCheckIcon",
    nats: "QueueListIcon",
    socketio: "SignalIcon",
    pusher: "SignalIcon",
    github_actions: "PlayCircleIcon",
    jenkins: "Cog6ToothIcon",
    circleci: "PlayCircleIcon",
    gitlab: "CodeBracketIcon",
    argocd: "ArrowPathIcon",
    prometheus: "ChartBarIcon",
    grafana: "ChartBarIcon",
    datadog: "ChartBarIcon",
    influxdb: "CircleStackIcon",
    snowflake: "CircleStackIcon",
    clickhouse: "CircleStackIcon",
    stripe: "CreditCardIcon",
    paypal: "CreditCardIcon",
    twilio: "ChatBubbleLeftRightIcon",
    sendgrid: "EnvelopeIcon",
    shopify: "ShoppingBagIcon",
    "k8s-pod": "CubeIcon",
    "k8s-deployment": "Square3Stack3DIcon",
    "k8s-replicaset": "Square2StackIcon",
    "k8s-statefulset": "CircleStackIcon",
    "k8s-daemonset": "ServerStackIcon",
    "k8s-service": "GlobeAltIcon",
    "k8s-ingress": "ArrowDownOnSquareIcon",
    "k8s-configmap": "DocumentTextIcon",
    "k8s-secret": "KeyIcon",
    "k8s-pvc": "CircleStackIcon",
    "k8s-job": "PlayIcon",
    "k8s-cronjob": "ClockIcon",
    "k8s-hpa": "ArrowsUpDownIcon",
  };
  const iconAliases: Record<string, keyof typeof HeroIcons> = {
    Database: "CircleStackIcon",
    Globe: "GlobeAltIcon",
    Server: "ServerIcon",
    Box: "CubeIcon",
    Search: "MagnifyingGlassIcon",
    Zap: "BoltIcon",
  };
  const requestedIcon = customIconName
    ? iconAliases[customIconName] ||
      (customIconName.endsWith("Icon")
        ? customIconName
        : `${customIconName}Icon`)
    : undefined;
  const iconName =
    requestedIcon && HeroIcons[requestedIcon]
      ? requestedIcon
      : (iconByType[type] ?? "CubeIcon");
  const NodeIcon = HeroIcons[iconName] as React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>;
  const showStatus = isKubernetes && !!k8sStatus;
  const textColor =
    customFontColor ||
    (customBg
      ? nodeTextColor(
          customBg,
          customTheme === "glass" || customTheme === "minimal",
        )
      : "var(--workspace-node-text)");
  const metadata = isKubernetes
    ? [
        data.replicas ? `${String(data.replicas)} replicas` : null,
        data.image,
        data.serviceType,
        data.schedule,
        data.storageSize,
      ]
        .filter(Boolean)
        .map(String)
        .join(" · ")
    : "";
  return (
    <>
      <NodeResizer
        minWidth={minimumDimensions.width}
        minHeight={minimumDimensions.height}
        isVisible={selected}
        lineClassName="!border-blue-500/50"
        lineStyle={{ padding: 6 }}
        handleClassName="!h-2.5 !w-2.5 !bg-white !border-2 !border-blue-500 !rounded-full !shadow-md"
        handleStyle={{ margin: -6 }}
      />
      <div className="group w-full h-full relative">
        {/* Connection Handles — small rounded dots on all 4 cardinal directions */}
        {/* Top */}
        <Handle
          type="target"
          position={Position.Top}
          id="top-target"
          className={handleCls}
        />
        <Handle
          type="source"
          position={Position.Top}
          id="top"
          className={handleCls}
        />

        {/* Bottom */}
        <Handle
          type="target"
          position={Position.Bottom}
          id="bottom-target"
          className={handleCls}
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="bottom"
          className={handleCls}
        />

        {/* Left */}
        <Handle
          type="target"
          position={Position.Left}
          id="left-target"
          className={handleCls}
        />
        <Handle
          type="source"
          position={Position.Left}
          id="left"
          className={handleCls}
        />

        {/* Right */}
        <Handle
          type="target"
          position={Position.Right}
          id="right-target"
          className={handleCls}
        />
        <Handle
          type="source"
          position={Position.Right}
          id="right"
          className={handleCls}
        />

        {/* ── PLAIN TEXT ANNOTATION ── */}
        {type === "annotation" ? (
          <div
            className={`
                            relative w-full h-full flex flex-col p-3 rounded-lg
                            ${selected ? "ring-2 ring-blue-500/30 bg-blue-500/5" : "border border-transparent group-hover:border-white/10"}
                            transition-all cursor-text
                        `}
            style={{
              backgroundColor: customBg,
              border: customBorder ? `1px solid ${customBorder}` : undefined,
              borderRadius: finalRadius,
              ...themeStyles,
            }}
          >
            <p
              className="leading-tight font-medium whitespace-pre-wrap break-all w-full max-w-full font-sans"
              style={{
                color: customFontColor || "var(--workspace-node-text)",
                fontSize:
                  finalFontSize ||
                  `${Math.max(14, Math.floor((width || 160) / 10))}px`,
              }}
            >
              {data.label! || "Annotation"}
            </p>
          </div>
        ) : /* ── STICKY NOTE ── */
        isNote ? (
          <div
            className={`
                            relative p-4 overflow-hidden w-full h-full flex flex-col rounded-xl
                            ${selected ? "ring-2 ring-blue-500/50" : ""}
                            transition-shadow
                        `}
            style={{
              background: customBg || "var(--workspace-node-bg)",
              border: customBorder
                ? `1px solid ${customBorder}`
                : "1.5px solid var(--workspace-node-border)",
              borderRadius: finalRadius,
              ...themeStyles,
            }}
          >
            <p
              className="leading-relaxed font-medium whitespace-pre-wrap break-words w-full max-w-full"
              style={{
                fontFamily: "var(--font-body)",
                color:
                  customFontColor ||
                  (customBg
                    ? nodeTextColor(customBg, false)
                    : "var(--workspace-node-text)"),
                fontSize:
                  finalFontSize ||
                  `${Math.max(14, Math.floor((width || 192) / 12))}px`,
              }}
            >
              {data.label! || ""}
            </p>
          </div>
        ) : /* ── INFRASTRUCTURE CONTAINERS (VPC / Region) ── */
        isInfrastructure ? (
          <div
            className={`
                            relative w-full h-full flex flex-col rounded-xl overflow-hidden
                            ${selected ? "ring-1 ring-blue-500/30" : ""}
                            transition-all
                        `}
            style={{
              border: customBorder
                ? `1.5px dashed ${customBorder}`
                : `1.5px dashed ${userAccent || "#8999b9"}`,
              background: customBg || "rgba(229, 232, 243, 0.06)",
              borderRadius: finalRadius,
              ...themeStyles,
            }}
          >
            {/* Top-left corner label — type + name */}
            <div className="m-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 self-start rounded-full bg-[var(--workspace-node-bg)] px-3 py-1">
              {brand.Icon &&
                (typeof brand.Icon === "string" ? (
                  <img
                    src={brand.Icon}
                    style={{
                      width: zoneLabelSize + 2,
                      height: zoneLabelSize + 2,
                    }}
                    alt=""
                    className="opacity-60"
                  />
                ) : (
                  <brand.Icon
                    size={zoneLabelSize + 2}
                    style={{
                      color: customFontColor || finalColor,
                      opacity: 0.7,
                    }}
                  />
                ))}
              <span
                className="font-semibold"
                style={{
                  fontSize: `${zoneLabelSize}px`,
                  color: customFontColor || "var(--workspace-node-text)",
                }}
              >
                {brand.label}
              </span>
              <span
                className="truncate font-medium"
                style={{
                  fontSize: `${zoneLabelSize}px`,
                  color: customFontColor || "var(--workspace-node-text)",
                }}
              >
                / {data.label!}
              </span>
            </div>

            {/* Expand arrow — bottom left */}
            {EXPANDABLE_TYPES.has(type) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  fireEnterNode(id);
                }}
                className="absolute bottom-1.5 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/[0.07] transition-colors group/enter"
                title="Open internal workspace"
              >
                <svg
                  width="7"
                  height="7"
                  viewBox="0 0 8 8"
                  style={{ color: finalColor, opacity: 0.35 }}
                  className="group-hover/enter:opacity-70 transition-opacity"
                >
                  <path d="M1 1L7 4L1 7V1Z" fill="currentColor" />
                </svg>
                {data.subCanvas?.nodes && data.subCanvas.nodes.length > 0 && (
                  <span
                    className="text-[7px] font-bold opacity-30 group-hover/enter:opacity-60 transition-opacity"
                    style={{ color: finalColor }}
                  >
                    {data.subCanvas.nodes.length}
                  </span>
                )}
              </button>
            )}
          </div>
        ) : /* ── K8S NAMESPACE CONTAINER ── */
        isK8sNamespace ? (
          <div
            className={`
                            relative border border-dashed overflow-hidden w-full h-full flex flex-col rounded-2xl
                            bg-[#e5e8f3]/[0.06] border-[#8999b9]
                            ${selected ? "ring-2 ring-[#326CE5]/40 shadow-[0_0_30px_rgba(50,108,229,0.1)]" : "hover:bg-[#326CE5]/[0.05]"}
                            transition-all
                        `}
            style={{
              backgroundColor: customBg,
              border: customBorder ? `1px solid ${customBorder}` : undefined,
              borderRadius: finalRadius,
              ...themeStyles,
            }}
          >
            {/* Namespace label — pill badge */}
            <div className="flex items-center gap-2 p-2 self-start">
              <div
                className="px-3 py-1 rounded-full bg-[var(--workspace-node-bg)] font-semibold flex items-center gap-1.5"
                style={{
                  fontSize: `${zoneLabelSize}px`,
                  color: customFontColor || "var(--workspace-node-text)",
                }}
              >
                <SiKubernetes
                  style={{ width: zoneIconSize, height: zoneIconSize }}
                  className="text-[var(--workspace-node-icon)]"
                />
                ns: {data.label!}
              </div>
            </div>
          </div>
        ) : (
          /* Regular nodes share the canvas surface while retaining role-specific shapes. */
          <div
            className={`relative flex h-full w-full items-center gap-3 overflow-hidden px-3.5 py-2.5 font-sans transition-shadow ${selected ? "ring-2 ring-blue-500/70 ring-offset-2 ring-offset-[var(--workspace-canvas)]" : ""}`}
            style={{
              backgroundColor: customBg || "var(--workspace-node-bg)",
              border: `1.5px ${shape === "external" ? "dashed" : "solid"} ${customBorder || userAccent || "var(--workspace-node-border)"}`,
              borderRadius:
                finalRadius ||
                (shape === "pill"
                  ? "9999px"
                  : shape === "database"
                    ? "50% / 13%"
                    : "16px"),
              ...themeStyles,
            }}
          >
            {shape === "database" && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-[19%] rounded-[50%] border-b"
                style={{
                  borderColor:
                    customBorder ||
                    userAccent ||
                    "var(--workspace-node-border)",
                }}
              />
            )}
            {shape === "queue" && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-1 right-1 rounded-xl border-x"
                style={{
                  borderColor:
                    customBorder ||
                    userAccent ||
                    "var(--workspace-node-border)",
                }}
              />
            )}
            <div
              className="relative flex h-7 w-7 shrink-0 items-center justify-center"
              style={{
                color:
                  customFontColor ||
                  userAccent ||
                  (customBg || customTheme !== "default"
                    ? textColor
                    : "var(--workspace-node-icon)"),
              }}
            >
              <NodeIcon className="h-6 w-6" />
              {showStatus && (
                <span
                  title={`Status: ${k8sStatus}`}
                  aria-label={`Status: ${k8sStatus}`}
                  className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-white ${k8sStatus === "healthy" ? "bg-green-600" : k8sStatus === "error" ? "bg-red-600" : "bg-slate-500"}`}
                />
              )}
            </div>
            <div
              className="relative min-w-0 flex-1 leading-tight"
              style={{ color: textColor }}
            >
              <div
                className="line-clamp-2 break-words text-[13px] font-semibold"
                title={data.label}
                style={{ fontSize: finalFontSize }}
              >
                {data.label || type}
              </div>
              {subtitle && (
                <div
                  title={subtitle}
                  className="mt-0.5 truncate text-[11px] font-normal opacity-75"
                >
                  {subtitle}
                </div>
              )}
              {metadata && (
                <div
                  title={metadata}
                  className="mt-0.5 truncate text-[10px] opacity-75"
                >
                  {metadata}
                </div>
              )}
            </div>
            {EXPANDABLE_TYPES.has(type) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  fireEnterNode(id);
                }}
                className="nodrag absolute bottom-1 right-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-md text-[var(--workspace-node-text)] opacity-60 hover:bg-white/10 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"
                title="Open internal workspace"
                aria-label="Open internal workspace"
              >
                <HeroIcons.ArrowTopRightOnSquareIcon className="h-3 w-3" />
                {(data.subCanvas?.nodes?.length ?? 0) > 0 && (
                  <span className="ml-0.5 text-[9px] font-semibold">
                    {data.subCanvas?.nodes?.length}
                  </span>
                )}
              </button>
            )}
          </div>
        )}

        {data.description && (
          <div
            role="tooltip"
            className="node-description-tooltip pointer-events-none invisible absolute bottom-full left-1/2 z-[1000] mb-2 w-48 -translate-x-1/2 rounded-lg border border-white/10 bg-[#121214] p-2.5 opacity-0 shadow-xl transition-opacity group-hover:visible group-hover:opacity-100"
          >
            <div className="mb-1 text-[11px] font-semibold text-white/90">
              {data.label || type}
            </div>
            <div className="whitespace-pre-wrap text-[11px] leading-relaxed text-white/70">
              {data.description}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
