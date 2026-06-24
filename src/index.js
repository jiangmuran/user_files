import { extractConfig } from "./config.js";
import { route } from "./router.js";

export default {
  async fetch(request, env) {
    try {
      const config = extractConfig(env);
      return await route(request, env, config);
    } catch (err) {
      console.error("Unhandled error:", err && err.stack ? err.stack : err);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
};
