export interface NodeSize {
  w: number;
  h: number;
}

export interface NodeDefinition {
  id: string;
  version: 1;
  size: NodeSize;
  aliases: readonly string[];
  container: boolean;
  expandable: boolean;
}

/** Persisted node capabilities and aliases. Existing saved dimensions always win. */
export const NODE_DEFINITIONS: readonly NodeDefinition[] = [
  {
    id: "server",
    version: 1,
    size: { w: 168, h: 96 },
    aliases: [],
    container: false,
    expandable: true,
  },
  {
    id: "database",
    version: 1,
    size: { w: 144, h: 120 },
    aliases: [
      "postgres",
      "postgresql",
      "mongo",
      "mongodb",
      "mysql",
      "dynamodb",
    ],
    container: false,
    expandable: false,
  },
  {
    id: "storage",
    version: 1,
    size: { w: 144, h: 120 },
    aliases: ["s3", "blob", "gcs"],
    container: false,
    expandable: false,
  },
  {
    id: "microservice",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: ["service", "docker", "container"],
    container: false,
    expandable: true,
  },
  {
    id: "cache",
    version: 1,
    size: { w: 144, h: 120 },
    aliases: ["redis", "elasticache", "memcached"],
    container: false,
    expandable: false,
  },
  {
    id: "worker",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "logic",
    version: 1,
    size: { w: 120, h: 72 },
    aliases: ["lambda", "aws-lambda", "azure-function"],
    container: false,
    expandable: false,
  },
  {
    id: "user",
    version: 1,
    size: { w: 96, h: 96 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "app",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: ["react", "vue", "angular", "nextjs", "nuxt"],
    container: false,
    expandable: true,
  },
  {
    id: "search",
    version: 1,
    size: { w: 144, h: 120 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "gateway",
    version: 1,
    size: { w: 192, h: 72 },
    aliases: ["api-gateway", "apigw", "api_gateway"],
    container: false,
    expandable: false,
  },
  {
    id: "loadBalancer",
    version: 1,
    size: { w: 192, h: 72 },
    aliases: ["nginx", "alb", "elb", "haproxy"],
    container: false,
    expandable: false,
  },
  {
    id: "cdn",
    version: 1,
    size: { w: 192, h: 72 },
    aliases: ["cloudfront", "fastly", "akamai"],
    container: false,
    expandable: false,
  },
  {
    id: "bus",
    version: 1,
    size: { w: 192, h: 72 },
    aliases: ["kafka", "kinesis"],
    container: false,
    expandable: false,
  },
  {
    id: "queue",
    version: 1,
    size: { w: 192, h: 72 },
    aliases: ["rabbitmq", "sqs", "celery"],
    container: false,
    expandable: false,
  },
  {
    id: "route53",
    version: 1,
    size: { w: 192, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "nats",
    version: 1,
    size: { w: 192, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "socketio",
    version: 1,
    size: { w: 144, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "github_actions",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "jenkins",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "gitlab",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "argocd",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "vault",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "auth0",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "waf",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "prometheus",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "grafana",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "datadog",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "stripe",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "twilio",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "shopify",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "influxdb",
    version: 1,
    size: { w: 144, h: 120 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "snowflake",
    version: 1,
    size: { w: 144, h: 120 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "clickhouse",
    version: 1,
    size: { w: 144, h: 120 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "api",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "annotation",
    version: 1,
    size: { w: 160, h: 48 },
    aliases: ["text"],
    container: false,
    expandable: false,
  },
  {
    id: "note",
    version: 1,
    size: { w: 192, h: 192 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "junction",
    version: 1,
    size: { w: 24, h: 24 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "region",
    version: 1,
    size: { w: 720, h: 504 },
    aliases: [],
    container: true,
    expandable: true,
  },
  {
    id: "vpc",
    version: 1,
    size: { w: 600, h: 408 },
    aliases: [],
    container: true,
    expandable: true,
  },
  {
    id: "availability-zone",
    version: 1,
    size: { w: 552, h: 336 },
    aliases: ["zone", "az"],
    container: true,
    expandable: true,
  },
  {
    id: "subnet",
    version: 1,
    size: { w: 408, h: 216 },
    aliases: ["private_subnet", "public_subnet"],
    container: true,
    expandable: false,
  },
  {
    id: "k8s-namespace",
    version: 1,
    size: { w: 504, h: 336 },
    aliases: [],
    container: true,
    expandable: true,
  },
  {
    id: "k8s-pod",
    version: 1,
    size: { w: 144, h: 96 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "k8s-deployment",
    version: 1,
    size: { w: 192, h: 96 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "k8s-replicaset",
    version: 1,
    size: { w: 168, h: 96 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "k8s-statefulset",
    version: 1,
    size: { w: 168, h: 96 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "k8s-daemonset",
    version: 1,
    size: { w: 168, h: 96 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "k8s-service",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "k8s-ingress",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "k8s-configmap",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "k8s-secret",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "k8s-pvc",
    version: 1,
    size: { w: 168, h: 96 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "k8s-job",
    version: 1,
    size: { w: 144, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "k8s-cronjob",
    version: 1,
    size: { w: 168, h: 96 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "k8s-hpa",
    version: 1,
    size: { w: 168, h: 96 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "pusher",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "circleci",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "okta",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "sendgrid",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "paypal",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
  {
    id: "generic",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
  },
];

export const NODE_SIZES: Record<string, NodeSize> = Object.fromEntries(
  NODE_DEFINITIONS.map(({ id, size }) => [id, size]),
);
export const TYPE_ALIASES: Record<string, string> = Object.fromEntries(
  NODE_DEFINITIONS.flatMap(({ id, aliases }) =>
    aliases.map((alias) => [alias, id]),
  ),
);
export const VALID_TYPES = new Set(NODE_DEFINITIONS.map(({ id }) => id));
const CANONICAL_TYPES_BY_LOWERCASE = new Map(
  NODE_DEFINITIONS.map(({ id }) => [id.toLowerCase(), id]),
);
export const CONTAINER_TYPES = new Set(
  NODE_DEFINITIONS.filter((definition) => definition.container).map(
    ({ id }) => id,
  ),
);
export const EXPANDABLE_TYPES = new Set(
  NODE_DEFINITIONS.filter((definition) => definition.expandable).map(
    ({ id }) => id,
  ),
);

export function resolveNodeType(input?: string): {
  type: string;
  originalType?: string;
} {
  const originalType = input?.trim();
  const normalized = originalType?.toLowerCase();
  const aliased = normalized
    ? (TYPE_ALIASES[normalized] ??
      CANONICAL_TYPES_BY_LOWERCASE.get(normalized) ??
      normalized)
    : "server";
  if (VALID_TYPES.has(aliased)) return { type: aliased };
  return { type: "generic", ...(originalType ? { originalType } : {}) };
}

export function getNodeSize(type?: string): NodeSize {
  return NODE_SIZES[resolveNodeType(type).type] ?? NODE_SIZES.generic;
}
