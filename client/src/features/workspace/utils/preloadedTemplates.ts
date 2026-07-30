export interface TemplateDefinition {
  id: string;
  slug?: string;
  title: string;
  description: string;
  category:
    "Featured" | "Cloud Architectures" | "Full-Stack" | "Data Pipelines";
  stars?: string;
  nodes: any[];
  edges: any[];
}

export const PRELOADED_TEMPLATES: TemplateDefinition[] = [
  {
    id: "meshwork-studio",
    slug: "meshwork-studio",
    title: "meshwork-studio",
    description:
      "Target decoupled microservices architecture with gRPC IPC, Redis queue, and isolated PostgreSQL database clusters.",
    category: "Featured",
    stars: "132.1k",
    nodes: [
      {
        id: "n_title",
        type: "annotation",
        position: { x: 100, y: -150 },
        width: 700,
        height: 120,
        data: {
          label:
            "## Meshwork Target Microservices Architecture\nProduction goal featuring isolated databases, API Gateway routing, Redis caching/queue, and gRPC communication.",
        },
      },
      {
        id: "n_internet",
        type: "user",
        position: { x: 450, y: 30 },
        data: { label: "Internet Clients" },
      },
      {
        id: "n_cloudflare",
        type: "cdn",
        position: { x: 450, y: 150 },
        data: { label: "Cloudflare (DNS/WAF)" },
      },
      {
        id: "n_nginx",
        type: "loadBalancer",
        position: { x: 450, y: 270 },
        data: { label: "Nginx Proxy" },
      },
      {
        id: "n_gateway",
        type: "gateway",
        position: { x: 450, y: 390 },
        data: { label: "API Gateway (JWT)" },
      },
      {
        id: "n_service_auth",
        type: "microservice",
        position: { x: 50, y: 530 },
        data: { label: "Auth Service" },
      },
      {
        id: "n_service_workspace",
        type: "microservice",
        position: { x: 250, y: 530 },
        data: { label: "Workspace Service" },
      },
      {
        id: "n_service_mosh",
        type: "microservice",
        position: { x: 450, y: 530 },
        data: { label: "Mosh AI Service" },
      },
      {
        id: "n_service_mcp",
        type: "microservice",
        position: { x: 650, y: 530 },
        data: { label: "MCP Service" },
      },
      {
        id: "n_service_worker",
        type: "worker",
        position: { x: 850, y: 530 },
        data: { label: "Background Worker" },
      },
      {
        id: "n_db_postgres",
        type: "database",
        position: { x: 50, y: 690 },
        data: { label: "PostgreSQL (auth_db)" },
      },
      {
        id: "n_db_dynamo_nodes",
        type: "database",
        position: { x: 250, y: 690 },
        data: { label: "DynamoDB (nodes)" },
      },
      {
        id: "n_db_dynamo_chat",
        type: "database",
        position: { x: 450, y: 690 },
        data: { label: "DynamoDB (chat_history)" },
      },
      {
        id: "n_cache_redis",
        type: "cache",
        position: { x: 850, y: 690 },
        data: { label: "Redis (cache/queue)" },
      },
    ],
    edges: [
      {
        id: "e1",
        source: "n_internet",
        target: "n_cloudflare",
        animated: true,
      },
      { id: "e2", source: "n_cloudflare", target: "n_nginx", animated: true },
      { id: "e3", source: "n_nginx", target: "n_gateway", animated: true },
      {
        id: "e_gtw_auth",
        source: "n_gateway",
        target: "n_service_auth",
        animated: true,
      },
      {
        id: "e_gtw_ws",
        source: "n_gateway",
        target: "n_service_workspace",
        animated: true,
      },
      {
        id: "e_gtw_mosh",
        source: "n_gateway",
        target: "n_service_mosh",
        animated: true,
      },
      {
        id: "e_gtw_mcp",
        source: "n_gateway",
        target: "n_service_mcp",
        animated: true,
      },
      {
        id: "e_gtw_wrk",
        source: "n_gateway",
        target: "n_service_worker",
        animated: true,
      },
      { id: "e_auth_db", source: "n_service_auth", target: "n_db_postgres" },
      {
        id: "e_ws_db",
        source: "n_service_workspace",
        target: "n_db_dynamo_nodes",
      },
      { id: "e_mosh_db", source: "n_service_mosh", target: "n_db_dynamo_chat" },
      { id: "e_wrk_db", source: "n_service_worker", target: "n_cache_redis" },
    ],
  },
  {
    id: "airbnb",
    slug: "airbnb",
    title: "airbnb",
    description:
      "Global distributed cloud stack with real-time booking engine, ElasticSearch spatial indexing, and AWS DynamoDB clusters.",
    category: "Featured",
    stars: "174.8k",
    nodes: [
      {
        id: "n_title",
        type: "annotation",
        position: { x: 100, y: -150 },
        width: 600,
        height: 100,
        data: {
          label:
            "## Airbnb Global Cloud Architecture\nReal-time booking engine, search indexing & geo-spatial routing.",
        },
      },
      {
        id: "n_client",
        type: "user",
        position: { x: 400, y: 0 },
        data: { label: "Airbnb Web & iOS App" },
      },
      {
        id: "n_cdn",
        type: "cdn",
        position: { x: 400, y: 120 },
        data: { label: "AWS CloudFront" },
      },
      {
        id: "n_alb",
        type: "loadBalancer",
        position: { x: 400, y: 240 },
        data: { label: "AWS ALB Cluster" },
      },
      {
        id: "n_booking",
        type: "microservice",
        position: { x: 150, y: 380 },
        data: { label: "Booking Service" },
      },
      {
        id: "n_search",
        type: "microservice",
        position: { x: 400, y: 380 },
        data: { label: "Search & Spatial Svc" },
      },
      {
        id: "n_payments",
        type: "microservice",
        position: { x: 650, y: 380 },
        data: { label: "Payments Engine" },
      },
      {
        id: "n_es",
        type: "database",
        position: { x: 400, y: 520 },
        data: { label: "ElasticSearch Cluster" },
      },
      {
        id: "n_dynamo",
        type: "database",
        position: { x: 150, y: 520 },
        data: { label: "DynamoDB (Reservations)" },
      },
      {
        id: "n_rds",
        type: "database",
        position: { x: 650, y: 520 },
        data: { label: "RDS Aurora PostgreSQL" },
      },
    ],
    edges: [
      { id: "e1", source: "n_client", target: "n_cdn", animated: true },
      { id: "e2", source: "n_cdn", target: "n_alb", animated: true },
      { id: "e3", source: "n_alb", target: "n_booking", animated: true },
      { id: "e4", source: "n_alb", target: "n_search", animated: true },
      { id: "e5", source: "n_alb", target: "n_payments", animated: true },
      { id: "e6", source: "n_search", target: "n_es" },
      { id: "e7", source: "n_booking", target: "n_dynamo" },
      { id: "e8", source: "n_payments", target: "n_rds" },
    ],
  },
  {
    id: "uber",
    slug: "uber",
    title: "uber",
    description:
      "Real-time driver dispatch platform with Uber H3 spatial indexing, Kafka event streams, and low-latency gRPC services.",
    category: "Featured",
    stars: "120.1k",
    nodes: [
      {
        id: "n_title",
        type: "annotation",
        position: { x: 100, y: -150 },
        width: 600,
        height: 100,
        data: {
          label:
            "## Uber Real-Time Dispatch System\nH3 Spatial indexing, Ringpop cluster & Kafka event streams.",
        },
      },
      {
        id: "n_rider",
        type: "user",
        position: { x: 250, y: 0 },
        data: { label: "Rider App" },
      },
      {
        id: "n_driver",
        type: "user",
        position: { x: 550, y: 0 },
        data: { label: "Driver App" },
      },
      {
        id: "n_envoy",
        type: "gateway",
        position: { x: 400, y: 140 },
        data: { label: "Envoy Proxy Mesh" },
      },
      {
        id: "n_dispatch",
        type: "microservice",
        position: { x: 250, y: 280 },
        data: { label: "DISPATCH (H3 Index)" },
      },
      {
        id: "n_location",
        type: "microservice",
        position: { x: 550, y: 280 },
        data: { label: "Location Ingestion" },
      },
      {
        id: "n_kafka",
        type: "bus",
        position: { x: 400, y: 420 },
        data: { label: "Apache Kafka Event Bus" },
      },
      {
        id: "n_redis",
        type: "cache",
        position: { x: 150, y: 420 },
        data: { label: "Redis Geospatial Cache" },
      },
      {
        id: "n_cassandra",
        type: "database",
        position: { x: 650, y: 420 },
        data: { label: "Cassandra Trip Store" },
      },
    ],
    edges: [
      { id: "e1", source: "n_rider", target: "n_envoy", animated: true },
      { id: "e2", source: "n_driver", target: "n_envoy", animated: true },
      { id: "e3", source: "n_envoy", target: "n_dispatch" },
      { id: "e4", source: "n_envoy", target: "n_location" },
      { id: "e5", source: "n_location", target: "n_kafka", animated: true },
      { id: "e6", source: "n_dispatch", target: "n_redis" },
      { id: "e7", source: "n_kafka", target: "n_cassandra" },
    ],
  },
  {
    id: "shopify",
    slug: "shopify",
    title: "shopify",
    description:
      "High-scale merchant store engine with multi-tenant MySQL sharding, Redis inventory locks, and webhook pipelines.",
    category: "Featured",
    stars: "242.5k",
    nodes: [
      {
        id: "n_title",
        type: "annotation",
        position: { x: 100, y: -150 },
        width: 600,
        height: 100,
        data: {
          label:
            "## Shopify Merchant Store Architecture\nMulti-tenant MySQL pods, Redis flash sales locks & webhook queues.",
        },
      },
      {
        id: "n_shopper",
        type: "user",
        position: { x: 400, y: 0 },
        data: { label: "Storefront Shoppers" },
      },
      {
        id: "n_cloudflare",
        type: "cdn",
        position: { x: 400, y: 120 },
        data: { label: "Cloudflare Edge" },
      },
      {
        id: "n_storefront",
        type: "app",
        position: { x: 400, y: 240 },
        data: { label: "Ruby/Storefront Core" },
      },
      {
        id: "n_inventory",
        type: "microservice",
        position: { x: 200, y: 380 },
        data: { label: "Inventory Lock Svc" },
      },
      {
        id: "n_checkout",
        type: "microservice",
        position: { x: 600, y: 380 },
        data: { label: "Checkout & Tax Svc" },
      },
      {
        id: "n_redis",
        type: "cache",
        position: { x: 200, y: 520 },
        data: { label: "Redis Flash Sale Lock" },
      },
      {
        id: "n_mysql",
        type: "database",
        position: { x: 600, y: 520 },
        data: { label: "MySQL Pod Shards" },
      },
    ],
    edges: [
      { id: "e1", source: "n_shopper", target: "n_cloudflare", animated: true },
      {
        id: "e2",
        source: "n_cloudflare",
        target: "n_storefront",
        animated: true,
      },
      { id: "e3", source: "n_storefront", target: "n_inventory" },
      { id: "e4", source: "n_storefront", target: "n_checkout" },
      { id: "e5", source: "n_inventory", target: "n_redis" },
      { id: "e6", source: "n_checkout", target: "n_mysql" },
    ],
  },
  {
    id: "claude-ai",
    slug: "claude.ai",
    title: "claude.ai",
    description:
      "LLM inference pipeline with streaming SSE context, Anthropic prompt caching, Redis rate-limiters, and Qdrant vector retrieval.",
    category: "Featured",
    stars: "92.7k",
    nodes: [
      {
        id: "n_title",
        type: "annotation",
        position: { x: 100, y: -150 },
        width: 600,
        height: 100,
        data: {
          label:
            "## Claude.ai Inference Infrastructure\nStreaming SSE workers, Anthropic Prompt Caching & Qdrant RAG.",
        },
      },
      {
        id: "n_user",
        type: "user",
        position: { x: 400, y: 0 },
        data: { label: "Claude Web / Desktop" },
      },
      {
        id: "n_gateway",
        type: "gateway",
        position: { x: 400, y: 120 },
        data: { label: "API Gateway (SSE Stream)" },
      },
      {
        id: "n_context",
        type: "microservice",
        position: { x: 200, y: 260 },
        data: { label: "Context Assembly" },
      },
      {
        id: "n_inference",
        type: "microservice",
        position: { x: 600, y: 260 },
        data: { label: "Claude Model Inference" },
      },
      {
        id: "n_vector",
        type: "database",
        position: { x: 200, y: 400 },
        data: { label: "Qdrant Vector DB" },
      },
      {
        id: "n_kv_cache",
        type: "cache",
        position: { x: 600, y: 400 },
        data: { label: "Prompt KV Cache" },
      },
    ],
    edges: [
      { id: "e1", source: "n_user", target: "n_gateway", animated: true },
      { id: "e2", source: "n_gateway", target: "n_context", animated: true },
      { id: "e3", source: "n_context", target: "n_inference", animated: true },
      { id: "e4", source: "n_context", target: "n_vector" },
      { id: "e5", source: "n_inference", target: "n_kv_cache" },
    ],
  },
  {
    id: "figma",
    slug: "figma",
    title: "figma",
    description:
      "Real-time multiplayer WebAssembly canvas sync engine with Operational Transformation (OT) and Rust WebSocket cluster.",
    category: "Featured",
    stars: "215.3k",
    nodes: [
      {
        id: "n_title",
        type: "annotation",
        position: { x: 100, y: -150 },
        width: 600,
        height: 100,
        data: {
          label:
            "## Figma Multiplayer Canvas Architecture\nRust WebSockets, Operational Transformation & WebAssembly engine.",
        },
      },
      {
        id: "n_designer_1",
        type: "user",
        position: { x: 250, y: 0 },
        data: { label: "Designer 1 (Wasm)" },
      },
      {
        id: "n_designer_2",
        type: "user",
        position: { x: 550, y: 0 },
        data: { label: "Designer 2 (Wasm)" },
      },
      {
        id: "n_ws_cluster",
        type: "gateway",
        position: { x: 400, y: 140 },
        data: { label: "Rust WebSocket Cluster" },
      },
      {
        id: "n_ot_engine",
        type: "microservice",
        position: { x: 400, y: 280 },
        data: { label: "OT Sync Engine" },
      },
      {
        id: "n_document_db",
        type: "database",
        position: { x: 250, y: 420 },
        data: { label: "Doc State Store (S3)" },
      },
      {
        id: "n_redis_pubsub",
        type: "cache",
        position: { x: 550, y: 420 },
        data: { label: "Redis Pub/Sub Mesh" },
      },
    ],
    edges: [
      {
        id: "e1",
        source: "n_designer_1",
        target: "n_ws_cluster",
        animated: true,
      },
      {
        id: "e2",
        source: "n_designer_2",
        target: "n_ws_cluster",
        animated: true,
      },
      {
        id: "e3",
        source: "n_ws_cluster",
        target: "n_ot_engine",
        animated: true,
      },
      { id: "e4", source: "n_ot_engine", target: "n_document_db" },
      {
        id: "e5",
        source: "n_ot_engine",
        target: "n_redis_pubsub",
        animated: true,
      },
    ],
  },
  {
    id: "multi-region-ha",
    title: "Multi-Region HA",
    description:
      "Deploy a highly available architecture across multiple regions with automatic failover.",
    category: "Cloud Architectures",
    nodes: [
      {
        id: "n1",
        type: "annotation",
        position: {
          x: -200,
          y: -100,
        },
        width: 500,
        height: 100,
        data: {
          label:
            "## Multi-Region High Availability\nActive-Active regional failover with global load balancing.",
        },
      },
      {
        id: "n2",
        type: "user",
        position: {
          x: -200,
          y: 300,
        },
        data: {
          label: "Internet Users",
        },
      },
      {
        id: "n3",
        type: "route53",
        position: {
          x: 0,
          y: 300,
        },
        data: {
          label: "AWS Route 53",
        },
      },
      {
        id: "r1",
        type: "region",
        position: {
          x: 300,
          y: 50,
        },
        width: 400,
        height: 300,
        data: {
          label: "us-east-1 (Primary)",
        },
      },
      {
        id: "n4",
        parentId: "r1",
        type: "loadBalancer",
        position: {
          x: 20,
          y: 100,
        },
        data: {
          label: "ALB",
        },
      },
      {
        id: "n5",
        parentId: "r1",
        type: "server",
        position: {
          x: 150,
          y: 20,
        },
        data: {
          label: "Web Tier (EC2 ASG)",
        },
      },
      {
        id: "n6",
        parentId: "r1",
        type: "server",
        position: {
          x: 150,
          y: 180,
        },
        data: {
          label: "App Tier (EC2 ASG)",
        },
      },
      {
        id: "n7",
        parentId: "r1",
        type: "database",
        position: {
          x: 280,
          y: 100,
        },
        data: {
          label: "RDS Master",
        },
      },
      {
        id: "r2",
        type: "region",
        position: {
          x: 300,
          y: 450,
        },
        width: 400,
        height: 300,
        data: {
          label: "eu-west-1 (Secondary)",
        },
      },
      {
        id: "n8",
        parentId: "r2",
        type: "loadBalancer",
        position: {
          x: 20,
          y: 100,
        },
        data: {
          label: "ALB",
        },
      },
      {
        id: "n9",
        parentId: "r2",
        type: "server",
        position: {
          x: 150,
          y: 20,
        },
        data: {
          label: "Web Tier (EC2 ASG)",
        },
      },
      {
        id: "n10",
        parentId: "r2",
        type: "server",
        position: {
          x: 150,
          y: 180,
        },
        data: {
          label: "App Tier (EC2 ASG)",
        },
      },
      {
        id: "n11",
        parentId: "r2",
        type: "database",
        position: {
          x: 280,
          y: 100,
        },
        data: {
          label: "RDS Read Replica",
        },
      },
      {
        id: "n12",
        type: "note",
        position: {
          x: 800,
          y: 350,
        },
        width: 300,
        height: 100,
        data: {
          label:
            "Cross-region DB replication keeps the secondary region in sync.",
        },
      },
    ],
    edges: [
      {
        id: "e1",
        source: "n2",
        target: "n3",
        animated: true,
      },
      {
        id: "e2",
        source: "n3",
        target: "n4",
        animated: true,
      },
      {
        id: "e3",
        source: "n3",
        target: "n8",
        animated: true,
        style: {
          strokeDasharray: "5,5",
        },
      },
      {
        id: "e4",
        source: "n4",
        target: "n5",
      },
      {
        id: "e5",
        source: "n4",
        target: "n6",
      },
      {
        id: "e6",
        source: "n5",
        target: "n6",
      },
      {
        id: "e7",
        source: "n6",
        target: "n7",
      },
      {
        id: "e8",
        source: "n8",
        target: "n9",
      },
      {
        id: "e9",
        source: "n8",
        target: "n10",
      },
      {
        id: "e10",
        source: "n9",
        target: "n10",
      },
      {
        id: "e11",
        source: "n10",
        target: "n11",
      },
      {
        id: "e12",
        source: "n7",
        target: "n11",
        animated: true,
        style: {
          strokeDasharray: "5,5",
        },
      },
    ],
  },
  {
    id: "serverless-api",
    title: "Serverless API",
    description:
      "Fully managed serverless API with Lambda functions and DynamoDB.",
    category: "Cloud Architectures",
    nodes: [
      {
        id: "n1",
        type: "annotation",
        position: {
          x: 0,
          y: -100,
        },
        width: 400,
        height: 100,
        data: {
          label:
            "## Serverless API\nFully managed API utilizing AWS Lambda and DynamoDB.",
        },
      },
      {
        id: "n2",
        type: "user",
        position: {
          x: 0,
          y: 200,
        },
        data: {
          label: "SPA App",
        },
      },
      {
        id: "n3",
        type: "cdn",
        position: {
          x: 200,
          y: 100,
        },
        data: {
          label: "CloudFront",
        },
      },
      {
        id: "n4",
        type: "storage",
        position: {
          x: 400,
          y: 0,
        },
        data: {
          label: "S3 (Frontend)",
        },
      },
      {
        id: "n5",
        type: "gateway",
        position: {
          x: 400,
          y: 200,
        },
        data: {
          label: "API Gateway",
        },
      },
      {
        id: "n6",
        type: "auth0",
        position: {
          x: 400,
          y: 400,
        },
        data: {
          label: "Cognito Auth",
        },
      },
      {
        id: "r1",
        type: "region",
        position: {
          x: 650,
          y: 50,
        },
        width: 300,
        height: 450,
        data: {
          label: "Compute & Data",
        },
      },
      {
        id: "n7",
        parentId: "r1",
        type: "logic",
        position: {
          x: 50,
          y: 50,
        },
        data: {
          label: "GetUsers Lambda",
        },
      },
      {
        id: "n8",
        parentId: "r1",
        type: "logic",
        position: {
          x: 50,
          y: 150,
        },
        data: {
          label: "CreateUser Lambda",
        },
      },
      {
        id: "n9",
        parentId: "r1",
        type: "logic",
        position: {
          x: 50,
          y: 250,
        },
        data: {
          label: "Billing Lambda",
        },
      },
      {
        id: "n10",
        parentId: "r1",
        type: "database",
        position: {
          x: 180,
          y: 150,
        },
        data: {
          label: "DynamoDB Table",
        },
      },
    ],
    edges: [
      {
        id: "e1",
        source: "n2",
        target: "n3",
      },
      {
        id: "e2",
        source: "n3",
        target: "n4",
      },
      {
        id: "e3",
        source: "n2",
        target: "n5",
        animated: true,
      },
      {
        id: "e4",
        source: "n5",
        target: "n6",
        style: {
          strokeDasharray: "5,5",
        },
      },
      {
        id: "e5",
        source: "n5",
        target: "n7",
        animated: true,
      },
      {
        id: "e6",
        source: "n5",
        target: "n8",
        animated: true,
      },
      {
        id: "e7",
        source: "n5",
        target: "n9",
        animated: true,
      },
      {
        id: "e8",
        source: "n7",
        target: "n10",
      },
      {
        id: "e9",
        source: "n8",
        target: "n10",
      },
      {
        id: "e10",
        source: "n9",
        target: "n10",
      },
    ],
  },
  {
    id: "event-driven",
    title: "Event Pipeline",
    description:
      "Serverless data pipeline using SQS, Lambda, and S3 with built-in monitoring.",
    category: "Cloud Architectures",
    nodes: [
      {
        id: "n1",
        type: "annotation",
        position: {
          x: 0,
          y: -100,
        },
        width: 500,
        height: 100,
        data: {
          label:
            "## Event-Driven Pipeline\nAsynchronous processing workflow using SQS, EventBridge, and Lambda.",
        },
      },
      {
        id: "n2",
        type: "app",
        position: {
          x: 0,
          y: 250,
        },
        data: {
          label: "Order Service",
        },
      },
      {
        id: "n3",
        type: "bus",
        position: {
          x: 250,
          y: 250,
        },
        data: {
          label: "EventBridge",
        },
      },
      {
        id: "r1",
        type: "region",
        position: {
          x: 500,
          y: 50,
        },
        width: 450,
        height: 450,
        data: {
          label: "Event Consumers",
        },
      },
      {
        id: "n4",
        parentId: "r1",
        type: "queue",
        position: {
          x: 20,
          y: 50,
        },
        data: {
          label: "Fulfillment SQS",
        },
      },
      {
        id: "n5",
        parentId: "r1",
        type: "logic",
        position: {
          x: 180,
          y: 50,
        },
        data: {
          label: "Fulfillment Lambda",
        },
      },
      {
        id: "n6",
        parentId: "r1",
        type: "api",
        position: {
          x: 330,
          y: 50,
        },
        data: {
          label: "3PL API",
        },
      },
      {
        id: "n7",
        parentId: "r1",
        type: "queue",
        position: {
          x: 20,
          y: 200,
        },
        data: {
          label: "Email SQS",
        },
      },
      {
        id: "n8",
        parentId: "r1",
        type: "logic",
        position: {
          x: 180,
          y: 200,
        },
        data: {
          label: "Email Lambda",
        },
      },
      {
        id: "n9",
        parentId: "r1",
        type: "api",
        position: {
          x: 330,
          y: 200,
        },
        data: {
          label: "SendGrid",
        },
      },
      {
        id: "n10",
        parentId: "r1",
        type: "queue",
        position: {
          x: 20,
          y: 350,
        },
        data: {
          label: "Analytics SQS",
        },
      },
      {
        id: "n11",
        parentId: "r1",
        type: "logic",
        position: {
          x: 180,
          y: 350,
        },
        data: {
          label: "Analytics Lambda",
        },
      },
      {
        id: "n12",
        parentId: "r1",
        type: "storage",
        position: {
          x: 330,
          y: 350,
        },
        data: {
          label: "S3 Data Lake",
        },
      },
    ],
    edges: [
      {
        id: "e1",
        source: "n2",
        target: "n3",
        animated: true,
      },
      {
        id: "e2",
        source: "n3",
        target: "n4",
        animated: true,
      },
      {
        id: "e3",
        source: "n3",
        target: "n7",
        animated: true,
      },
      {
        id: "e4",
        source: "n3",
        target: "n10",
        animated: true,
      },
      {
        id: "e5",
        source: "n4",
        target: "n5",
        animated: true,
      },
      {
        id: "e6",
        source: "n5",
        target: "n6",
      },
      {
        id: "e7",
        source: "n7",
        target: "n8",
        animated: true,
      },
      {
        id: "e8",
        source: "n8",
        target: "n9",
      },
      {
        id: "e9",
        source: "n10",
        target: "n11",
        animated: true,
      },
      {
        id: "e10",
        source: "n11",
        target: "n12",
      },
    ],
  },
  {
    id: "mern-stack",
    title: "MERN Stack",
    description:
      "Classic MongoDB, Express, React, Node.js full-stack application.",
    category: "Full-Stack",
    nodes: [
      {
        id: "n1",
        type: "annotation",
        position: {
          x: -200,
          y: -100,
        },
        width: 400,
        height: 100,
        data: {
          label:
            "## MERN Stack Architecture\nThe classic Mongo, Express, React, Node application.",
        },
      },
      {
        id: "n2",
        type: "user",
        position: {
          x: -200,
          y: 250,
        },
        data: {
          label: "Client",
        },
      },
      {
        id: "r1",
        type: "region",
        position: {
          x: 50,
          y: 100,
        },
        width: 800,
        height: 350,
        data: {
          label: "Production Environment",
        },
      },
      {
        id: "n3",
        parentId: "r1",
        type: "app",
        position: {
          x: 50,
          y: 150,
        },
        data: {
          label: "React SPA",
        },
      },
      {
        id: "n4",
        parentId: "r1",
        type: "loadBalancer",
        position: {
          x: 250,
          y: 150,
        },
        data: {
          label: "Nginx Proxy",
        },
      },
      {
        id: "n5",
        parentId: "r1",
        type: "server",
        position: {
          x: 450,
          y: 50,
        },
        data: {
          label: "Express API (Node)",
        },
      },
      {
        id: "n6",
        parentId: "r1",
        type: "server",
        position: {
          x: 450,
          y: 250,
        },
        data: {
          label: "Express API (Node)",
        },
      },
      {
        id: "n7",
        parentId: "r1",
        type: "database",
        position: {
          x: 650,
          y: 150,
        },
        data: {
          label: "MongoDB Replica Set",
        },
      },
      {
        id: "n8",
        type: "github_actions",
        position: {
          x: 450,
          y: -100,
        },
        data: {
          label: "CI/CD Pipeline",
        },
      },
    ],
    edges: [
      {
        id: "e1",
        source: "n2",
        target: "n3",
      },
      {
        id: "e2",
        source: "n3",
        target: "n4",
        animated: true,
      },
      {
        id: "e3",
        source: "n4",
        target: "n5",
        animated: true,
      },
      {
        id: "e4",
        source: "n4",
        target: "n6",
        animated: true,
      },
      {
        id: "e5",
        source: "n5",
        target: "n7",
      },
      {
        id: "e6",
        source: "n6",
        target: "n7",
      },
      {
        id: "e7",
        source: "n8",
        target: "n5",
        style: {
          strokeDasharray: "5,5",
        },
      },
      {
        id: "e8",
        source: "n8",
        target: "n6",
        style: {
          strokeDasharray: "5,5",
        },
      },
      {
        id: "e9",
        source: "n8",
        target: "n3",
        style: {
          strokeDasharray: "5,5",
        },
      },
    ],
  },
  {
    id: "jamstack-cms",
    title: "Jamstack CMS",
    description:
      "Modern static site generation paired with a headless CMS via CDN.",
    category: "Full-Stack",
    nodes: [
      {
        id: "n1",
        type: "annotation",
        position: {
          x: 0,
          y: -100,
        },
        width: 400,
        height: 100,
        data: {
          label:
            "## Jamstack with Headless CMS\nGlobal edge delivery for static sites.",
        },
      },
      {
        id: "n2",
        type: "user",
        position: {
          x: 0,
          y: 200,
        },
        data: {
          label: "Global Users",
        },
      },
      {
        id: "n3",
        type: "cdn",
        position: {
          x: 250,
          y: 200,
        },
        data: {
          label: "Edge Network (CDN)",
        },
      },
      {
        id: "r1",
        type: "region",
        position: {
          x: 500,
          y: 50,
        },
        width: 400,
        height: 300,
        data: {
          label: "Content Management",
        },
      },
      {
        id: "n4",
        parentId: "r1",
        type: "api",
        position: {
          x: 50,
          y: 50,
        },
        data: {
          label: "Headless CMS",
        },
      },
      {
        id: "n5",
        parentId: "r1",
        type: "database",
        position: {
          x: 250,
          y: 50,
        },
        data: {
          label: "Content DB",
        },
      },
      {
        id: "n6",
        parentId: "r1",
        type: "github_actions",
        position: {
          x: 50,
          y: 200,
        },
        data: {
          label: "Static Builder",
        },
      },
      {
        id: "n7",
        parentId: "r1",
        type: "storage",
        position: {
          x: 250,
          y: 200,
        },
        data: {
          label: "Object Storage",
        },
      },
    ],
    edges: [
      {
        id: "e1",
        source: "n2",
        target: "n3",
      },
      {
        id: "e2",
        source: "n4",
        target: "n5",
      },
      {
        id: "e3",
        source: "n4",
        target: "n6",
        animated: true,
        style: {
          strokeDasharray: "5,5",
        },
      },
      {
        id: "e4",
        source: "n6",
        target: "n7",
        animated: true,
      },
      {
        id: "e5",
        source: "n7",
        target: "n3",
      },
    ],
  },
  {
    id: "nextjs-app-router",
    title: "NextJS Auth0",
    description:
      "Next.js App Router with PostgreSQL database and Auth0 identity.",
    category: "Full-Stack",
    nodes: [
      {
        id: "n1",
        type: "annotation",
        position: {
          x: 0,
          y: -100,
        },
        width: 400,
        height: 100,
        data: {
          label:
            "## Next.js + Auth0 + PlanetScale\nModern enterprise-grade React stack.",
        },
      },
      {
        id: "n2",
        type: "user",
        position: {
          x: 0,
          y: 250,
        },
        data: {
          label: "Web Client",
        },
      },
      {
        id: "r1",
        type: "region",
        position: {
          x: 250,
          y: 50,
        },
        width: 550,
        height: 450,
        data: {
          label: "Vercel Infrastructure",
        },
      },
      {
        id: "n3",
        parentId: "r1",
        type: "cdn",
        position: {
          x: 50,
          y: 200,
        },
        data: {
          label: "Edge CDN",
        },
      },
      {
        id: "n4",
        parentId: "r1",
        type: "app",
        position: {
          x: 250,
          y: 50,
        },
        data: {
          label: "Next.js App Router",
        },
      },
      {
        id: "n5",
        parentId: "r1",
        type: "logic",
        position: {
          x: 250,
          y: 200,
        },
        data: {
          label: "Server Actions",
        },
      },
      {
        id: "n6",
        parentId: "r1",
        type: "api",
        position: {
          x: 250,
          y: 350,
        },
        data: {
          label: "API Routes",
        },
      },
      {
        id: "n7",
        parentId: "r1",
        type: "cache",
        position: {
          x: 400,
          y: 200,
        },
        data: {
          label: "KV Cache",
        },
      },
      {
        id: "n8",
        type: "auth0",
        position: {
          x: 900,
          y: 100,
        },
        data: {
          label: "Auth0 Identity",
        },
      },
      {
        id: "n9",
        type: "database",
        position: {
          x: 900,
          y: 400,
        },
        data: {
          label: "PlanetScale DB",
        },
      },
    ],
    edges: [
      {
        id: "e1",
        source: "n2",
        target: "n3",
        animated: true,
      },
      {
        id: "e2",
        source: "n3",
        target: "n4",
      },
      {
        id: "e3",
        source: "n3",
        target: "n5",
        animated: true,
      },
      {
        id: "e4",
        source: "n3",
        target: "n6",
        animated: true,
      },
      {
        id: "e5",
        source: "n5",
        target: "n7",
      },
      {
        id: "e6",
        source: "n6",
        target: "n7",
      },
      {
        id: "e7",
        source: "n5",
        target: "n8",
        style: {
          strokeDasharray: "5,5",
        },
      },
      {
        id: "e8",
        source: "n6",
        target: "n8",
        style: {
          strokeDasharray: "5,5",
        },
      },
      {
        id: "e9",
        source: "n5",
        target: "n9",
        animated: true,
      },
      {
        id: "e10",
        source: "n6",
        target: "n9",
        animated: true,
      },
    ],
  },
  {
    id: "real-time-streaming",
    title: "Streaming Pipe",
    description:
      "High-throughput streaming pipeline using Kafka, Clickhouse, and Grafana.",
    category: "Data Pipelines",
    nodes: [
      {
        id: "n1",
        type: "annotation",
        position: {
          x: 0,
          y: -100,
        },
        width: 500,
        height: 100,
        data: {
          label:
            "## Real-time Telemetry Streaming\nHigh-throughput streaming pipeline using Kafka, Clickhouse, and Grafana.",
        },
      },
      {
        id: "n2",
        type: "app",
        position: {
          x: 0,
          y: 250,
        },
        data: {
          label: "IoT Devices",
        },
      },
      {
        id: "n3",
        type: "gateway",
        position: {
          x: 200,
          y: 250,
        },
        data: {
          label: "Telemetry Ingestion",
        },
      },
      {
        id: "r1",
        type: "region",
        position: {
          x: 450,
          y: 50,
        },
        width: 550,
        height: 450,
        data: {
          label: "Data Platform",
        },
      },
      {
        id: "n4",
        parentId: "r1",
        type: "bus",
        position: {
          x: 50,
          y: 200,
        },
        data: {
          label: "Kafka Cluster",
        },
      },
      {
        id: "n5",
        parentId: "r1",
        type: "worker",
        position: {
          x: 250,
          y: 50,
        },
        data: {
          label: "Flink Streaming",
        },
      },
      {
        id: "n6",
        parentId: "r1",
        type: "worker",
        position: {
          x: 250,
          y: 350,
        },
        data: {
          label: "Kafka Connect",
        },
      },
      {
        id: "n7",
        parentId: "r1",
        type: "clickhouse",
        position: {
          x: 400,
          y: 200,
        },
        data: {
          label: "Clickhouse OLAP",
        },
      },
      {
        id: "n8",
        type: "grafana",
        position: {
          x: 1100,
          y: 250,
        },
        data: {
          label: "Grafana Dashboards",
        },
      },
    ],
    edges: [
      {
        id: "e1",
        source: "n2",
        target: "n3",
        animated: true,
      },
      {
        id: "e2",
        source: "n3",
        target: "n4",
        animated: true,
      },
      {
        id: "e3",
        source: "n4",
        target: "n5",
        animated: true,
      },
      {
        id: "e4",
        source: "n5",
        target: "n4",
        animated: true,
      },
      {
        id: "e5",
        source: "n4",
        target: "n6",
        animated: true,
      },
      {
        id: "e6",
        source: "n6",
        target: "n7",
        animated: true,
      },
      {
        id: "e7",
        source: "n5",
        target: "n7",
        animated: true,
      },
      {
        id: "e8",
        source: "n7",
        target: "n8",
      },
    ],
  },
  {
    id: "batch-processing",
    title: "Batch Processing",
    description:
      "Daily batch processing pipeline pulling from S3 into Snowflake.",
    category: "Data Pipelines",
    nodes: [
      {
        id: "n1",
        type: "annotation",
        position: {
          x: 0,
          y: -100,
        },
        width: 500,
        height: 100,
        data: {
          label:
            "## Nightly Batch Processing\nExtract, Transform, Load (ETL) pipeline with Spark and S3.",
        },
      },
      {
        id: "n2",
        type: "database",
        position: {
          x: 0,
          y: 250,
        },
        data: {
          label: "App DB (MySQL)",
        },
      },
      {
        id: "n3",
        type: "api",
        position: {
          x: 0,
          y: 400,
        },
        data: {
          label: "Sales API",
        },
      },
      {
        id: "r1",
        type: "region",
        position: {
          x: 250,
          y: 50,
        },
        width: 600,
        height: 550,
        data: {
          label: "AWS Big Data Setup",
        },
      },
      {
        id: "n4",
        parentId: "r1",
        type: "logic",
        position: {
          x: 50,
          y: 50,
        },
        data: {
          label: "AWS Step Functions",
        },
      },
      {
        id: "n5",
        parentId: "r1",
        type: "storage",
        position: {
          x: 50,
          y: 200,
        },
        data: {
          label: "S3 Raw Zone",
        },
      },
      {
        id: "n6",
        parentId: "r1",
        type: "worker",
        position: {
          x: 250,
          y: 200,
        },
        data: {
          label: "EMR Spark Cluster",
        },
      },
      {
        id: "n7",
        parentId: "r1",
        type: "storage",
        position: {
          x: 450,
          y: 200,
        },
        data: {
          label: "S3 Curated Zone",
        },
      },
      {
        id: "n8",
        parentId: "r1",
        type: "database",
        position: {
          x: 450,
          y: 400,
        },
        data: {
          label: "Redshift DWH",
        },
      },
      {
        id: "n9",
        type: "note",
        position: {
          x: 900,
          y: 250,
        },
        width: 300,
        height: 150,
        data: {
          label:
            "Spark jobs process the data and write Parquet files to the Curated Zone.",
        },
      },
    ],
    edges: [
      {
        id: "e1",
        source: "n2",
        target: "n5",
      },
      {
        id: "e2",
        source: "n3",
        target: "n5",
      },
      {
        id: "e3",
        source: "n4",
        target: "n6",
        style: {
          strokeDasharray: "5,5",
        },
      },
      {
        id: "e4",
        source: "n5",
        target: "n6",
        animated: true,
      },
      {
        id: "e5",
        source: "n6",
        target: "n7",
        animated: true,
      },
      {
        id: "e6",
        source: "n7",
        target: "n8",
      },
    ],
  },
  {
    id: "log-analytics",
    title: "Log Analytics",
    description:
      "Centralized logging with Elasticsearch and Kibana for fast operational insights.",
    category: "Data Pipelines",
    nodes: [
      {
        id: "n1",
        type: "annotation",
        position: {
          x: 0,
          y: -100,
        },
        width: 400,
        height: 100,
        data: {
          label:
            "## ELK Log Analytics Stack\nCentralized logging and operational metrics.",
        },
      },
      {
        id: "r1",
        type: "region",
        position: {
          x: 0,
          y: 100,
        },
        width: 300,
        height: 400,
        data: {
          label: "Application Cluster",
        },
      },
      {
        id: "n2",
        parentId: "r1",
        type: "microservice",
        position: {
          x: 50,
          y: 50,
        },
        data: {
          label: "Frontend Pods",
        },
      },
      {
        id: "n3",
        parentId: "r1",
        type: "microservice",
        position: {
          x: 50,
          y: 200,
        },
        data: {
          label: "Backend Pods",
        },
      },
      {
        id: "r2",
        type: "region",
        position: {
          x: 400,
          y: 100,
        },
        width: 600,
        height: 400,
        data: {
          label: "Monitoring & Logging",
        },
      },
      {
        id: "n4",
        parentId: "r2",
        type: "worker",
        position: {
          x: 50,
          y: 120,
        },
        data: {
          label: "Fluentd/Logstash",
        },
      },
      {
        id: "n5",
        parentId: "r2",
        type: "search",
        position: {
          x: 250,
          y: 120,
        },
        data: {
          label: "Elasticsearch Cluster",
        },
      },
      {
        id: "n6",
        parentId: "r2",
        type: "grafana",
        position: {
          x: 450,
          y: 50,
        },
        data: {
          label: "Kibana Dashboard",
        },
      },
      {
        id: "n7",
        parentId: "r2",
        type: "prometheus",
        position: {
          x: 250,
          y: 250,
        },
        data: {
          label: "Prometheus Metrics",
        },
      },
      {
        id: "n8",
        parentId: "r2",
        type: "grafana",
        position: {
          x: 450,
          y: 250,
        },
        data: {
          label: "Grafana",
        },
      },
    ],
    edges: [
      {
        id: "e1",
        source: "n2",
        target: "n4",
        animated: true,
      },
      {
        id: "e2",
        source: "n3",
        target: "n4",
        animated: true,
      },
      {
        id: "e3",
        source: "n2",
        target: "n7",
        animated: true,
        style: {
          strokeDasharray: "5,5",
        },
      },
      {
        id: "e4",
        source: "n3",
        target: "n7",
        animated: true,
        style: {
          strokeDasharray: "5,5",
        },
      },
      {
        id: "e5",
        source: "n4",
        target: "n5",
        animated: true,
      },
      {
        id: "e6",
        source: "n5",
        target: "n6",
      },
      {
        id: "e7",
        source: "n7",
        target: "n8",
      },
    ],
  },
];
