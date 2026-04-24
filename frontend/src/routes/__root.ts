import { h } from "vue";
import { Outlet, createRootRoute } from "@tanstack/vue-router";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return h("div", {}, ['Hello "__root"!', h(Outlet)]);
}
