import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { resolveUser, isSameOrigin } from "../../src/auth/middleware.js";
import { signSession, sessionCookieHeader } from "../../src/auth/session.js";
import { createUser } from "../../src/db/users.js";
import { createApiKey } from "../../src/db/apikeys.js";
import { generateApiKey, hashApiKey } from "../../src/auth/apikey.js";

const config = { sessionSecret: "s" };
const cookieOf = (t) => sessionCookieHeader(t).split(";")[0];
beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM api_keys").run();
  await env.DATABASE.prepare("DELETE FROM users").run();
});

describe("middleware.resolveUser", () => {
  it("resolves via session cookie", async () => {
    const { id } = await createUser(env.DATABASE, { username: "a", passwordHash: "h", role: "admin", allowedTypes: "*", createdAt: 1 });
    const token = await signSession({ uid: id, role: "admin", ver: 0 }, config.sessionSecret);
    const req = new Request("https://x/", { headers: { Cookie: cookieOf(token) } });
    const auth = await resolveUser(req, env, config);
    expect(auth.via).toBe("session");
    expect(auth.user.id).toBe(id);
  });
  it("rejects session with stale token_version", async () => {
    const { id } = await createUser(env.DATABASE, { username: "b", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 1 });
    const token = await signSession({ uid: id, role: "user", ver: 5 }, config.sessionSecret);
    const req = new Request("https://x/", { headers: { Cookie: cookieOf(token) } });
    expect(await resolveUser(req, env, config)).toBeNull();
  });
  it("resolves via api key and updates last_used", async () => {
    const { id } = await createUser(env.DATABASE, { username: "c", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 1 });
    const { plain, prefix } = generateApiKey();
    await createApiKey(env.DATABASE, { userId: id, name: "k", keyHash: await hashApiKey(plain), keyPrefix: prefix, createdAt: 1 });
    const req = new Request("https://x/", { headers: { Authorization: `Bearer ${plain}` } });
    const auth = await resolveUser(req, env, config);
    expect(auth.via).toBe("apikey");
    expect(auth.user.id).toBe(id);
  });
  it("isSameOrigin checks Origin/Referer host", () => {
    expect(isSameOrigin(new Request("https://x/p", { method: "POST", headers: { Origin: "https://x" } }))).toBe(true);
    expect(isSameOrigin(new Request("https://x/p", { method: "POST", headers: { Origin: "https://evil" } }))).toBe(false);
    expect(isSameOrigin(new Request("https://x/p", { method: "POST" }))).toBe(false);
  });
});
