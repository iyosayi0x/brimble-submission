<script setup lang="ts">
import { Outlet } from "@tanstack/vue-router";
</script>

<template>
  <div class="min-h-screen bg-base text-primary">
    <Outlet />
  </div>
</template>
