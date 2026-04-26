<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { Icon } from "@iconify/vue";
import { toast } from "vue3-toastify";

import LogTerminal from "../components/LogTerminal.vue";
import SkeletonRow from "../components/SkeletonRow.vue";
import { fetchProjects, subscribeToLogs } from "../lib/http/query";
import { deployProject } from "../lib/http/mutations";
import {
  timeAgo,
  projectColor,
  projectInitial,
  truncateUrl,
  extractErrorMessage,
} from "../lib/utils";
import ProjectModal from "../components/ProjectModal.vue";

/**
 * refs
 */
const gitUrl = ref("");
const port = ref("");
const buildLogs = ref<string[]>([]);
const buildStatus = ref("Idle");
const isBuilding = ref(false);
const selectedProject = ref<Project | null>(null);

/**
 * query client
 */
const queryClient = useQueryClient();

/**
 * query
 */
const { data: projectsResponse, isLoading } = useQuery({
  queryKey: ["projects"],
  queryFn: fetchProjects,
  refetchInterval: 10_000,
});

/**
 * computed
 */
const projects = computed(() => projectsResponse.value?.data?.items ?? []);

const GIT_URL_REGEX = /^(https?|git|ssh|rsync):\/\/\S+\.git$/i;
const trimmedGitUrl = computed(() => gitUrl.value.trim());
const trimmedPort = computed(() => port.value.trim());
const gitUrlError = computed(() => {
  if (!trimmedGitUrl.value) return null;
  if (!GIT_URL_REGEX.test(trimmedGitUrl.value)) {
    return "Enter a valid Git URL (e.g. https://github.com/org/repo.git)";
  }
  return null;
});
const parsedPort = computed(() => {
  if (!trimmedPort.value) return null;
  if (!/^\d+$/.test(trimmedPort.value)) return NaN;
  return Number(trimmedPort.value);
});
const portError = computed(() => {
  const value = parsedPort.value;
  if (value === null) return null;
  if (Number.isNaN(value) || value < 1 || value > 65535) {
    return "Port must be a number between 1 and 65535";
  }
  return null;
});
const canDeploy = computed(
  () =>
    !!trimmedGitUrl.value &&
    !gitUrlError.value &&
    !portError.value &&
    !isDeploying.value,
);

/**
 * mutation
 */
const { mutate: deploy, isPending: isDeploying } = useMutation({
  mutationFn: ({ url, port }: { url: string; port?: number }) =>
    deployProject(url, port),
  onMutate: () => {
    buildLogs.value = [];
    buildStatus.value = "Building...";
    isBuilding.value = true;
    stopLogs?.();
    stopLogs = null;
  },
  onSuccess: (res) => {
    const deploymentId = res.data.id;
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    stopLogs = subscribeToLogs(
      deploymentId,
      (msg) => buildLogs.value.push(msg),
      () => {
        buildStatus.value = "Complete";
        isBuilding.value = false;
      },
    );
  },
  onError: (error) => {
    toast.error(extractErrorMessage(error));
    buildStatus.value = "Failed";
    isBuilding.value = false;
  },
});

/**
 * methods
 */
let stopLogs: (() => void) | null = null;
const handleDeploy = () => {
  if (!canDeploy.value) return;
  const portValue = parsedPort.value;
  deploy({
    url: trimmedGitUrl.value,
    port:
      portValue !== null && !Number.isNaN(portValue) ? portValue : undefined,
  });
};
const handleShowProject = (project: Project) => {
  selectedProject.value = project;
};
const handleCloseProject = () => {
  selectedProject.value = null;
};

/**
 * life cycle
 */
onUnmounted(() => stopLogs?.());
</script>

<template>
  <!-- ── Header ── -->
  <header
    class="sticky top-0 z-50 border-b border-border bg-base/90 backdrop-blur-sm"
  >
    <div class="max-w-5xl mx-auto px-6 h-12 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Icon icon="mdi:rocket-launch" class="text-accent" :width="16" />
        <span class="text-sm font-bold text-primary tracking-tight">
          Brimble <span class="text-accent">Mini</span>
        </span>
      </div>

      <div class="flex items-center gap-4">
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
      </div>
    </div>
  </header>

  <!-- ── Main Content ── -->
  <main class="max-w-5xl mx-auto px-6 py-6 space-y-4 pb-10">
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

      <form class="flex flex-col gap-1.5" @submit.prevent="handleDeploy">
        <div class="flex gap-2">
          <div class="flex-1 relative">
            <Icon
              icon="mdi:git"
              class="absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle"
              :width="14"
            />
            <input
              v-model="gitUrl"
              type="url"
              placeholder="https://github.com/your-org/your-repo.git"
              :class="[
                'w-full bg-base border rounded pl-8 pr-3 py-2 text-sm font-mono text-primary placeholder-[#3f3f46] focus:outline-none transition-colors',
                gitUrlError
                  ? 'border-danger focus:border-danger'
                  : 'border-border focus:border-accent',
              ]"
              :aria-invalid="!!gitUrlError"
              aria-describedby="git-url-error"
            />
          </div>
          <div class="relative w-28">
            <Icon
              icon="mdi:lan-connect"
              class="absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle"
              :width="14"
            />
            <input
              v-model="port"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              placeholder="3000"
              :class="[
                'w-full bg-base border rounded pl-8 pr-3 py-2 text-sm font-mono text-primary placeholder-[#3f3f46] focus:outline-none transition-colors',
                portError
                  ? 'border-danger focus:border-danger'
                  : 'border-border focus:border-accent',
              ]"
              :aria-invalid="!!portError"
              aria-describedby="port-error"
            />
          </div>
          <button
            type="submit"
            :disabled="!canDeploy"
            class="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded transition-colors shadow-brutal-accent cursor-pointer"
          >
            <Icon
              :icon="isDeploying ? 'mdi:loading' : 'mdi:rocket-launch'"
              :width="14"
              :class="{ 'animate-spin': isDeploying }"
            />
            {{ isDeploying ? "Deploying…" : "Deploy" }}
          </button>
        </div>
        <p
          v-if="gitUrlError"
          id="git-url-error"
          class="flex items-center gap-1 text-[11px] text-danger font-mono"
        >
          <Icon icon="mdi:alert-circle-outline" :width="12" />
          {{ gitUrlError }}
        </p>
        <p
          v-if="portError"
          id="port-error"
          class="flex items-center gap-1 text-[11px] text-danger font-mono"
        >
          <Icon icon="mdi:alert-circle-outline" :width="12" />
          {{ portError }}
        </p>
      </form>
    </section>

    <!-- Live Logs Terminal -->
    <LogTerminal
      :logs="buildLogs"
      :status="buildStatus"
      :is-building="isBuilding"
    />

    <!-- Projects Table -->
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
            Projects
          </span>
        </div>
        <span class="text-[10px] font-mono text-subtle">
          {{ projects.length }} total
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
              Slug
            </th>
            <th
              class="text-left px-4 py-2 text-[10px] font-semibold text-subtle uppercase tracking-wider"
            >
              Git URL
            </th>
            <th
              class="text-left px-4 py-2 text-[10px] font-semibold text-subtle uppercase tracking-wider"
            >
              Created
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-if="isLoading">
            <SkeletonRow v-for="i in 4" :key="i" />
          </template>

          <template v-else-if="projects.length === 0">
            <tr>
              <td
                colspan="4"
                class="px-4 py-8 text-center text-[11px] text-muted"
              >
                No projects yet. Deploy one above.
              </td>
            </tr>
          </template>

          <template v-else>
            <tr
              v-for="project in projects"
              :key="project.id"
              class="border-b border-elevated last:border-0 hover:bg-surface transition-colors cursor-pointer"
              @click="() => handleShowProject(project)"
            >
              <td class="px-4 py-2.5">
                <div class="flex items-center gap-2.5">
                  <div
                    class="w-6 h-6 rounded flex items-center justify-center text-[11px] font-bold shrink-0"
                    :style="{
                      backgroundColor: projectColor(project.name) + '1a',
                      border: `1px solid ${projectColor(project.name)}33`,
                      color: projectColor(project.name),
                    }"
                  >
                    {{ projectInitial(project.name) }}
                  </div>
                  <span class="text-xs font-medium text-primary">
                    {{ project.name }}
                  </span>
                </div>
              </td>

              <td class="px-4 py-2.5">
                <span class="font-mono text-[11px] text-muted">
                  {{ project.slug }}
                </span>
              </td>

              <td class="px-4 py-2.5">
                <a
                  :href="project.gitUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 text-[11px] text-accent hover:text-accent-hover transition-colors font-mono"
                >
                  {{ truncateUrl(project.gitUrl) }}
                  <Icon icon="mdi:open-in-new" :width="10" />
                </a>
              </td>

              <td class="px-4 py-2.5">
                <span class="text-[11px] text-muted">
                  {{ timeAgo(project.createdAt) }}
                </span>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </section>
  </main>

  <!-- ── Footer ── -->
  <footer class="border-t border-border mt-8 fixed bottom-0 left-0 right-0">
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
        Brimble Mini © {{ new Date().getFullYear() }}
      </span>
    </div>
  </footer>

  <!-- ---- project modal ---  -->
  <ProjectModal
    v-if="selectedProject"
    :project="selectedProject"
    @close="handleCloseProject"
  />
</template>
