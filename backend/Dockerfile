# --- STAGE 1: The "base" with all dependencies ---
FROM node:24-slim AS base
WORKDIR /app 
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- STAGE 2: The "dev" stage ---
FROM base AS dev
COPY . .
CMD ["pnpm", "dev"]

# --- STAGE 3: The "builder" stage for production ---
FROM base AS builder
COPY . .
RUN pnpm build

# --- STAGE 4: The "runner" stage (Production) ---
FROM node:24-slim AS runner
ENV NODE_ENV=production
WORKDIR /app 
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
USER node
EXPOSE 8000 
CMD ["node", "dist/index.js"]