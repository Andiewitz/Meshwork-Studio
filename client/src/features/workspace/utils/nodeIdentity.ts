import { resolveNodeType } from "./nodeRegistry";

/** Legacy product-specific types retain their renderer while exposing a role. */
const productRoles: Record<string, { role: string; technology: string }> = {
  influxdb: { role: "database", technology: "InfluxDB" },
  snowflake: { role: "database", technology: "Snowflake" },
  clickhouse: { role: "database", technology: "ClickHouse" },
  postgres: { role: "database", technology: "PostgreSQL" },
  postgresql: { role: "database", technology: "PostgreSQL" },
  mongo: { role: "database", technology: "MongoDB" },
  mongodb: { role: "database", technology: "MongoDB" },
  mysql: { role: "database", technology: "MySQL" },
  dynamodb: { role: "database", technology: "DynamoDB" },
  redis: { role: "cache", technology: "Redis" },
  elasticache: { role: "cache", technology: "ElastiCache" },
  memcached: { role: "cache", technology: "Memcached" },
  nginx: { role: "loadBalancer", technology: "NGINX" },
  alb: { role: "loadBalancer", technology: "AWS Application Load Balancer" },
  elb: { role: "loadBalancer", technology: "AWS Elastic Load Balancing" },
  haproxy: { role: "loadBalancer", technology: "HAProxy" },
  docker: { role: "microservice", technology: "Docker" },
  lambda: { role: "logic", technology: "AWS Lambda" },
  "aws-lambda": { role: "logic", technology: "AWS Lambda" },
  "azure-function": { role: "logic", technology: "Azure Functions" },
  kafka: { role: "bus", technology: "Kafka" },
  kinesis: { role: "bus", technology: "Kinesis" },
  rabbitmq: { role: "queue", technology: "RabbitMQ" },
  sqs: { role: "queue", technology: "SQS" },
  celery: { role: "queue", technology: "Celery" },
  s3: { role: "storage", technology: "S3" },
  gcs: { role: "storage", technology: "Google Cloud Storage" },
  cloudfront: { role: "cdn", technology: "CloudFront" },
  fastly: { role: "cdn", technology: "Fastly" },
  akamai: { role: "cdn", technology: "Akamai" },
  react: { role: "app", technology: "React" },
  vue: { role: "app", technology: "Vue" },
  angular: { role: "app", technology: "Angular" },
  nextjs: { role: "app", technology: "Next.js" },
  nuxt: { role: "app", technology: "Nuxt" },
};

export function getNodeIdentity(
  type: string | undefined,
  data: Record<string, unknown> = {},
) {
  const legacy = type ? productRoles[type.trim().toLowerCase()] : undefined;
  const role = legacy?.role ?? resolveNodeType(type).type;
  const technology =
    typeof data.technology === "string" ? data.technology : legacy?.technology;
  const provider =
    typeof data.provider === "string" ? data.provider : undefined;
  return { role, technology, provider };
}
