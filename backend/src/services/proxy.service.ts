import CONFIGS from "@/config";
import axios from "axios";

export class ProxyService {
  private static CADDY_API = CONFIGS.CADDY_API;

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
     * push to caddy dynamic configuration
     */
    try {
      await axios.post(this.CADDY_API, routeConfig);
      console.log(`[Proxy] Route registered: ${domain} -> ${targetIp}`);
    } catch (error) {
      console.error("[Proxy] Failed to register route:", error);
    }
  }
}

const proxyService = new ProxyService();
export default proxyService;
