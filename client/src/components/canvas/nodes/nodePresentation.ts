export type NodeLayer =
  "client" | "edge" | "compute" | "data" | "async" | "external";
export type NodeShape = "pill" | "card" | "database" | "queue" | "external";

const layers: Record<string, NodeLayer> = {
  user: "client",
  app: "client",
  route53: "edge",
  cdn: "edge",
  loadBalancer: "edge",
  gateway: "edge",
  waf: "edge",
  "k8s-ingress": "edge",
  database: "data",
  cache: "data",
  storage: "data",
  search: "data",
  influxdb: "data",
  snowflake: "data",
  clickhouse: "data",
  "k8s-pvc": "data",
  queue: "async",
  bus: "async",
  nats: "async",
  "k8s-job": "async",
  "k8s-cronjob": "async",
  api: "external",
  stripe: "external",
  twilio: "external",
  shopify: "external",
  sendgrid: "external",
  paypal: "external",
};

export const nodeLayerColors: Record<
  NodeLayer,
  { background: string; border: string; icon: string }
> = {
  client: { background: "#f5f5f4", border: "#a8aaa9", icon: "#34383a" },
  edge: { background: "#d9e7ff", border: "#99b9ef", icon: "#174f9f" },
  compute: { background: "#e5e8f3", border: "#abb7d1", icon: "#3d527e" },
  data: { background: "#dff2e5", border: "#98cdaa", icon: "#12643d" },
  async: { background: "#ffebcd", border: "#e8b563", icon: "#85500c" },
  external: { background: "#f5f5f4", border: "#8a8f8d", icon: "#454b49" },
};

export function nodePresentation(type: string): {
  layer: NodeLayer;
  shape: NodeShape;
} {
  const layer = layers[type] ?? "compute";
  const shape: NodeShape =
    type === "database"
      ? "database"
      : type === "queue" || type === "bus"
        ? "queue"
        : layer === "external"
          ? "external"
          : layer === "client"
            ? "pill"
            : "card";
  return { layer, shape };
}

const typeLabels: Record<string, string> = {
  user: "User",
  app: "Client app",
  route53: "DNS",
  cdn: "CDN",
  loadBalancer: "Load balancer",
  gateway: "API gateway",
  server: "Server",
  microservice: "Service",
  worker: "Worker",
  logic: "Function",
  database: "Database",
  cache: "Cache",
  search: "Search index",
  storage: "Object storage",
  queue: "Message queue",
  bus: "Event stream",
  api: "External API",
  "k8s-cronjob": "Scheduled job",
};

export function nodeSubtitle(
  type: string,
  label: string | undefined,
  provider: string | undefined,
): string | undefined {
  const value =
    provider?.trim() ||
    typeLabels[type] ||
    type.replace(/^k8s-/, "Kubernetes ").replace(/[_-]/g, " ");
  return value && value.toLowerCase() !== label?.trim().toLowerCase()
    ? value
    : undefined;
}

/** Choose legible default text for the hex colors offered by the style picker. */
export function nodeTextColor(
  background: string | undefined,
  transparentTheme = false,
): string {
  if (transparentTheme) return "#fff";
  const hex = background?.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (!hex) return background ? "#fff" : "#1c2023";
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  const channels = [0, 2, 4]
    .map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance =
    0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.179 ? "#1c2023" : "#fff";
}
