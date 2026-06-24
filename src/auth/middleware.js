import { getCookie } from "../utils/http.js";
import { SESSION_COOKIE, verifySession } from "./session.js";
import { extractApiKey, hashApiKey } from "./apikey.js";
import { getUserById } from "../db/users.js";
import { getApiKeyByHash, touchApiKey } from "../db/apikeys.js";

export async function resolveUser(request, env, config) {
  const token = getCookie(request, SESSION_COOKIE);
  if (token) {
    const payload = await verifySession(token, config.sessionSecret);
    if (payload) {
      const user = await getUserById(env.DATABASE, payload.uid);
      if (user && user.token_version === payload.ver) return { user, via: "session" };
    }
  }
  const key = extractApiKey(request);
  if (key) {
    const row = await getApiKeyByHash(env.DATABASE, await hashApiKey(key));
    if (row) {
      const user = await getUserById(env.DATABASE, row.user_id);
      if (user) {
        await touchApiKey(env.DATABASE, row.id, Date.now());
        return { user, via: "apikey" };
      }
    }
  }
  return null;
}

export function isSameOrigin(request) {
  const url = new URL(request.url);
  for (const h of ["Origin", "Referer"]) {
    const val = request.headers.get(h);
    if (val) {
      try { return new URL(val).host === url.host; } catch { return false; }
    }
  }
  return false;
}
