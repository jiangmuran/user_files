import { extractConfig } from "./config.js";
import { route } from "./router.js";

export default {
  async fetch(request, env) {
    const config = extractConfig(env);
    return route(request, env, config);
  },
};
