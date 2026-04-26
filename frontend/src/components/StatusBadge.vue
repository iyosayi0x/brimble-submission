<script setup lang="ts">
import { computed } from "vue";
import { Icon } from "@iconify/vue";

type Status = "RUNNING" | "BUILDING" | "FAILED" | "PENDING" | "STOPPED";

const props = defineProps<{ status: Status }>();

const config = computed(() => {
  const map: Record<Status, { label: string; cls: string; icon: string }> = {
    RUNNING: {
      label: "Running",
      cls: "text-[#22c55e] bg-[#052e16] border border-[#166534]",
      icon: "mdi:circle-small",
    },
    BUILDING: {
      label: "Building",
      cls: "text-[#f59e0b] bg-[#1c1400] border border-[#92400e]",
      icon: "mdi:loading",
    },
    FAILED: {
      label: "Failed",
      cls: "text-[#ef4444] bg-[#1c0505] border border-[#7f1d1d]",
      icon: "mdi:close-circle",
    },
    PENDING: {
      label: "Pending",
      cls: "text-[#a3a3a3] bg-[#0a0a0a] border border-[#404040]",
      icon: "mdi:clock-outline",
    },
    STOPPED: {
      label: "Stopped",
      cls: "text-muted bg-surface border border-border",
      icon: "mdi:stop-circle-outline",
    },
  };
  return map[props.status];
});
</script>

<template>
  <span
    :class="[
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium font-mono tracking-wide',
      config.cls,
    ]"
  >
    <Icon
      :icon="config.icon"
      :width="10"
      :class="{ 'animate-spin': status === 'BUILDING' }"
    />
    {{ config.label }}
  </span>
</template>
