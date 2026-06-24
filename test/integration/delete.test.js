import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../src/index.js";
import { createUser } from "../../src/db/users.js";
import { insertMedia } from "../../src/db/media.js";
import { signSession, sessionCookieHeader } from "../../src/auth/session.js";

const cookieOf = (t) => sessionCookieHeader(t).split(";")[0];
async function call(req) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const delReq = (token, urls) => new Request("https://test.local/delete-images", {
  method: "POST", headers: { Origin: "https://test.local", "Content-Type": "application/json", Cookie: cookieOf(token) }, body: JSON.stringify(urls),
});

let userToken, adminToken, uId, aId;
beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM media").run();
  await env.DATABASE.prepare("DELETE FROM users").run();
  ({ id: uId } = await createUser(env.DATABASE, { username: "u", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 1 }));
  ({ id: aId } = await createUser(env.DATABASE, { username: "a", passwordHash: "h", role: "admin", allowedTypes: "*", createdAt: 1 }));
  userToken = await signSession({ uid: uId, role: "user", ver: 0 }, env.SESSION_SECRET);
  adminToken = await signSession({ uid: aId, role: "admin", ver: 0 }, env.SESSION_SECRET);
  await insertMedia(env.DATABASE, { url: "https://test.local/u.png", fileId: "1", ownerId: uId, filename: "u", contentType: "image/png", extension: "png", size: 1, createdAt: 1 });
  await insertMedia(env.DATABASE, { url: "https://test.local/a.png", fileId: "2", ownerId: aId, filename: "a", contentType: "image/png", extension: "png", size: 1, createdAt: 2 });
});

describe("POST /delete-images", () => {
  it("user cannot delete another user's file", async () => {
    const res = await call(delReq(userToken, ["https://test.local/a.png"]));
    expect(res.status).toBe(404);
    const still = await env.DATABASE.prepare("SELECT 1 FROM media WHERE url=?").bind("https://test.local/a.png").first();
    expect(still).not.toBeNull();
  });
  it("user deletes own file", async () => {
    const res = await call(delReq(userToken, ["https://test.local/u.png"]));
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe(1);
  });
  it("admin deletes any file", async () => {
    const res = await call(delReq(adminToken, ["https://test.local/u.png"]));
    expect(res.status).toBe(200);
  });
  it("401 when not logged in", async () => {
    const res = await call(new Request("https://test.local/delete-images", { method: "POST", headers: { Origin: "https://test.local", "Content-Type": "application/json" }, body: "[]" }));
    expect(res.status).toBe(401);
  });
});
