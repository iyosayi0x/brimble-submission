<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { Icon } from "@iconify/vue";
import LogTerminal from "../components/LogTerminal.vue";
import StatusBadge from "../components/StatusBadge.vue";
import SkeletonRow from "../components/SkeletonRow.vue";

type DeploymentStatus = "RUNNING" | "BUILDING" | "FAILED" | "IDLE";

interface Deployment {
  id: number;
  project: string;
  status: DeploymentStatus;
  imageTag: string;
  url: string;
  ago: string;
}

const MOCK_DEPLOYMENTS: Deployment[] = [
  {
    id: 1,
    project: "web-frontend",
    status: "RUNNING",
    imageTag: "sha256:a1b2c3d4e5f6",
    url: "frontend.brimble.app",
    ago: "2 min ago",
  },
  {
    id: 2,
    project: "api-service",
    status: "BUILDING",
    imageTag: "sha256:e4f5a9b1c2d3",
    url: "api.brimble.app",
    ago: "5 min ago",
  },
  {
    id: 3,
    project: "blog-platform",
    status: "FAILED",
    imageTag: "sha256:c7d8e2f3a4b5",
    url: "blog.brimble.app",
    ago: "12 min ago",
  },
  {
    id: 4,
    project: "worker-queue",
    status: "RUNNING",
    imageTag: "sha256:g9h0i1j2k3l4",
    url: "worker.brimble.app",
    ago: "1 hr ago",
  },
  {
    id: 5,
    project: "auth-gateway",
    status: "IDLE",
    imageTag: "sha256:m5n6o7p8q9r0",
    url: "auth.brimble.app",
    ago: "3 hr ago",
  },
];

const { data: deployments, isLoading } = useQuery({
  queryKey: ["deployments"],
  queryFn: async (): Promise<Deployment[]> => {
    await new Promise((r) => setTimeout(r, 1500));
    return MOCK_DEPLOYMENTS;
  },
});

const gitUrl = ref("");
const isDeploying = ref(false);
const buildLogs = ref<string[]>([]);
const buildStatus = ref("Idle");
const isBuilding = ref(false);

const LOG_LINES = [
  "Step 1/5: Cloning repository...",
  "Step 1/5: Clone complete (0.8s)",
  "Step 2/5: Detecting stack with Railpack...",
  "Step 2/5: Detected Node.js 20 + Vite",
  "Step 3/5: Installing dependencies (pnpm install)...",
  "Step 3/5: 247 packages installed (8.2s)",
  "Step 4/5: Building application (vite build)...",
  "Step 4/5: Build complete → dist/ (12.4s)",
  "Step 5/5: Pushing Docker image to registry...",
  "Step 5/5: Image pushed sha256:a1b2c3d4 (4.1s)",
  "✓ Deployment complete. Live at https://app.brimble.io",
];

let logTimer: number | null = null;

const handleDeploy = () => {
  if (!gitUrl.value.trim() || isDeploying.value) return;

  isDeploying.value = true;
  isBuilding.value = true;
  buildStatus.value = "Building...";
  buildLogs.value = [];

  let idx = 0;
  logTimer = window.setInterval(() => {
    if (idx < LOG_LINES.length) {
      buildLogs.value.push(LOG_LINES[idx]);
      idx++;
    } else {
      if (logTimer !== null) clearInterval(logTimer);
      logTimer = null;
      buildStatus.value = "Complete";
      isBuilding.value = false;
      isDeploying.value = false;
    }
  }, 700);
};

onUnmounted(() => {
  if (logTimer !== null) clearInterval(logTimer);
});

const PROJECT_COLORS = [
  "#6b7cff",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#06b6d4",
  "#ec4899",
];

const projectColor = (name: string): string =>
  PROJECT_COLORS[name.charCodeAt(0) % PROJECT_COLORS.length];

const projectInitial = (name: string): string => name[0].toUpperCase();

const truncateTag = (tag: string): string =>
  tag.startsWith("sha256:") ? `sha256:${tag.slice(7, 14)}` : tag;
</script>

<template>
  <!-- ── Header ── -->
  <header
    class="sticky top-0 z-50 border-b border-border bg-base/90 backdrop-blur-sm"
  >
    <div class="max-w-5xl mx-auto px-6 h-12 flex items-center justify-between">
      <!-- Logo -->
      <div class="flex items-center gap-2">
        <Icon icon="mdi:rocket-launch" class="text-accent" :width="16" />
        <span class="text-sm font-bold text-primary tracking-tight">
          Brimble
          <span class="text-accent">Mini</span>
        </span>
      </div>

      <!-- Right controls -->
      <div class="flex items-center gap-4">
        <!-- System Status -->
        <div class="flex items-center gap-1.5">
          <span class="relative flex h-1.5 w-1.5">
            <span
              class="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"
            />
            <span
              class="relative inline-flex rounded-full h-1.5 w-1.5 bg-success"
            />
          </span>
          <span class="text-[11px] text-muted">All Systems Operational</span>
        </div>

        <div class="w-px h-3.5 bg-border" />

        <!-- Talk to Founder -->
        <button
          class="flex items-center gap-1.5 text-[11px] font-medium text-primary bg-surface border border-border hover:border-[#6b7cff] hover:text-accent px-3 py-1.5 rounded transition-colors cursor-pointer"
        >
          <Icon icon="mdi:chat-processing-outline" :width="13" />
          Talk to Founder
        </button>
      </div>
    </div>
  </header>

  <!-- ── Main Content ── -->
  <main class="max-w-5xl mx-auto px-6 py-6 space-y-4">
    <!-- Deploy Card -->
    <section class="border border-border rounded bg-surface p-4 shadow-brutal">
      <div class="flex items-center gap-2 mb-3">
        <Icon icon="mdi:source-branch" class="text-accent" :width="13" />
        <h2
          class="text-[11px] font-semibold text-subtle uppercase tracking-widest"
        >
          Deployment
        </h2>
      </div>

      <form class="flex gap-2" @submit.prevent="handleDeploy">
        <div class="flex-1 relative">
          <Icon
            icon="mdi:git"
            class="absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle"
            :width="14"
          />
          <input
            v-model="gitUrl"
            type="url"
            placeholder="https://github.com/your-org/your-repo"
            class="w-full bg-base border border-border rounded pl-8 pr-3 py-2 text-sm font-mono text-primary placeholder-[#3f3f46] focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <button
          type="submit"
          :disabled="isDeploying || !gitUrl.trim()"
          class="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded transition-colors shadow-brutal-accent cursor-pointer"
        >
          <Icon
            :icon="isDeploying ? 'mdi:loading' : 'mdi:rocket-launch'"
            :width="14"
            :class="{ 'animate-spin': isDeploying }"
          />
          {{ isDeploying ? "Deploying…" : "Deploy" }}
        </button>
      </form>

      <p class="mt-2 text-[11px] text-[#52525c]">
        Supports
        <span class="text-muted">Vite</span>,
        <span class="text-muted">Go</span>, and
        <span class="text-muted">TypeScript</span> via
        <span class="text-accent font-medium">Railpack</span>.
      </p>
    </section>

    <!-- Live Logs Terminal -->
    <LogTerminal
      :logs="buildLogs"
      :status="buildStatus"
      :is-building="isBuilding"
    />

    <!-- Deployments Table -->
    <section
      class="border border-border rounded bg-surface overflow-hidden shadow-brutal"
    >
      <div
        class="flex items-center justify-between px-4 py-2.5 border-b border-border"
      >
        <div class="flex items-center gap-2">
          <Icon icon="mdi:layers-outline" class="text-muted" :width="13" />
          <span
            class="text-[11px] font-semibold text-subtle uppercase tracking-widest"
          >
            Deployments
          </span>
        </div>
        <span class="text-[10px] font-mono text-subtle">
          {{ deployments?.length ?? 0 }} total
        </span>
      </div>

      <table class="w-full">
        <thead>
          <tr class="border-b border-border">
            <th
              class="text-left px-4 py-2 text-[10px] font-semibold text-subtle uppercase tracking-wider"
            >
              Project
            </th>
            <th
              class="text-left px-4 py-2 text-[10px] font-semibold text-subtle uppercase tracking-wider"
            >
              Status
            </th>
            <th
              class="text-left px-4 py-2 text-[10px] font-semibold text-subtle uppercase tracking-wider"
            >
              Image Tag
            </th>
            <th
              class="text-left px-4 py-2 text-[10px] font-semibold text-subtle uppercase tracking-wider"
            >
              URL
            </th>
          </tr>
        </thead>
        <tbody>
          <!-- Skeleton while loading -->
          <template v-if="isLoading">
            <SkeletonRow v-for="i in 4" :key="i" />
          </template>

          <!-- Data rows -->
          <template v-else>
            <tr
              v-for="dep in deployments"
              :key="dep.id"
              class="border-b border-elevated last:border-0 hover:bg-surface transition-colors"
            >
              <td class="px-4 py-2.5">
                <div class="flex items-center gap-2.5">
                  <div
                    class="w-6 h-6 rounded flex items-center justify-center text-[11px] font-bold shrink-0"
                    :style="{
                      backgroundColor: projectColor(dep.project) + '1a',
                      border: `1px solid ${projectColor(dep.project)}33`,
                      color: projectColor(dep.project),
                    }"
                  >
                    {{ projectInitial(dep.project) }}
                  </div>
                  <div>
                    <div class="text-xs font-medium text-primary">
                      {{ dep.project }}
                    </div>
                    <div class="text-[10px] text-[#52525c]">{{ dep.ago }}</div>
                  </div>
                </div>
              </td>

              <td class="px-4 py-2.5">
                <StatusBadge :status="dep.status" />
              </td>

              <td class="px-4 py-2.5">
                <span class="font-mono text-[11px] text-muted">
                  {{ truncateTag(dep.imageTag) }}
                </span>
              </td>

              <td class="px-4 py-2.5">
                <a
                  :href="`https://${dep.url}`"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 text-[11px] text-accent hover:text-accent-hover transition-colors font-mono"
                >
                  {{ dep.url }}
                  <Icon icon="mdi:open-in-new" :width="10" />
                </a>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </section>
  </main>

  <!-- ── Footer — Pipeline Health ── -->
  <footer class="border-t border-border mt-8">
    <div
      class="max-w-5xl mx-auto px-6 py-3.5 flex items-center justify-between"
    >
      <div class="flex items-center gap-1.5">
        <Icon icon="mdi:pulse" class="text-subtle" :width="12" />
        <span
          class="text-[10px] text-subtle uppercase tracking-widest font-semibold"
        >
          Pipeline Health
        </span>
      </div>

      <div class="flex items-center gap-5">
        <div class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-success" />
          <Icon
            icon="mdi:package-variant-closed"
            class="text-muted"
            :width="13"
          />
          <span class="text-[11px] text-muted">Railpack</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-success" />
          <Icon icon="mdi:docker" class="text-muted" :width="13" />
          <span class="text-[11px] text-muted">Docker</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-success" />
          <Icon icon="mdi:shield-check" class="text-muted" :width="13" />
          <span class="text-[11px] text-muted">Caddy</span>
        </div>
      </div>

      <span class="text-[10px] text-subtle font-mono">
        Brimble Mini © 2025
      </span>
    </div>
  </footer>
</template>
