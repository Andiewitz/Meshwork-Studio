#!/bin/bash
# Provisioned ONCE on first boot of the meshwork-postgres volume.
# Creates one database + one scoped user per service. A service's password
# opens exactly its own database — that credential boundary IS the isolation.
set -euo pipefail

: "${AUTH_DB_PASSWORD:?AUTH_DB_PASSWORD required}"
: "${WORKSPACE_DB_PASSWORD:?WORKSPACE_DB_PASSWORD required}"
: "${TEAM_DB_PASSWORD:?TEAM_DB_PASSWORD required}"
: "${AI_DB_PASSWORD:?AI_DB_PASSWORD required}"
: "${JENKOS_DB_PASSWORD:=${AI_DB_PASSWORD}}"
: "${METRICS_DB_PASSWORD:?METRICS_DB_PASSWORD required}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<EOSQL
-- Auth (owned by the Go identity service)
CREATE USER auth_app WITH PASSWORD '${AUTH_DB_PASSWORD}';
CREATE DATABASE auth_db OWNER auth_app;

-- Node domain services (one database each)
CREATE USER workspace_app WITH PASSWORD '${WORKSPACE_DB_PASSWORD}';
CREATE DATABASE workspace_db OWNER workspace_app;

CREATE USER team_app WITH PASSWORD '${TEAM_DB_PASSWORD}';
CREATE DATABASE team_db OWNER team_app;

CREATE USER ai_app WITH PASSWORD '${AI_DB_PASSWORD}';
CREATE DATABASE ai_db OWNER ai_app;

-- Jenkos AI / Memory service database
CREATE USER jenkos_app WITH PASSWORD '${JENKOS_DB_PASSWORD}';
CREATE DATABASE jenkos_db OWNER jenkos_app;

CREATE USER metrics_app WITH PASSWORD '${METRICS_DB_PASSWORD}';
CREATE DATABASE metrics_db OWNER metrics_app;
EOSQL

echo "[init] databases + scoped users created"
