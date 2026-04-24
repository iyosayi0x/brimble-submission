import { createApp } from "vue";
import {
  RouterProvider,
  createRouter,
  createRootRoute,
  createRoute,
} from "@tanstack/vue-router";
import "./style.css";
import Layout from "./components/Layout.vue";
import { VueQueryPlugin } from "@tanstack/vue-query";

const rootRoute = createRootRoute({ component: Layout });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/" });
const routeTree = rootRoute.addChildren([indexRoute]);
const router = createRouter({ routeTree });

// Required for type safety
declare module "@tanstack/vue-router" {
  interface Register {
    router: typeof router;
  }
}

const app = createApp(RouterProvider, { router });

app.use(VueQueryPlugin);
app.mount("#app");
