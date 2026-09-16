# syntax=docker/dockerfile:1
# Build from source so CI never depends on a developer's dist/ or node_modules.
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY client/package.json ./client/package.json
COPY server/services/ai/package.json ./server/services/ai/package.json
COPY server/services/canvas/package.json ./server/services/canvas/package.json
COPY server/services/metrics/package.json ./server/services/metrics/package.json
COPY server/services/team/package.json ./server/services/team/package.json
COPY server/services/workspace/package.json ./server/services/workspace/package.json
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json .npmrc ./
COPY client/package.json ./client/package.json
COPY server/services/ai/package.json ./server/services/ai/package.json
COPY server/services/canvas/package.json ./server/services/canvas/package.json
COPY server/services/metrics/package.json ./server/services/metrics/package.json
COPY server/services/team/package.json ./server/services/team/package.json
COPY server/services/workspace/package.json ./server/services/workspace/package.json
RUN npm ci --omit=dev --ignore-scripts

COPY --from=build /app/dist ./dist
USER node
EXPOSE 5000
CMD ["node", "dist/index.cjs"]

FROM nginx:1.27-alpine AS frontend
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/public /usr/share/nginx/html
EXPOSE 80
