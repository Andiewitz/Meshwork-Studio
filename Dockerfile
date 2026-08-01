FROM node:25-alpine

RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy package configurations
COPY package*.json ./

# Copy pre-installed node_modules and built dist from host
COPY node_modules ./node_modules
COPY dist ./dist
COPY drizzle.config.ts ./
COPY shared ./shared

# Set environment variables
ENV NODE_ENV=production

# Push schema then start app
CMD ["sh", "-c", "npx drizzle-kit push && node dist/index.cjs"]

