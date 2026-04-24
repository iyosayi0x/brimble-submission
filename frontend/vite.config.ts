import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackRouter({ target: "vue", autoCodeSplitting: true }),
    vue(),
  ],
});
