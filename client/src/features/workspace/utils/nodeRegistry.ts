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
  palette?: { label: string; icon: string; category: string; order: number };
  description?: string;
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

    palette: { label: "Server", icon: "Server", category: "Core", order: 0 },
    description: "General purpose compute instance (e.g. EC2, VM)",
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

    palette: {
      label: "Database",
      icon: "Database",
      category: "Core",
      order: 1,
    },
    description: "Relational or NoSQL database server",
  },
  {
    id: "storage",
    version: 1,
    size: { w: 144, h: 120 },
    aliases: ["s3", "blob", "gcs"],
    container: false,
    expandable: false,

    palette: {
      label: "Object Storage",
      icon: "HardDrive",
      category: "Core",
      order: 10,
    },
    description: "Object storage (e.g. S3, GCS)",
  },
  {
    id: "microservice",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: ["service", "docker", "container"],
    container: false,
    expandable: true,

    palette: { label: "Service", icon: "Box", category: "Core", order: 5 },
    description: "Containerized application or service",
  },
  {
    id: "cache",
    version: 1,
    size: { w: 144, h: 120 },
    aliases: ["redis", "elasticache", "memcached"],
    container: false,
    expandable: false,

    palette: { label: "Cache", icon: "Zap", category: "Core", order: 2 },
    description: "In-memory data store (e.g. Redis, Memcached)",
  },
  {
    id: "worker",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,

    palette: { label: "Worker", icon: "Cpu", category: "Core", order: 6 },
    description: "Background processing or job queue worker",
  },
  {
    id: "logic",
    version: 1,
    size: { w: 120, h: 72 },
    aliases: ["lambda", "aws-lambda", "azure-function"],
    container: false,
    expandable: false,

    palette: { label: "Function", icon: "Zap", category: "Core", order: 7 },
    description: "Serverless function (e.g. AWS Lambda)",
  },
  {
    id: "user",
    version: 1,
    size: { w: 96, h: 96 },
    aliases: [],
    container: false,
    expandable: false,

    palette: { label: "User", icon: "UserIcon", category: "Core", order: 16 },
    description: "End user or client application",
  },
  {
    id: "app",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: ["react", "vue", "angular", "nextjs", "nuxt"],
    container: false,
    expandable: true,

    palette: { label: "Client App", icon: "Box", category: "Core", order: 17 },
    description: "Frontend client application (Web/Mobile)",
  },
  {
    id: "search",
    version: 1,
    size: { w: 144, h: 120 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "Search",
      icon: "Search",
      category: "More",
      order: 19,
    },
    description: "Search engine or indexing service",
  },
  {
    id: "gateway",
    version: 1,
    size: { w: 192, h: 72 },
    aliases: ["api-gateway", "apigw", "api_gateway"],
    container: false,
    expandable: false,

    palette: {
      label: "API Gateway",
      icon: "Globe",
      category: "Core",
      order: 3,
    },
    description: "API Gateway for routing client requests",
  },
  {
    id: "loadBalancer",
    version: 1,
    size: { w: 192, h: 72 },
    aliases: ["nginx", "alb", "elb", "haproxy"],
    container: false,
    expandable: false,

    palette: {
      label: "Load Balancer",
      icon: "Cpu",
      category: "Core",
      order: 4,
    },
    description: "Distributes traffic across multiple targets",
  },
  {
    id: "cdn",
    version: 1,
    size: { w: 192, h: 72 },
    aliases: ["cloudfront", "fastly", "akamai"],
    container: false,
    expandable: false,

    palette: { label: "CDN", icon: "Globe", category: "Core", order: 11 },
    description: "Content Delivery Network for edge caching",
  },
  {
    id: "bus",
    version: 1,
    size: { w: 192, h: 72 },
    aliases: ["kafka", "kinesis"],
    container: false,
    expandable: false,

    palette: {
      label: "Event Stream",
      icon: "Share2",
      category: "Core",
      order: 9,
    },
    description: "Event stream / Message bus (e.g. Kafka)",
  },
  {
    id: "queue",
    version: 1,
    size: { w: 192, h: 72 },
    aliases: ["rabbitmq", "sqs", "celery"],
    container: false,
    expandable: false,

    palette: {
      label: "Queue",
      icon: "MessageSquare",
      category: "Core",
      order: 8,
    },
    description: "Message queue (e.g. SQS, RabbitMQ)",
  },
  {
    id: "route53",
    version: 1,
    size: { w: 192, h: 72 },
    aliases: [],
    container: false,
    expandable: false,

    palette: { label: "Route 53", icon: "Globe", category: "More", order: 23 },
  },
  {
    id: "nats",
    version: 1,
    size: { w: 192, h: 72 },
    aliases: [],
    container: false,
    expandable: false,

    palette: { label: "NATS", icon: "Activity", category: "More", order: 24 },
  },
  {
    id: "socketio",
    version: 1,
    size: { w: 144, h: 72 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "Socket.io",
      icon: "MessageCircle",
      category: "More",
      order: 25,
    },
  },
  {
    id: "github_actions",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "GitHub Actions",
      icon: "PlayCircle",
      category: "More",
      order: 26,
    },
  },
  {
    id: "jenkins",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "Jenkins",
      icon: "Settings",
      category: "More",
      order: 27,
    },
  },
  {
    id: "gitlab",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "GitLab CI",
      icon: "GitBranch",
      category: "More",
      order: 28,
    },
  },
  {
    id: "argocd",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "Argo CD",
      icon: "PlayCircle",
      category: "More",
      order: 29,
    },
  },
  {
    id: "vault",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,

    palette: { label: "Vault", icon: "Lock", category: "More", order: 30 },
  },
  {
    id: "auth0",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,

    palette: { label: "Auth0", icon: "Key", category: "More", order: 31 },
  },
  {
    id: "waf",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,

    palette: { label: "WAF", icon: "Shield", category: "More", order: 32 },
  },
  {
    id: "prometheus",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "Prometheus",
      icon: "Activity",
      category: "More",
      order: 33,
    },
  },
  {
    id: "grafana",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "Grafana",
      icon: "BarChart3",
      category: "More",
      order: 34,
    },
  },
  {
    id: "datadog",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "Datadog",
      icon: "PieChart",
      category: "More",
      order: 35,
    },
  },
  {
    id: "stripe",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "Stripe",
      icon: "CreditCard",
      category: "More",
      order: 36,
    },
  },
  {
    id: "twilio",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "Twilio",
      icon: "MessageCircle",
      category: "More",
      order: 37,
    },
  },
  {
    id: "shopify",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "Shopify",
      icon: "ShoppingCart",
      category: "More",
      order: 38,
    },
  },
  {
    id: "influxdb",
    version: 1,
    size: { w: 144, h: 120 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "InfluxDB",
      icon: "BarChart3",
      category: "More",
      order: 20,
    },
  },
  {
    id: "snowflake",
    version: 1,
    size: { w: 144, h: 120 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "Snowflake",
      icon: "Layers",
      category: "More",
      order: 21,
    },
  },
  {
    id: "clickhouse",
    version: 1,
    size: { w: 144, h: 120 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "Clickhouse",
      icon: "Database",
      category: "More",
      order: 22,
    },
  },
  {
    id: "api",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "External API",
      icon: "Globe",
      category: "Core",
      order: 18,
    },
    description: "External 3rd-party API service",
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

    palette: { label: "Region", icon: "Globe", category: "Core", order: 13 },
    description: "Cloud region or physical datacenter",
  },
  {
    id: "vpc",
    version: 1,
    size: { w: 600, h: 408 },
    aliases: [],
    container: true,
    expandable: true,

    palette: { label: "VPC", icon: "Square", category: "Core", order: 12 },
    description: "Virtual Private Cloud network boundary",
  },
  {
    id: "availability-zone",
    version: 1,
    size: { w: 552, h: 336 },
    aliases: ["zone", "az"],
    container: true,
    expandable: true,

    palette: {
      label: "Availability Zone",
      icon: "Square",
      category: "Core",
      order: 14,
    },
  },
  {
    id: "subnet",
    version: 1,
    size: { w: 408, h: 216 },
    aliases: ["private_subnet", "public_subnet"],
    container: true,
    expandable: false,

    palette: { label: "Subnet", icon: "Network", category: "Core", order: 15 },
  },
  {
    id: "k8s-namespace",
    version: 1,
    size: { w: 504, h: 336 },
    aliases: [],
    container: true,
    expandable: true,

    palette: {
      label: "Namespace",
      icon: "K8sNamespaceIcon",
      category: "Kubernetes",
      order: 52,
    },
  },
  {
    id: "k8s-pod",
    version: 1,
    size: { w: 144, h: 96 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "Pod",
      icon: "K8sPodIcon",
      category: "Kubernetes",
      order: 39,
    },
    description: "Smallest deployable Kubernetes object",
  },
  {
    id: "k8s-deployment",
    version: 1,
    size: { w: 192, h: 96 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "Deployment",
      icon: "K8sDeployIcon",
      category: "Kubernetes",
      order: 40,
    },
    description: "Manages stateless applications",
  },
  {
    id: "k8s-replicaset",
    version: 1,
    size: { w: 168, h: 96 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "ReplicaSet",
      icon: "K8sReplicaSetIcon",
      category: "Kubernetes",
      order: 41,
    },
  },
  {
    id: "k8s-statefulset",
    version: 1,
    size: { w: 168, h: 96 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "StatefulSet",
      icon: "K8sStatefulIcon",
      category: "Kubernetes",
      order: 42,
    },
  },
  {
    id: "k8s-daemonset",
    version: 1,
    size: { w: 168, h: 96 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "DaemonSet",
      icon: "K8sDaemonIcon",
      category: "Kubernetes",
      order: 43,
    },
  },
  {
    id: "k8s-service",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "Service",
      icon: "K8sServiceIcon",
      category: "Kubernetes",
      order: 46,
    },
    description: "Network endpoint for a set of Pods",
  },
  {
    id: "k8s-ingress",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "Ingress",
      icon: "K8sIngressIcon",
      category: "Kubernetes",
      order: 47,
    },
  },
  {
    id: "k8s-configmap",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "ConfigMap",
      icon: "K8sConfigMapIcon",
      category: "Kubernetes",
      order: 48,
    },
  },
  {
    id: "k8s-secret",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "Secret",
      icon: "K8sSecretIcon",
      category: "Kubernetes",
      order: 49,
    },
  },
  {
    id: "k8s-pvc",
    version: 1,
    size: { w: 168, h: 96 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "PVC",
      icon: "K8sPVCIcon",
      category: "Kubernetes",
      order: 50,
    },
  },
  {
    id: "k8s-job",
    version: 1,
    size: { w: 144, h: 72 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "Job",
      icon: "K8sJobIcon",
      category: "Kubernetes",
      order: 44,
    },
  },
  {
    id: "k8s-cronjob",
    version: 1,
    size: { w: 168, h: 96 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "CronJob",
      icon: "K8sCronJobIcon",
      category: "Kubernetes",
      order: 45,
    },
  },
  {
    id: "k8s-hpa",
    version: 1,
    size: { w: 168, h: 96 },
    aliases: [],
    container: false,
    expandable: false,

    palette: {
      label: "Autoscaler",
      icon: "K8sHPAIcon",
      category: "Kubernetes",
      order: 51,
    },
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
  {
    id: "dns",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
    palette: {
      label: "DNS",
      icon: "Globe",
      category: "Infrastructure",
      order: 100,
    },
    description: "Resolves hostnames to network destinations",
  },
  {
    id: "firewall",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
    palette: {
      label: "Firewall",
      icon: "Shield",
      category: "Infrastructure",
      order: 101,
    },
    description: "Controls network traffic across a security boundary",
  },
  {
    id: "identity-provider",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
    palette: {
      label: "Identity Provider",
      icon: "Key",
      category: "Infrastructure",
      order: 102,
    },
    description: "Authenticates users or workloads",
  },
  {
    id: "secrets-manager",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
    palette: {
      label: "Secrets Manager",
      icon: "Lock",
      category: "Infrastructure",
      order: 103,
    },
    description: "Stores and distributes secrets and credentials",
  },
  {
    id: "monitoring",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
    palette: {
      label: "Monitoring",
      icon: "Activity",
      category: "Infrastructure",
      order: 104,
    },
    description: "Monitors health, signals, and alerts",
  },
  {
    id: "log-store",
    version: 1,
    size: { w: 144, h: 120 },
    aliases: [],
    container: false,
    expandable: false,
    palette: {
      label: "Log Store",
      icon: "Database",
      category: "Infrastructure",
      order: 105,
    },
    description: "Collects and stores logs",
  },
  {
    id: "metrics-store",
    version: 1,
    size: { w: 144, h: 120 },
    aliases: [],
    container: false,
    expandable: false,
    palette: {
      label: "Metrics Store",
      icon: "BarChart3",
      category: "Infrastructure",
      order: 106,
    },
    description: "Collects and stores time-series metrics",
  },
  {
    id: "trace-store",
    version: 1,
    size: { w: 144, h: 120 },
    aliases: [],
    container: false,
    expandable: false,
    palette: {
      label: "Trace Store",
      icon: "Activity",
      category: "Infrastructure",
      order: 107,
    },
    description: "Collects and stores distributed traces",
  },
  {
    id: "container-registry",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
    palette: {
      label: "Container Registry",
      icon: "Box",
      category: "Infrastructure",
      order: 108,
    },
    description: "Stores and distributes container images",
  },
  {
    id: "scheduler",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
    palette: {
      label: "Scheduler",
      icon: "Cpu",
      category: "Infrastructure",
      order: 109,
    },
    description: "Runs tasks on a schedule or trigger",
  },
  {
    id: "data-warehouse",
    version: 1,
    size: { w: 144, h: 120 },
    aliases: [],
    container: false,
    expandable: false,
    palette: {
      label: "Data Warehouse",
      icon: "Database",
      category: "Infrastructure",
      order: 110,
    },
    description: "Stores analytical data for queries and reporting",
  },
  {
    id: "ci-pipeline",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
    palette: {
      label: "CI/CD Pipeline",
      icon: "PlayCircle",
      category: "Infrastructure",
      order: 111,
    },
    description: "Builds, tests, and deploys software",
  },
  {
    id: "workflow-task",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
    palette: {
      label: "Process Step",
      icon: "Settings",
      category: "Workflow",
      order: 120,
    },
    description: "An activity or task in a process",
  },
  {
    id: "workflow-decision",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
    palette: {
      label: "Decision",
      icon: "Decision",
      category: "Workflow",
      order: 121,
    },
    description: "A point where a process branches based on a condition",
  },
  {
    id: "workflow-event",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
    palette: {
      label: "Event",
      icon: "EventIcon",
      category: "Workflow",
      order: 122,
    },
    description: "An event that starts or affects a process",
  },
  {
    id: "workflow-input",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
    palette: {
      label: "Input",
      icon: "FlowInput",
      category: "Workflow",
      order: 123,
    },
    description: "Information or material entering a process",
  },
  {
    id: "workflow-output",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
    palette: {
      label: "Output",
      icon: "FlowOutput",
      category: "Workflow",
      order: 124,
    },
    description: "Information or material produced by a process",
  },
  {
    id: "workflow-lane",
    version: 1,
    size: { w: 552, h: 336 },
    aliases: [],
    container: true,
    expandable: false,
    palette: {
      label: "Swimlane",
      icon: "LaneIcon",
      category: "Workflow",
      order: 125,
    },
    description: "Groups process steps by responsible person or team",
  },
  {
    id: "data-source",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
    palette: {
      label: "Data Source",
      icon: "FlowInput",
      category: "Data pipeline",
      order: 130,
    },
    description: "Origin of data entering a pipeline",
  },
  {
    id: "data-transform",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
    palette: {
      label: "Transformation",
      icon: "Settings",
      category: "Data pipeline",
      order: 131,
    },
    description: "Processing that cleans, reshapes, or combines data",
  },
  {
    id: "data-dataset",
    version: 1,
    size: { w: 168, h: 96 },
    aliases: [],
    container: false,
    expandable: false,
    palette: {
      label: "Dataset",
      icon: "Database",
      category: "Data pipeline",
      order: 132,
    },
    description: "A collection of data used or produced by a pipeline",
  },
  {
    id: "data-model",
    version: 1,
    size: { w: 168, h: 96 },
    aliases: [],
    container: false,
    expandable: false,
    palette: {
      label: "Data Model",
      icon: "Layers",
      category: "Data pipeline",
      order: 133,
    },
    description: "A structured representation of data for analysis or use",
  },
  {
    id: "data-destination",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
    palette: {
      label: "Data Destination",
      icon: "FlowOutput",
      category: "Data pipeline",
      order: 134,
    },
    description: "A destination that receives data from a pipeline",
  },
  {
    id: "data-schedule",
    version: 1,
    size: { w: 168, h: 72 },
    aliases: [],
    container: false,
    expandable: false,
    palette: {
      label: "Pipeline Schedule",
      icon: "EventIcon",
      category: "Data pipeline",
      order: 135,
    },
    description: "A schedule or trigger for a data pipeline",
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
