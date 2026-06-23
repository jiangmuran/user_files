import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../src/index.js";
import { createUser } from "../../src/db/users.js";
import { hashPassword } from "../../src/auth/password.js";

async function call(req) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const post = (url, body) =>
  new Request(url, { method: "POST", headers: { Origin: new URL(url).origin, "Content-Type": "application/x-www-form-urlencoded" }, body });

beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM users").run();
  await createUser(env.DATABASE, { username: "root", passwordHash: await hashPassword("secret1"), role: "admin", allowedTypes: "*", createdAt: 1 });
});

describe("/login + /logout", () => {
  it("GET shows form", async () => {
    const res = await call(new Request("https://x/login"));
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/action="\/login"/);
  });
  it("POST wrong password → 401", async () => {
    const res = await call(post("https://x/login", "username=root&password=nope"));
    expect(res.status).toBe(401);
  });
  it("POST correct → 302 /admin with cookie", async () => {
    const res = await call(post("https://x/login", "username=root&password=secret1"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/admin");
    expect(res.headers.get("Set-Cookie")).toMatch(/uf_session=/);
  });
  it("logout clears cookie", async () => {
    const res = await call(post("https://x/logout", ""));
    expect(res.status).toBe(302);
    expect(res.headers.get("Set-Cookie")).toMatch(/Max-Age=0/);
  });
  it("cross-origin POST rejected", async () => {
    const req = new Request("https://x/login", { method: "POST", headers: { Origin: "https://evil", "Content-Type": "application/x-www-form-urlencoded" }, body: "username=root&password=secret1" });
    expect((await call(req)).status).toBe(403);
  });
});
