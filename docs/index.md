# Meshwork Studio Documentation

Welcome to the Meshwork Studio developer documentation. This directory contains detailed guides on the architecture, infrastructure, security, and internal workings of the application.

## Core Architecture

- [**Canvas Schema**](./CANVAS_SCHEMA.md) - Documentation on the ReactFlow node and edge structures.
- [**The Engine**](./ENGINE.md) - Details on the internal drawing engine and canvas state management.
- [**Mosh AI**](./MOSH_AI.md) - The embedded AI architecture co-pilot and Bring Your Own Key (BYOK) mechanics.
- [**Workspaces**](./WORKSPACES.md) - The workspace and real-time collaboration module.

## Infrastructure & Operations

- [**Infrastructure & Deployment**](./INFRASTRUCTURE.md) - AWS EC2 deployment guide, NGINX architecture, and Backup procedures.
- [**Persistence**](./PERSISTENCE.md) - Documentation on PostgreSQL, Drizzle ORM, and database storage mechanisms.

## Security & Quality Assurance

- [**Security**](./SECURITY.md) - Overview of the authentication, RBAC, and threat-prevention models used in the application.
- [**Testing**](./TESTING.md) - Guidelines for the unit, integration, and end-to-end test suites.
- [**Audit Report**](./AUDIT_REPORT.md) - The latest security, DB, and UX audit findings.
- [**Post Mortem**](./post-mortem.md) - Historical incident reports.

## UX & Design

- [**Theming**](./THEMING.md) - TailwindCSS configuration, CSS variables, and the dynamic theme system.
- [**Settings**](./SETTINGS.md) - User preferences and account settings architecture.
