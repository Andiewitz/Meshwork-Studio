export interface TemplateDefinition {
  id: string;
  slug?: string;
  title: string;
  description: string;
  category: "Featured";
  stars?: string;
  nodes: any[];
  edges: any[];
}

export const PRELOADED_TEMPLATES: TemplateDefinition[] = [
  {
    id: "go",
    slug: "go",
    title: "go",
    description: "The Go programming language",
    category: "Featured",
    stars: "132.1k",
    nodes: [
      {
        id: "n1",
        type: "user",
        position: { x: -200, y: 250 },
        data: { label: "Clients" },
      },
      {
        id: "n2",
        type: "cdn",
        position: { x: 100, y: 50 },
        data: { label: "CDN" },
      },
      {
        id: "n3",
        type: "loadBalancer",
        position: { x: 300, y: 250 },
        data: { label: "Load Balancer" },
      },
      {
        id: "n4",
        type: "microservice",
        position: { x: 500, y: 150 },
        data: { label: "Go API" },
      },
      {
        id: "n5",
        type: "database",
        position: { x: 500, y: 350 },
        data: { label: "PostgreSQL", provider: "postgresql" },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n3" },
      { id: "e2", source: "n3", target: "n4" },
      { id: "e3", source: "n4", target: "n5" },
    ],
  },
  {
    id: "flutter",
    slug: "flutter",
    title: "flutter",
    description:
      "Flutter makes it easy and fast to build beautiful apps for mobile and beyond",
    category: "Featured",
    stars: "174.8k",
    nodes: [
      {
        id: "n1",
        type: "user",
        position: { x: -200, y: 250 },
        data: { label: "iOS / Android / Web" },
      },
      {
        id: "n2",
        type: "app",
        position: { x: 100, y: 200 },
        data: { label: "Flutter App" },
      },
      {
        id: "n3",
        type: "app",
        position: { x: 350, y: 200 },
        data: { label: "Firebase Hosting" },
      },
      {
        id: "n4",
        type: "gateway",
        position: { x: 350, y: 50 },
        data: { label: "API Gateway" },
      },
      {
        id: "n5",
        type: "database",
        position: { x: 350, y: 350 },
        data: { label: "Firestore", provider: "firebase" },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
      { id: "e4", source: "n4", target: "n5" },
    ],
  },
  {
    id: "kubernetes",
    slug: "kubernetes",
    title: "kubernetes",
    description: "Production-Grade Container Scheduling and Management",
    category: "Featured",
    stars: "120.1k",
    nodes: [
      {
        id: "n1",
        type: "user",
        position: { x: -200, y: 250 },
        data: { label: "Users" },
      },
      {
        id: "n2",
        type: "loadBalancer",
        position: { x: 0, y: 250 },
        data: { label: "External LB" },
      },
      {
        id: "n3",
        type: "k8s-namespace",
        position: { x: 200, y: 50 },
        width: 400,
        height: 500,
        data: { label: "production" },
      },
      {
        id: "n4",
        parentId: "n3",
        type: "k8s-service",
        position: { x: 50, y: 100 },
        data: { label: "API Gateway svc" },
      },
      {
        id: "n5",
        parentId: "n3",
        type: "k8s-pod",
        position: { x: 50, y: 300 },
        data: { label: "App Pod" },
      },
      {
        id: "n6",
        parentId: "n3",
        type: "k8s-pod",
        position: { x: 200, y: 300 },
        data: { label: "Worker Pod" },
      },
      {
        id: "n7",
        type: "database",
        position: { x: 700, y: 250 },
        data: { label: "PostgreSQL", provider: "postgresql" },
      },
      {
        id: "n8",
        type: "cache",
        position: { x: 700, y: 380 },
        data: { label: "Redis" },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n4" },
      { id: "e3", source: "n4", target: "n5" },
      { id: "e4", source: "n4", target: "n6" },
      { id: "e5", source: "n5", target: "n7" },
      { id: "e6", source: "n6", target: "n8" },
    ],
  },
  {
    id: "react",
    slug: "react",
    title: "react",
    description: "The library for web and native user interfaces.",
    category: "Featured",
    stars: "242.5k",
    nodes: [
      {
        id: "n1",
        type: "user",
        position: { x: -200, y: 300 },
        data: { label: "User" },
      },
      {
        id: "n2",
        type: "cdn",
        position: { x: -50, y: 100 },
        data: { label: "CDN" },
      },
      {
        id: "n3",
        type: "app",
        position: { x: 150, y: 200 },
        data: { label: "React SPA" },
      },
      {
        id: "n4",
        type: "microservice",
        position: { x: 350, y: 200 },
        data: { label: "Next.js API" },
      },
      {
        id: "n5",
        type: "database",
        position: { x: 550, y: 200 },
        data: { label: "PostgreSQL", provider: "postgresql" },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n3" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
      { id: "e4", source: "n4", target: "n5" },
    ],
  },
  {
    id: "python-sdk",
    slug: "python-sdk",
    title: "python-sdk",
    description:
      "The official Python SDK for Model Context Protocol servers and clients",
    category: "Featured",
    stars: "21.4k",
    nodes: [
      {
        id: "n1",
        type: "user",
        position: { x: -200, y: 250 },
        data: { label: "Client" },
      },
      {
        id: "n2",
        type: "worker",
        position: { x: 50, y: 200 },
        data: { label: "Python SDK" },
      },
      {
        id: "n3",
        type: "logic",
        position: { x: 250, y: 100 },
        data: { label: "MCP Server" },
      },
      {
        id: "n4",
        type: "database",
        position: { x: 250, y: 300 },
        data: { label: "Vector DB" },
      },
      {
        id: "n5",
        type: "cache",
        position: { x: 450, y: 200 },
        data: { label: "Redis" },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
      { id: "e4", source: "n3", target: "n5" },
    ],
  },
  {
    id: "opencalw",
    slug: "opencalw",
    title: "opencalw",
    description:
      "Your own personal AI assistant. Any OS. Any Platform. The lobster way. 🦞",
    category: "Featured",
    stars: "92.7k",
    nodes: [
      {
        id: "n1",
        type: "user",
        position: { x: -200, y: 250 },
        data: { label: "User" },
      },
      {
        id: "n2",
        type: "app",
        position: { x: 0, y: 200 },
        data: { label: "AI Chat UI" },
      },
      {
        id: "n3",
        type: "worker",
        position: { x: 200, y: 100 },
        data: { label: "AI Engine" },
      },
      {
        id: "n4",
        type: "cache",
        position: { x: 400, y: 200 },
        data: { label: "Memory" },
      },
      {
        id: "n5",
        type: "database",
        position: { x: 400, y: 350 },
        data: { label: "History" },
      },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
      { id: "e2", source: "n2", target: "n3" },
      { id: "e3", source: "n3", target: "n4" },
      { id: "e4", source: "n3", target: "n5" },
    ],
  },
];
