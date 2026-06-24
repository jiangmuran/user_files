import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../src/index.js";
import { countUsers } from "../../src/db/users.js";

const post = (url, body) =>
  new Request(url, { method: "POST", headers: { Origin: new URL(url).origin, "Content-Type": "application/x-www-form-urlencoded" }, body });

beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM media").run();
  await env.DATABASE.prepare("DELETE FROM users").run();
});

async function call(req) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("/setup", () => {
  it("GET shows form when no users", async () => {
    const res = await call(new Request("https://x/setup"));
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/初始化管理员/);
  });
  it("POST creates first admin, sets cookie, claims orphan media", async () => {
    await env.DATABASE.prepare("INSERT INTO media (url, fileId) VALUES (?, ?)").bind("https://x/1700000000000.jpg", "fid").run();
    const res = await call(post("https://x/setup", "username=root&password=secret1"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/admin");
    expect(res.headers.get("Set-Cookie")).toMatch(/uf_session=/);
    expect(await countUsers(env.DATABASE)).toBe(1);
    const media = await env.DATABASE.prepare("SELECT owner_id, extension FROM media WHERE url=?").bind("https://x/1700000000000.jpg").first();
    expect(media.owner_id).toBeGreaterThan(0);
    expect(media.extension).toBe("jpg");
  });
  it("GET redirects to /login once a user exists", async () => {
    await call(post("https://x/setup", "username=root&password=secret1"));
    const res = await call(new Request("https://x/setup"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/login");
  });
  it("rejects cross-origin POST", async () => {
    const req = new Request("https://x/setup", { method: "POST", headers: { Origin: "https://evil", "Content-Type": "application/x-www-form-urlencoded" }, body: "username=root&password=secret1" });
    const res = await call(req);
    expect(res.status).toBe(403);
  });
});
