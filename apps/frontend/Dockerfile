# Multi-stage build for production
FROM node:20-alpine AS builder

WORKDIR /workspace

# Copy package files
COPY package.json package-lock.json* ./
COPY apps/frontend/package.json apps/frontend/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

WORKDIR /workspace/apps/frontend

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install wget for healthcheck
RUN apk add --no-cache wget

WORKDIR /app

# Copy package files
COPY apps/frontend/package.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application
COPY --from=builder /workspace/apps/frontend/.next ./.next
COPY --from=builder /workspace/apps/frontend/public ./public
COPY --from=builder /workspace/apps/frontend/next.config.js ./

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

# Start the application
CMD ["npm", "start"]
