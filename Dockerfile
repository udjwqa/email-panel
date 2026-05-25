# Stage 1: Build
FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma/
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# Stage 2: Production
FROM node:24-alpine

WORKDIR /app

RUN apk add --no-cache dumb-init

COPY --from=builder /app/dist ./dist/
COPY --from=builder /app/node_modules ./node_modules/
COPY --from=builder /app/prisma ./prisma/
COPY --from=builder /app/package.json ./
COPY scripts/docker-entrypoint.sh ./scripts/

USER node

EXPOSE 3000

ENTRYPOINT ["sh", "scripts/docker-entrypoint.sh"]
