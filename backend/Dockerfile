# --- STAGE 1: The "base" with all dependencies ---
FROM node:24-slim AS base
# Install System Dependencies for Deb
RUN apt-get update && apt-get install -y \
    ca-certificates \
    git \
    curl \
    bash \
    gnupg \
    openssh-client \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg \
        -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
        > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

# Install Railpack
RUN curl -fsSL https://railpack.com/install.sh | bash -s -- --yes \
    && railpack --version

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
RUN railpack --version
RUN pnpm build

# --- STAGE 4: The "runner" stage (Production) ---
FROM node:24-slim AS runner
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y \
    ca-certificates \
    git \
    curl \
    bash \
    gnupg \
    openssh-client \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg \
        -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
        > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://railpack.com/install.sh | bash -s -- --yes \
    && railpack --version
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 8000
CMD ["node", "dist/index.js"]
