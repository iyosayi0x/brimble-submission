# --- STAGE 1: The "base" with all dependencies ---
FROM node:24-slim AS base
# Install System Dependencies for Deb
RUN apt-get update && apt-get install -y \
    docker.io \
    git \
    curl \
    bash \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Install Railpack
RUN curl -fsSL https://railpack.io/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

# application install
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- STAGE 2: The "dev" stage ---
FROM base AS dev
COPY . .
CMD pnpm db:push && pnpm dev

# --- STAGE 3: The "builder" stage for production ---
FROM base AS builder
COPY . .
RUN pnpm build

# --- STAGE 4: The "runner" stage (Production) ---
FROM node:24-slim AS runner
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y \
    docker.io \
    git \
    curl \
    bash \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://railpack.io/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 8000
CMD ["node", "dist/index.js"]
