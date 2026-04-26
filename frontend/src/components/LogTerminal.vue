<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { Icon } from "@iconify/vue";

const props = defineProps<{
  logs: string[];
  status?: string;
  isBuilding?: boolean;
}>();

const copied = ref(false);
const terminalBody = ref<HTMLDivElement | null>(null);

watch(
  () => props.logs.length,
  async () => {
    await nextTick();
    const el = terminalBody.value;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  },
);

const copyLogs = async () => {
  await navigator.clipboard.writeText(props.logs.join("\n"));
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
};

const lineColor = (line: string): string => {
  if (
    line.includes("ERROR") ||
    line.includes("failed") ||
    line.includes("Failed")
  )
    return "text-[#ef4444]";
  if (
    line.startsWith("✓") ||
    line.includes("complete") ||
    line.includes("Success")
  )
    return "text-[#22c55e]";
  if (line.startsWith("Step")) return "text-primary";
  return "text-muted";
};
</script>

<template>
  <div class="border border-border rounded overflow-hidden shadow-brutal">
    <!-- Terminal header -->
    <div
      class="flex items-center justify-between px-3 py-2 bg-surface border-b border-border"
    >
      <div class="flex items-center gap-2">
        <Icon icon="mdi:console-line" :width="14" class="text-muted" />
        <span class="font-mono text-xs text-muted font-medium">Live Logs</span>
        <span
          :class="[
            'font-mono text-[10px] px-1.5 py-0.5 rounded border',
            isBuilding
              ? 'text-warning bg-dark border-red'
              : 'text-subtle bg-elevated border-border',
          ]"
        >
          {{ status ?? "Idle" }}
        </span>
      </div>

      <button
        class="flex items-center gap-1.5 text-[11px] text-muted hover:text-primary transition-colors px-2 py-1 rounded hover:bg-elevated cursor-pointer"
        @click="copyLogs"
      >
        <Icon :icon="copied ? 'mdi:check' : 'mdi:content-copy'" :width="12" />
        {{ copied ? "Copied!" : "Copy Logs" }}
      </button>
    </div>

    <!-- Terminal body -->
    <div
      ref="terminalBody"
      class="overflow-y-auto bg-black p-3 space-y-0.5 scroll-smooth h-[40vh]"
    >
      <p
        v-if="logs.length === 0"
        class="font-mono text-xs text-[#3f3f46] italic"
      >
        Waiting for build output...
      </p>
      <div
        v-for="(line, i) in logs"
        :key="i"
        :class="['font-mono text-xs leading-5', lineColor(line)]"
      >
        <span class="text-border-strong select-none mr-2">></span>{{ line }}
      </div>
    </div>
  </div>
</template>
