import { createApp } from "vue";
import { RouterProvider, createRouter } from "@tanstack/vue-router";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { routeTree } from "./routeTree.gen";
import "./style.css";

const router = createRouter({ routeTree });

declare module "@tanstack/vue-router" {
  interface Register {
    router: typeof router;
  }
}

createApp(RouterProvider, { router }).use(VueQueryPlugin).mount("#app");
