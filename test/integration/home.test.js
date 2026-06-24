import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../src/index.js";
import { createUser } from "../../src/db/users.js";
import { signSession, sessionCookieHeader } from "../../src/auth/session.js";

const cookieOf = (t) => sessionCookieHeader(t).split(";")[0];
async function call(req) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
let token;
beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM users").run();
  const { id } = await createUser(env.DATABASE, { username: "u", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 1 });
  token = await signSession({ uid: id, role: "user", ver: 0 }, env.SESSION_SECRET);
});

describe("GET /", () => {
  it("redirects to /login when not authenticated", async () => {
    const res = await call(new Request("https://x/"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/login");
  });
  it("renders uploader when logged in", async () => {
    const res = await call(new Request("https://x/", { headers: { Cookie: cookieOf(token) } }));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/action="\/upload"/);
    expect(html).toMatch(/\/logout/);
  });
});
