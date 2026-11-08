export type NodeLayer =
  "client" | "edge" | "compute" | "data" | "async" | "external" | "other";
export type NodeShape = "pill" | "card" | "database" | "queue" | "external";

const layers: Record<string, NodeLayer> = {
  user: "client",
  app: "client",
  route53: "edge",
  cdn: "edge",
  loadBalancer: "edge",
  gateway: "edge",
  waf: "edge",
  socketio: "edge",
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
  pusher: "external",
  server: "compute",
  microservice: "compute",
  worker: "compute",
  logic: "compute",
  github_actions: "compute",
  jenkins: "compute",
  circleci: "compute",
  gitlab: "compute",
  argocd: "compute",
  vault: "compute",
  auth0: "compute",
  okta: "compute",
  prometheus: "compute",
  grafana: "compute",
  datadog: "compute",
  "k8s-pod": "compute",
  "k8s-deployment": "compute",
  "k8s-replicaset": "compute",
  "k8s-statefulset": "compute",
  "k8s-daemonset": "compute",
  "k8s-service": "compute",
  "k8s-configmap": "compute",
  "k8s-secret": "compute",
  "k8s-hpa": "compute",
};

export const nodeLayerColors: Record<
  NodeLayer,
  { background: string; border: string; icon: string }
> = {
  client: { background: "#fae9e1", border: "#d9a18b", icon: "#8a4934" },
  edge: { background: "#d9e7ff", border: "#99b9ef", icon: "#174f9f" },
  compute: { background: "#e5e8f3", border: "#abb7d1", icon: "#3d527e" },
  data: { background: "#dff2e5", border: "#98cdaa", icon: "#12643d" },
  async: { background: "#ffebcd", border: "#e8b563", icon: "#85500c" },
  external: { background: "#f8e6f1", border: "#d6a1bd", icon: "#833c65" },
  other: { background: "#e4eef1", border: "#a1bbc4", icon: "#3e626f" },
};

/** Dark surfaces retain a distinct layer hue without overwhelming the canvas. */
export const darkNodeLayerColors: typeof nodeLayerColors = {
  client: { background: "#29211f", border: "#a86d5a", icon: "#f6b19b" },
  edge: { background: "#1c2432", border: "#567fb8", icon: "#8fbdff" },
  compute: { background: "#252331", border: "#8275af", icon: "#c2b2ff" },
  data: { background: "#1a2c25", border: "#4d9070", icon: "#84d5a9" },
  async: { background: "#30271c", border: "#ad8044", icon: "#f1bd70" },
  external: { background: "#30202b", border: "#a8628c", icon: "#f1a1d1" },
  other: { background: "#222831", border: "#668291", icon: "#a6c9d8" },
};

export function nodePresentation(type: string): {
  layer: NodeLayer;
  shape: NodeShape;
} {
  const layer = layers[type] ?? "other";
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
  originalType?: string,
): string | undefined {
  const value =
    provider?.trim() ||
    (type === "generic" ? originalType?.trim() : undefined) ||
    typeLabels[type] ||
    (type === "generic"
      ? undefined
      : type.replace(/^k8s-/, "Kubernetes ").replace(/[_-]/g, " "));
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

/** Accessible text stays complete even when the visual node truncates. */
export function nodeAccessibleLabel(
  type: string | undefined,
  data: Record<string, unknown>,
): string {
  const label =
    typeof data.label === "string" && data.label.trim()
      ? data.label.trim()
      : type || "Node";
  const provider =
    typeof data.provider === "string" ? data.provider : undefined;
  const original =
    typeof data.originalType === "string" ? data.originalType : undefined;
  const subtitle = nodeSubtitle(type || "generic", label, provider, original);
  const description =
    typeof data.description === "string" ? data.description.trim() : "";
  const status =
    typeof data.status === "string" && data.status
      ? `Status: ${data.status}`
      : "";
  const metadata = [
    data.replicas ? `${String(data.replicas)} replicas` : "",
    data.image,
    data.serviceType,
    data.schedule,
    data.storageSize,
  ].filter((value): value is string => typeof value === "string" && !!value);
  return [label, subtitle, status, ...metadata, description]
    .filter(Boolean)
    .join(". ");
}
