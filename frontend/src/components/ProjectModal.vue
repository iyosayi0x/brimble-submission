<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { Icon } from "@iconify/vue";
import { toast } from "vue3-toastify";

import StatusBadge from "./StatusBadge.vue";
import LogTerminal from "./LogTerminal.vue";
import { fetchDeploymentVersions, subscribeToLogs } from "../lib/http/query";
import {
  deleteDeployment,
  deleteProject,
  rollbackDeployment,
} from "../lib/http/mutations";
import {
  timeAgo,
  projectColor,
  projectInitial,
  extractErrorMessage,
} from "../lib/utils";

const props = defineProps<{ project: Project }>();
const emit = defineEmits<{ close: [] }>();

const queryClient = useQueryClient();
const pendingDeploymentId = ref<string | null>(null);

const logsDeployment = ref<Deployment | null>(null);
const logLines = ref<string[]>([]);
const logStatus = ref("Idle");
const isStreamingLogs = ref(false);

/**
 * Owns the active SSE subscription. Closures from `subscribeToLogs` are
 * stored here so any of `startLogStream`, `stopLogStream`, or the unmount
 * hook can tear it down without each one tracking its own state.
 */
let closeLogStream: (() => void) | null = null;

const stopLogStream = () => {
  closeLogStream?.();
  closeLogStream = null;
  isStreamingLogs.value = false;
};

const appendLogChunk = (chunk: string) => {
  // History replays arrive as one multi-line blob; split so per-line
  // coloring in LogTerminal still applies.
  for (const line of chunk.split("\n")) {
    if (line.length > 0) logLines.value.push(line);
  }
};

const startLogStream = (deployment: Deployment) => {
  stopLogStream();
  logLines.value = [];
  logsDeployment.value = deployment;
  logStatus.value = "Streaming";
  isStreamingLogs.value = true;
  closeLogStream = subscribeToLogs(
    deployment.id,
    appendLogChunk,
    () => {
      logStatus.value = "Disconnected";
      isStreamingLogs.value = false;
      closeLogStream = null;
    },
  );
};

/**
 * query
 */
const { data: deploymentsResponse, isLoading } = useQuery({
  queryKey: ["deployments", props.project.id],
  queryFn: () => fetchDeploymentVersions(props.project.id),
  refetchInterval: 5_000,
});

/**
 * computed
 */
const deployments = computed(() => {
  const items = deploymentsResponse.value?.data?.items ?? [];
  return [...items].sort((a, b) => b.versionNumber - a.versionNumber);
});

const activeDeploymentId = computed(() => {
  const running = deployments.value.filter((d) => d.status === "RUNNING");
  return running[0]?.id ?? null;
});

/**
 * mutations
 */
const invalidateDeployments = () => {
  queryClient.invalidateQueries({
    queryKey: ["deployments", props.project.id],
  });
};

const { mutate: rollbackMutation } = useMutation({
  mutationFn: (deploymentId: string) => rollbackDeployment(deploymentId),
  onSuccess: (res) => {
    toast.success(res.message ?? "Rolled back");
    invalidateDeployments();
  },
  onError: (err) => toast.error(extractErrorMessage(err)),
  onSettled: () => {
    pendingDeploymentId.value = null;
  },
});

const { mutate: deleteMutation } = useMutation({
  mutationFn: (deploymentId: string) => deleteDeployment(deploymentId),
  onSuccess: () => {
    toast.success("Deployment deleted");
    invalidateDeployments();
  },
  onError: (err) => toast.error(extractErrorMessage(err)),
  onSettled: () => {
    pendingDeploymentId.value = null;
  },
});

const { mutate: deleteProjectMutation, isPending: isDeletePending } =
  useMutation({
    mutationFn: (projectId: string) => deleteProject(projectId),
    onSuccess: () => {
      toast.success("Project deleted");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      emit("close");
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

/**
 * methods
 */
const isActive = (deployment: Deployment) =>
  deployment.id === activeDeploymentId.value;

const isPending = (deployment: Deployment) =>
  deployment.id === pendingDeploymentId.value;

const canRollback = (deployment: Deployment) =>
  !isActive(deployment) &&
  deployment.status === "RUNNING" &&
  !pendingDeploymentId.value;

const canDelete = (deployment: Deployment) =>
  !pendingDeploymentId.value && !isPending(deployment);

const handleRollback = (deployment: Deployment) => {
  if (!canRollback(deployment)) return;
  pendingDeploymentId.value = deployment.id;
  rollbackMutation(deployment.id);
};

const handleDeleteProject = () => {
  if (isDeletePending.value) return;
  const message = `Delete project "${props.project.name}"? This stops every deployment, removes built images, and tears down the public route.`;
  if (!window.confirm(message)) return;
  deleteProjectMutation(props.project.id);
};

const handleViewLogs = (deployment: Deployment) => startLogStream(deployment);

const handleCloseLogs = () => {
  stopLogStream();
  logsDeployment.value = null;
  logLines.value = [];
  logStatus.value = "Idle";
};

const handleDeleteDeployment = (deployment: Deployment) => {
  if (!canDelete(deployment)) return;
  const message = isActive(deployment)
    ? `Delete the active deployment v${deployment.versionNumber}? This will take the site offline unless an older deployment is still running.`
    : `Delete deployment v${deployment.versionNumber}?`;
  if (!window.confirm(message)) return;
  pendingDeploymentId.value = deployment.id;
  deleteMutation(deployment.id);
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === "Escape") emit("close");
};

/**
 * life cycle
 */
onMounted(() => window.addEventListener("keydown", handleKeydown));
onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
  stopLogStream();
});
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-100 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      @click.self="emit('close')"
    >
      <div
        class="w-full max-w-3xl border border-border rounded bg-surface shadow-brutal overflow-hidden"
      >
        <!-- Header -->
        <div
          class="flex items-center justify-between px-4 py-3 border-b border-border"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-8 h-8 rounded flex items-center justify-center text-sm font-bold shrink-0"
              :style="{
                backgroundColor: projectColor(project.name) + '1a',
                border: `1px solid ${projectColor(project.name)}33`,
                color: projectColor(project.name),
              }"
            >
              {{ projectInitial(project.name) }}
            </div>
            <div>
              <div class="text-sm font-semibold text-primary">
                {{ project.name }}
              </div>
              <div class="font-mono text-[11px] text-muted">
                {{ project.slug }}
              </div>
            </div>
          </div>

          <div class="flex flex-row items-center">
            <button
              class="flex items-center justify-center w-7 h-7 rounded text-muted hover:text-primary hover:bg-elevated transition-colors cursor-pointer"
              aria-label="Close"
              @click="emit('close')"
            >
              <Icon icon="mdi:close" :width="16" />
            </button>

            <button
              :disabled="isDeletePending"
              class="w-full text-left px-3 py-1.5 text-[11px] font-medium flex items-center gap-2 text-danger hover:bg-danger/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors cursor-pointer"
              @click="handleDeleteProject"
            >
              <Icon
                :icon="isDeletePending ? 'mdi:loading' : 'mdi:delete-outline'"
                :width="13"
                :class="{ 'animate-spin': isDeletePending }"
              />
              Delete Project
            </button>
          </div>
        </div>

        <!-- Sub-header -->
        <div
          class="flex items-center justify-between px-4 py-2.5 border-b border-border bg-base/40"
        >
          <div class="flex items-center gap-2">
            <Icon
              :icon="logsDeployment ? 'mdi:console-line' : 'mdi:history'"
              class="text-muted"
              :width="13"
            />
            <span
              class="text-[11px] font-semibold text-subtle uppercase tracking-widest"
            >
              <template v-if="logsDeployment">
                Logs · v{{ logsDeployment.versionNumber }}
              </template>
              <template v-else>Deployment Versions</template>
            </span>
          </div>
          <button
            v-if="logsDeployment"
            class="flex items-center gap-1 text-[10px] font-mono text-muted hover:text-primary transition-colors cursor-pointer"
            @click="handleCloseLogs"
          >
            <Icon icon="mdi:arrow-left" :width="12" />
            Back to versions
          </button>
          <span v-else class="text-[10px] font-mono text-subtle">
            {{ deployments.length }} total
          </span>
        </div>

        <!-- Logs view -->
        <div v-if="logsDeployment" class="p-3">
          <LogTerminal
            :logs="logLines"
            :status="logStatus"
            :is-building="isStreamingLogs"
          />
        </div>

        <!-- Table -->
        <div v-else class="max-h-[60vh] overflow-y-auto">
          <table class="w-full">
            <thead class="sticky top-0 bg-surface">
              <tr class="border-b border-border">
                <th
                  class="text-left px-4 py-2 text-[10px] font-semibold text-subtle uppercase tracking-wider"
                >
                  Version
                </th>
                <th
                  class="text-left px-4 py-2 text-[10px] font-semibold text-subtle uppercase tracking-wider"
                >
                  Status
                </th>
                <th
                  class="text-left px-4 py-2 text-[10px] font-semibold text-subtle uppercase tracking-wider"
                >
                  URL
                </th>
                <th
                  class="text-left px-4 py-2 text-[10px] font-semibold text-subtle uppercase tracking-wider"
                >
                  Created
                </th>
                <th
                  class="text-right px-4 py-2 text-[10px] font-semibold text-subtle uppercase tracking-wider"
                >
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="isLoading">
                <td
                  colspan="5"
                  class="px-4 py-8 text-center text-[11px] text-muted"
                >
                  <Icon
                    icon="mdi:loading"
                    class="inline-block animate-spin mr-1"
                    :width="14"
                  />
                  Loading deployments…
                </td>
              </tr>

              <tr v-else-if="deployments.length === 0">
                <td
                  colspan="5"
                  class="px-4 py-8 text-center text-[11px] text-muted"
                >
                  No deployments for this project yet.
                </td>
              </tr>

              <tr
                v-for="deployment in deployments"
                v-else
                :key="deployment.id"
                class="border-b border-elevated last:border-0 hover:bg-base/30 transition-colors"
              >
                <td class="px-4 py-2.5">
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-xs font-semibold text-primary">
                      v{{ deployment.versionNumber }}
                    </span>
                    <span
                      v-if="isActive(deployment)"
                      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium font-mono tracking-wide text-[#22c55e] bg-[#052e16] border border-[#166534]"
                    >
                      <span class="relative flex h-1.5 w-1.5">
                        <span
                          class="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"
                        />
                        <span
                          class="relative inline-flex rounded-full h-1.5 w-1.5 bg-success"
                        />
                      </span>
                      Active
                    </span>
                  </div>
                </td>

                <td class="px-4 py-2.5">
                  <StatusBadge :status="deployment.status" />
                </td>

                <td class="px-4 py-2.5">
                  <a
                    v-if="deployment.url"
                    :href="deployment.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 text-[11px] text-accent hover:text-accent-hover transition-colors font-mono"
                  >
                    {{ deployment.url.replace(/^https?:\/\//, "") }}
                    <Icon icon="mdi:open-in-new" :width="10" />
                  </a>
                  <span v-else class="text-[11px] text-subtle font-mono"
                    >—</span
                  >
                </td>

                <td class="px-4 py-2.5">
                  <span class="text-[11px] text-muted">
                    {{ timeAgo(deployment.createdAt) }}
                  </span>
                </td>

                <td class="px-4 py-2.5 text-right">
                  <div
                    class="inline-flex justify-end relative group outline-none"
                    tabindex="0"
                    role="button"
                    aria-label="options"
                  >
                    <span
                      class="flex items-center justify-center w-7 h-7 rounded text-muted hover:text-primary hover:bg-elevated group-focus-within:text-primary group-focus-within:bg-elevated transition-colors cursor-pointer"
                    >
                      <Icon icon="iwwa:option" :width="16" />
                    </span>

                    <!-- ---- options ---  -->
                    <div
                      class="absolute right-0 top-full mt-1 hidden group-focus-within:block z-20 min-w-[140px] bg-surface border border-border rounded shadow-brutal overflow-hidden py-1"
                    >
                      <button
                        class="w-full text-left px-3 py-1.5 text-[11px] font-medium flex items-center gap-2 text-primary hover:bg-elevated transition-colors cursor-pointer"
                        @click="handleViewLogs(deployment)"
                      >
                        <Icon
                          icon="mdi:console-line"
                          :width="13"
                          class="text-muted"
                        />
                        View Logs
                      </button>

                      <div class="h-px bg-border my-1" />

                      <button
                        :disabled="!canRollback(deployment)"
                        class="w-full text-left px-3 py-1.5 text-[11px] font-medium flex items-center gap-2 text-primary hover:bg-elevated disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors cursor-pointer"
                        @click="handleRollback(deployment)"
                      >
                        <Icon
                          :icon="
                            isPending(deployment)
                              ? 'mdi:loading'
                              : 'mdi:backup-restore'
                          "
                          :width="13"
                          class="text-muted"
                          :class="{ 'animate-spin': isPending(deployment) }"
                        />
                        Rollback
                      </button>

                      <div class="h-px bg-border my-1" />

                      <button
                        :disabled="!canDelete(deployment)"
                        class="w-full text-left px-3 py-1.5 text-[11px] font-medium flex items-center gap-2 text-danger hover:bg-danger/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors cursor-pointer"
                        @click="handleDeleteDeployment(deployment)"
                      >
                        <Icon
                          :icon="
                            isPending(deployment)
                              ? 'mdi:loading'
                              : 'mdi:delete-outline'
                          "
                          :width="13"
                          :class="{ 'animate-spin': isPending(deployment) }"
                        />
                        Delete
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </Teleport>
</template>
