import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Handle, Position, NodeProps, NodeResizer, Node } from "@xyflow/react";
import { EXPANDABLE_TYPES } from "@/features/workspace/utils/nodeTypes";
import { fireEnterNode } from "@/features/workspace/utils/canvasEvents";
import type { NodeData } from "@/types/canvas";
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
import { k8sIcons, K8sLogo } from "../icons/KubernetesIcons";

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
  style,
}: NodeProps<Node<NodeData>> & { style?: NodeStyle }) {
  const [isHovered, setIsHovered] = useState(false);
  const provider = (data.provider ?? "").toLowerCase();
  const isInfrastructure = type === "vpc" || type === "region";
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
        label: (type || "NODE").toUpperCase(),
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

  const customBg = style?.backgroundColor;
  const customBorder = style?.borderColor;
  const customRadius = style?.borderRadius;
  const customOpacity = style?.opacity;
  const customFontColor = style?.fontColor;
  const customFontSize = style?.fontSize;
  const customIconName = style?.icon;
  const customTheme = style?.theme ?? "default";

  const finalBorderColor = customBorder || finalBorder;
  const finalRadius =
    customRadius !== undefined ? `${customRadius}px` : undefined;
  const finalOpacity = customOpacity !== undefined ? customOpacity : undefined;
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

  let K8sResourceIcon: React.ReactNode = null;
  if (isKubernetes) {
    const K8sIcon = k8sIcons[type];
    K8sResourceIcon = K8sIcon ? (
      <K8sIcon size={14} className="text-white/60" />
    ) : null;
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
  const selectionRing = selected
    ? "ring-2 ring-blue-500/40 shadow-[0_0_20px_rgba(59,130,246,0.15)]"
    : "";
  return (
    <>
      <NodeResizer
        minWidth={24}
        minHeight={24}
        isVisible={selected}
        lineClassName={isNote ? "!border-yellow-500/50" : "!border-blue-500/50"}
        lineStyle={{ padding: 6 }}
        handleClassName="!h-2.5 !w-2.5 !bg-white !border-2 !border-blue-500 !rounded-full !shadow-md"
        handleStyle={{ margin: -6 }}
      />
      <div
        className="group w-full h-full relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Connection Handles — small rounded dots */}
        <Handle
          type="source"
          position={Position.Top}
          id="top"
          className={handleCls}
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="bottom"
          className={handleCls}
        />
        <Handle
          type="source"
          position={Position.Left}
          id="left"
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
              opacity: finalOpacity,
              ...themeStyles,
            }}
          >
            <p
              className="leading-tight font-medium whitespace-pre-wrap break-all w-full max-w-full font-sans"
              style={{
                color: customFontColor || "rgba(255,255,255,0.8)",
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
                            shadow-lg shadow-black/20
                            ${selected ? "ring-2 ring-yellow-400/50 shadow-[0_0_20px_rgba(250,204,21,0.15)]" : "group-hover:shadow-xl group-hover:shadow-black/30"}
                            transition-shadow
                        `}
            style={{
              background:
                customBg || "linear-gradient(135deg, #FFF9C4, #FFF176)",
              border: customBorder
                ? `1px solid ${customBorder}`
                : "1px solid rgba(250, 204, 21, 0.3)",
              borderRadius: finalRadius,
              opacity: finalOpacity,
              ...themeStyles,
            }}
          >
            <p
              className="leading-relaxed font-semibold whitespace-pre-wrap break-all italic w-full max-w-full"
              style={{
                fontFamily: "var(--font-serif)",
                color: customFontColor || "rgba(66, 32, 6, 0.8)",
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
                : `1.5px dashed ${finalColor}35`,
              background: customBg || `${finalColor}08`,
              borderRadius: finalRadius,
              opacity: finalOpacity,
              ...themeStyles,
            }}
          >
            {/* Top-left corner label — type + name */}
            <div className="flex items-center gap-1.5 px-2.5 pt-2 self-start">
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
                className="font-bold uppercase tracking-[0.14em] opacity-60"
                style={{
                  fontSize: `${zoneLabelSize}px`,
                  color: customFontColor || finalColor,
                }}
              >
                {brand.label}
              </span>
              <span
                className="font-normal tracking-normal normal-case opacity-40"
                style={{
                  fontSize: `${zoneLabelSize}px`,
                  color: customFontColor || finalColor,
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
                            bg-[#326CE5]/[0.03] border-[#326CE5]/20
                            ${selected ? "ring-2 ring-[#326CE5]/40 shadow-[0_0_30px_rgba(50,108,229,0.1)]" : "hover:bg-[#326CE5]/[0.05]"}
                            transition-all
                        `}
            style={{
              backgroundColor: customBg,
              border: customBorder ? `1px solid ${customBorder}` : undefined,
              borderRadius: finalRadius,
              opacity: finalOpacity,
              ...themeStyles,
            }}
          >
            {/* Namespace label — pill badge */}
            <div className="flex items-center gap-2 p-2 self-start">
              <div
                className="px-3 py-1 rounded-full bg-[#326CE5]/80 font-black uppercase tracking-[0.15em] text-white flex items-center gap-1.5"
                style={{
                  fontSize: `${zoneLabelSize}px`,
                  color: customFontColor || "#ffffff",
                }}
              >
                <SiKubernetes
                  style={{ width: zoneIconSize, height: zoneIconSize }}
                  className="text-white"
                />
                ns: {data.label!}
              </div>
            </div>
          </div>
        ) : /* ── KUBERNETES NODES ── */
        isKubernetes ? (
          <div
            className={`
                            relative px-3 py-2.5 overflow-hidden w-full h-full flex items-center gap-3 rounded-2xl
                            bg-[#121214]/80 backdrop-blur-xl
                            shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]
                            ${selectionRing}
                            ${!selected ? "hover:shadow-[0_12px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-[#16161A]/90" : ""}
                            transition-all duration-300 group
                        `}
            style={{
              border: `1px solid ${finalBorderColor}40`,
              backgroundColor: customBg,
              borderRadius: finalRadius,
              opacity: finalOpacity,
              ...themeStyles,
            }}
          >
            <div
              className="absolute inset-0 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity pointer-events-none"
              style={{
                backgroundImage: `radial-gradient(circle at 50% 0%, ${finalBorderColor}, transparent 70%)`,
              }}
            />
            <K8sLogo className="absolute right-2 bottom-2 w-8 h-8 object-contain opacity-[0.04] pointer-events-none text-white z-0" />

            <div
              className="relative w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] z-10"
              style={{
                background: `linear-gradient(135deg, ${finalBorderColor}30, ${finalBorderColor}10)`,
                border: `1px solid ${finalBorderColor}50`,
              }}
            >
              {(() => {
                if (
                  customIconName &&
                  HeroIcons[customIconName as keyof typeof HeroIcons]
                ) {
                  const IconComponent = HeroIcons[
                    customIconName as keyof typeof HeroIcons
                  ] as React.ComponentType<{
                    size?: number;
                    className?: string;
                    style?: React.CSSProperties;
                  }>;
                  return (
                    <IconComponent
                      size={20}
                      style={{ color: customFontColor || "#ffffffec" }}
                    />
                  );
                }
                if (brand.Icon && typeof brand.Icon !== "string") {
                  return <brand.Icon size={20} className="text-white/90" />;
                }
                return null;
              })()}
              {K8sResourceIcon && (
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-white/10 rounded-sm flex items-center justify-center">
                  {K8sResourceIcon}
                </div>
              )}
              {k8sStatus && (
                <div
                  className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-[#1A1A1A]
                                    ${k8sStatus === "healthy" ? "bg-green-400" : k8sStatus === "error" ? "bg-red-400" : "bg-gray-400"}
                                `}
                >
                  <div className="k8s-status-pulse" />
                </div>
              )}
            </div>

            <div className="flex flex-col min-w-0 flex-1 z-10">
              <span
                className="text-[13px] font-medium tracking-tight line-clamp-2 break-words whitespace-pre-wrap leading-tight text-white/95"
                style={{
                  color: customFontColor || "rgba(255,255,255,0.95)",
                  fontSize: finalFontSize || "13px",
                }}
              >
                {data.label!}
              </span>
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {Boolean(data.replicas) && (
                  <span className="text-[7px] px-1.5 py-0.5 bg-white/[0.06] rounded-md text-white/60 font-medium">
                    {String(data.replicas)} replicas
                  </span>
                )}
                {Boolean(data.image) && (
                  <span className="text-[7px] px-1.5 py-0.5 bg-white/[0.06] rounded-md text-white/60 font-mono truncate max-w-[100px]">
                    {String(data.image)}
                  </span>
                )}
                {Boolean(data.serviceType) && (
                  <span className="text-[7px] px-1.5 py-0.5 bg-white/[0.06] rounded-md text-white/60 font-medium">
                    {String(data.serviceType)}
                  </span>
                )}
                {Boolean(data.schedule) && (
                  <span className="text-[7px] px-1.5 py-0.5 bg-white/[0.06] rounded-md text-white/60 font-mono">
                    {String(data.schedule)}
                  </span>
                )}
                {Boolean(data.storageSize) && (
                  <span className="text-[7px] px-1.5 py-0.5 bg-white/[0.06] rounded-md text-white/60 font-medium">
                    {String(data.storageSize)}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ── DEFAULT NODES (Compute, Data, Networking, External) ── */
          <div
            className={`
                            relative px-3 py-2.5 overflow-hidden w-full h-full rounded-2xl
                            bg-[#121214]/80 backdrop-blur-xl
                            shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]
                            flex items-center gap-3.5
                            ${selectionRing}
                            ${!selected ? "hover:shadow-[0_12px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-[#16161A]/90" : ""}
                            transition-all duration-300 group
                        `}
            style={{
              border: `1px solid ${finalBorderColor}40`,
              backgroundColor: customBg,
              borderRadius: finalRadius,
              opacity: finalOpacity,
              ...themeStyles,
            }}
          >
            <div
              className="absolute inset-0 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity pointer-events-none"
              style={{
                backgroundImage: `radial-gradient(circle at 50% 0%, ${finalBorderColor}, transparent 70%)`,
              }}
            />

            <div
              className="relative rounded-xl flex items-center justify-center flex-shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] z-10 w-9 h-9"
              style={{
                background: `linear-gradient(135deg, ${finalBorderColor}30, ${finalBorderColor}10)`,
                border: `1px solid ${finalBorderColor}50`,
              }}
            >
              {(() => {
                if (
                  customIconName &&
                  HeroIcons[customIconName as keyof typeof HeroIcons]
                ) {
                  const IconComponent = HeroIcons[
                    customIconName as keyof typeof HeroIcons
                  ] as React.ComponentType<{
                    size?: number;
                    className?: string;
                    style?: React.CSSProperties;
                  }>;
                  return (
                    <IconComponent
                      size={20}
                      style={{ color: customFontColor || "#ffffffec" }}
                    />
                  );
                }
                if (brand.Icon) {
                  return typeof brand.Icon === "string" ? (
                    <img
                      src={brand.Icon}
                      className="object-contain w-[18px] h-[18px]"
                      alt=""
                    />
                  ) : (
                    <brand.Icon
                      size={20}
                      className="text-white/90"
                      style={{ color: customFontColor }}
                    />
                  );
                }
                if (type === "user") {
                  return (
                    <UserIcon
                      size={18}
                      strokeWidth={2}
                      className="text-white/90"
                      style={{ color: customFontColor }}
                    />
                  );
                }
                return <div className="w-4 h-4 bg-white/20 rounded" />;
              })()}
            </div>

            <div className="flex flex-col min-w-0 z-10">
              <span
                className="text-[13px] font-medium tracking-tight line-clamp-2 break-words whitespace-pre-wrap leading-tight text-white/95"
                style={{
                  color: customFontColor || "rgba(255,255,255,0.95)",
                  fontSize: finalFontSize || "13px",
                }}
              >
                {data.label!}
              </span>
            </div>

            {/* Expandable: arrow badge bottom-left — click to enter sub-canvas */}
            {EXPANDABLE_TYPES.has(type) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  fireEnterNode(id);
                }}
                className="absolute bottom-1 left-1.5 flex items-center gap-1 px-1 py-0.5 rounded hover:bg-white/[0.08] transition-colors group/enter"
                title="Open internal workspace"
              >
                <svg
                  width="7"
                  height="7"
                  viewBox="0 0 8 8"
                  className="text-white/20 group-hover/enter:text-white/60 transition-colors"
                >
                  <path d="M1 1L7 4L1 7V1Z" fill="currentColor" />
                </svg>
                {(data.subCanvas as any)?.nodes?.length > 0 && (
                  <span className="text-[7px] font-bold text-white/20 group-hover/enter:text-white/50 transition-colors">
                    {(data.subCanvas as any).nodes.length}
                  </span>
                )}
              </button>
            )}
          </div>
        )}

        {/* Hover Tooltip */}
        <AnimatePresence>
          {isHovered && !!data.description && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 bg-[#121214] border border-white/10 rounded-lg p-2.5 z-[1000] shadow-2xl backdrop-blur-xl pointer-events-none"
            >
              <div className="text-[11px] font-semibold text-white/90 mb-1">
                {data.label! || type}
              </div>
              <div className="text-[10px] text-white/50 leading-relaxed whitespace-pre-wrap">
                {data.description}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
