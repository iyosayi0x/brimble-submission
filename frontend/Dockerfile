# --- STAGE 1: The "base" with all dependencies ---
FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- STAGE 2: The "dev" stage ---
FROM base AS dev
COPY . .
CMD ["pnpm", "dev", "--host", "0.0.0.0"]


# --- STAGE 3: The "builder" stage for production ---
FROM base AS builder
# VITE_BASE_URL is baked into the bundle at build time; the runtime
# nginx image has no JS-visible env, so we expose it as an ARG/ENV
# pair before `pnpm build` runs.
ARG VITE_BASE_URL
ENV VITE_BASE_URL=${VITE_BASE_URL}
COPY . .
RUN pnpm build

# --- STAGE 4: The "runner" stage (Production) ---
FROM nginx:stable-alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=builder /app/nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
