# 1. Base Image
FROM node:20-alpine AS base

# 2. Dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 3. Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# We don't want local data to be part of the build
RUN rm -rf wa_session crm_data
RUN npm run build

# 4. Runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Automatically listen on 0.0.0.0
ENV PORT=3000

# Create necessary directories for persistence
RUN mkdir -p /app/storage/wa_session /app/storage/crm_data && chown -R node:node /app/storage

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/app/api ./app/api

EXPOSE 3000

CMD ["node", "server.js"]
