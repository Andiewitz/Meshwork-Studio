export interface NodeSize {
  w: number;
  h: number;
}

/**
 * The one source of truth for every persisted canvas node type and its default
 * frame. Defaults apply only when a node has no stored size; they never reset
 * a user's resized node.
 */
export const NODE_SIZES: Record<string, NodeSize> = {
  server: { w: 168, h: 96 },
  database: { w: 144, h: 120 },
  storage: { w: 144, h: 120 },
  microservice: { w: 168, h: 72 },
  cache: { w: 144, h: 120 },
  worker: { w: 168, h: 72 },
  logic: { w: 120, h: 72 },
  user: { w: 96, h: 96 },
  app: { w: 168, h: 72 },
  search: { w: 144, h: 120 },
  gateway: { w: 192, h: 72 },
  loadBalancer: { w: 192, h: 72 },
  cdn: { w: 192, h: 72 },
  bus: { w: 192, h: 72 },
  queue: { w: 192, h: 72 },
  route53: { w: 192, h: 72 },
  nats: { w: 192, h: 72 },
  socketio: { w: 144, h: 72 },
  github_actions: { w: 168, h: 72 },
  jenkins: { w: 168, h: 72 },
  gitlab: { w: 168, h: 72 },
  argocd: { w: 168, h: 72 },
  vault: { w: 168, h: 72 },
  auth0: { w: 168, h: 72 },
  waf: { w: 168, h: 72 },
  prometheus: { w: 168, h: 72 },
  grafana: { w: 168, h: 72 },
  datadog: { w: 168, h: 72 },
  stripe: { w: 168, h: 72 },
  twilio: { w: 168, h: 72 },
  shopify: { w: 168, h: 72 },
  influxdb: { w: 144, h: 120 },
  snowflake: { w: 144, h: 120 },
  clickhouse: { w: 144, h: 120 },
  api: { w: 168, h: 72 },
  annotation: { w: 160, h: 48 },
  note: { w: 192, h: 192 },
  junction: { w: 24, h: 24 },
  region: { w: 720, h: 504 },
  vpc: { w: 600, h: 408 },
  "availability-zone": { w: 552, h: 336 },
  subnet: { w: 408, h: 216 },
  "k8s-namespace": { w: 504, h: 336 },
  "k8s-pod": { w: 144, h: 96 },
  "k8s-deployment": { w: 192, h: 96 },
  "k8s-replicaset": { w: 168, h: 96 },
  "k8s-statefulset": { w: 168, h: 96 },
  "k8s-daemonset": { w: 168, h: 96 },
  "k8s-service": { w: 168, h: 72 },
  "k8s-ingress": { w: 168, h: 72 },
  "k8s-configmap": { w: 168, h: 72 },
  "k8s-secret": { w: 168, h: 72 },
  "k8s-pvc": { w: 168, h: 96 },
  "k8s-job": { w: 144, h: 72 },
  "k8s-cronjob": { w: 168, h: 96 },
  "k8s-hpa": { w: 168, h: 96 },
  pusher: { w: 168, h: 72 },
  circleci: { w: 168, h: 72 },
  okta: { w: 168, h: 72 },
  sendgrid: { w: 168, h: 72 },
  paypal: { w: 168, h: 72 },
  generic: { w: 168, h: 72 },
};

export const TYPE_ALIASES: Record<string, string> = {
  postgres: "database",
  postgresql: "database",
  mongo: "database",
  mongodb: "database",
  mysql: "database",
  dynamodb: "database",
  redis: "cache",
  elasticache: "cache",
  memcached: "cache",
  "api-gateway": "gateway",
  apigw: "gateway",
  api_gateway: "gateway",
  nginx: "loadBalancer",
  alb: "loadBalancer",
  elb: "loadBalancer",
  haproxy: "loadBalancer",
  lambda: "logic",
  "aws-lambda": "logic",
  "azure-function": "logic",
  service: "microservice",
  docker: "microservice",
  container: "microservice",
  kafka: "bus",
  kinesis: "bus",
  rabbitmq: "queue",
  sqs: "queue",
  celery: "queue",
  s3: "storage",
  blob: "storage",
  gcs: "storage",
  cloudfront: "cdn",
  fastly: "cdn",
  akamai: "cdn",
  react: "app",
  vue: "app",
  angular: "app",
  nextjs: "app",
  nuxt: "app",
  text: "annotation",
  zone: "availability-zone",
  az: "availability-zone",
  private_subnet: "subnet",
  public_subnet: "subnet",
};

export const VALID_TYPES = new Set(Object.keys(NODE_SIZES));
const CANONICAL_TYPES_BY_LOWERCASE = new Map(
  Object.keys(NODE_SIZES).map((type) => [type.toLowerCase(), type]),
);
export const CONTAINER_TYPES = new Set([
  "region",
  "vpc",
  "availability-zone",
  "subnet",
  "k8s-namespace",
]);

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
