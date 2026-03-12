# Multi-stage build for production
FROM node:20-alpine AS builder

WORKDIR /workspace

# Copy package files
COPY package.json package-lock.json* ./
COPY apps/backend/package.json apps/backend/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma Client
WORKDIR /workspace/apps/backend
RUN npx prisma generate

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install wget for healthcheck
RUN apk add --no-cache wget

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY apps/backend/package.json apps/backend/

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy built application and Prisma files
COPY --from=builder /workspace/apps/backend/dist ./dist
COPY --from=builder /workspace/apps/backend/prisma ./prisma
COPY --from=builder /workspace/apps/backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /workspace/node_modules/.prisma ./node_modules/.prisma

WORKDIR /app/apps/backend

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:10000/api/health || exit 1

CMD ["node", "dist/main.js"]
