import CONFIGS from "@/config";
import axios from "axios";

export class ProxyService {
  private static CADDY_API = CONFIGS.CADDY_API;

  private static getRouteId(slug: string) {
    return `route-${slug}`;
  }

  private static getIdUrl(slug: string) {
    /**
     * Caddy admin's `/id/<id>` endpoint lives at the API root, not under
     * `/config/...`. Derive the origin from the configured CADDY_API.
     */
    return `${new URL(this.CADDY_API).origin}/id/${this.getRouteId(slug)}`;
  }

  /**
   * Registers a new domain/slug to point to a specific container IP
   */
  static async registerRoute(
    slug: string,
    targetIp: string,
    port: number = 3000,
  ) {
    const domain = `${slug}.${CONFIGS.APP_DOMAIN}`;

    const routeConfig = {
      "@id": this.getRouteId(slug),
      handle: [
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: `${targetIp}:${port}` }],
        },
      ],
      match: [{ host: [domain] }],
      terminal: true,
    };

    /**
     * remove any existing route for this slug so we replace rather than
     * append a duplicate route to caddy's routes array
     */
    await this.deregisterRoute(slug);

    /**
     * push to caddy dynamic configuration
     */
    try {
      await axios.post(this.CADDY_API, routeConfig);
      console.log(`[Proxy] Route registered: ${domain} -> ${targetIp}`);
    } catch (error) {
      console.error("[Proxy] Failed to register route:", error);
    }
  }

  /**
   * Removes the route for a slug. Safe to call when no route exists.
   */
  static async deregisterRoute(slug: string) {
    try {
      await axios.delete(this.getIdUrl(slug));
      console.log(`[Proxy] Route deregistered: ${slug}`);
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 404 || status === 400) {
        // route didn't exist — nothing to do
        return;
      }
      console.error(
        "[Proxy] Failed to deregister route:",
        error?.message ?? error,
      );
    }
  }
}

const proxyService = new ProxyService();
export default proxyService;
