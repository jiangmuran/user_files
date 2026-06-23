import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../src/index.js";
import { createUser } from "../../src/db/users.js";
import { listApiKeys } from "../../src/db/apikeys.js";
import { signSession, sessionCookieHeader } from "../../src/auth/session.js";

const cookieOf = (t) => sessionCookieHeader(t).split(";")[0];
async function call(req) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const form = (token, url, body) => new Request(url, { method: "POST", headers: { Origin: "https://test.local", "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieOf(token) }, body });

let tok, uid;
beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM api_keys").run();
  await env.DATABASE.prepare("DELETE FROM users").run();
  ({ id: uid } = await createUser(env.DATABASE, { username: "u", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 1 }));
  tok = await signSession({ uid, role: "user", ver: 0 }, env.SESSION_SECRET);
});

describe("/apikeys", () => {
  it("redirects to /login when anonymous", async () => {
    expect((await call(new Request("https://test.local/apikeys"))).status).toBe(302);
  });
  it("create shows plaintext once and persists a hashed key", async () => {
    const res = await call(form(tok, "https://test.local/apikeys/create", "name=mykey"));
    const html = await res.text();
    expect(html).toMatch(/uf_[A-Za-z0-9_-]+/); // 明文一次性展示
    const keys = await listApiKeys(env.DATABASE, uid);
    expect(keys).toHaveLength(1);
    expect(keys[0].name).toBe("mykey");
  });
  it("list page does not expose plaintext or hash", async () => {
    await call(form(tok, "https://test.local/apikeys/create", "name=k"));
    const html = await (await call(new Request("https://test.local/apikeys", { headers: { Cookie: cookieOf(tok) } }))).text();
    expect(html).toContain("uf_"); // 仅前缀
    expect(html).not.toMatch(/uf_[A-Za-z0-9_-]{30,}/); // 不含完整明文
  });
  it("delete revokes the key", async () => {
    await call(form(tok, "https://test.local/apikeys/create", "name=k"));
    const [k] = await listApiKeys(env.DATABASE, uid);
    const res = await call(form(tok, "https://test.local/apikeys/delete", `id=${k.id}`));
    expect(res.status).toBe(302);
    expect(await listApiKeys(env.DATABASE, uid)).toHaveLength(0);
  });
});
