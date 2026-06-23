import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../src/index.js";
import { createUser } from "../../src/db/users.js";
import { insertMedia } from "../../src/db/media.js";
import { signSession, sessionCookieHeader } from "../../src/auth/session.js";

const cookieOf = (t) => sessionCookieHeader(t).split(";")[0];
async function call(url, token) {
  const ctx = createExecutionContext();
  const headers = token ? { Cookie: cookieOf(token) } : {};
  const res = await worker.fetch(new Request(url, { headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
let uId, aId, uTok, aTok;
beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM media").run();
  await env.DATABASE.prepare("DELETE FROM users").run();
  ({ id: uId } = await createUser(env.DATABASE, { username: "u", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 1 }));
  ({ id: aId } = await createUser(env.DATABASE, { username: "a", passwordHash: "h", role: "admin", allowedTypes: "*", createdAt: 1 }));
  uTok = await signSession({ uid: uId, role: "user", ver: 0 }, env.SESSION_SECRET);
  aTok = await signSession({ uid: aId, role: "admin", ver: 0 }, env.SESSION_SECRET);
  await insertMedia(env.DATABASE, { url: "https://test.local/u-cat.png", fileId: "1", ownerId: uId, filename: "cat.png", contentType: "image/png", extension: "png", size: 1, createdAt: 10 });
  await insertMedia(env.DATABASE, { url: "https://test.local/u-clip.mp4", fileId: "2", ownerId: uId, filename: "clip.mp4", contentType: "video/mp4", extension: "mp4", size: 1, createdAt: 20 });
  await insertMedia(env.DATABASE, { url: "https://test.local/a-doc.pdf", fileId: "3", ownerId: aId, filename: "doc.pdf", contentType: "x", extension: "pdf", size: 1, createdAt: 30 });
});

describe("GET /admin", () => {
  it("redirects to /login when not authenticated", async () => {
    expect((await call("https://test.local/admin")).status).toBe(302);
  });
  it("user sees only own files", async () => {
    const html = await (await call("https://test.local/admin", uTok)).text();
    expect(html).toContain("u-cat.png");
    expect(html).toContain("u-clip.mp4");
    expect(html).not.toContain("a-doc.pdf");
  });
  it("admin sees all by default", async () => {
    const html = await (await call("https://test.local/admin", aTok)).text();
    expect(html).toContain("u-cat.png");
    expect(html).toContain("a-doc.pdf");
  });
  it("admin can scope to a specific user", async () => {
    const html = await (await call(`https://test.local/admin?user=${uId}`, aTok)).text();
    expect(html).toContain("u-cat.png");
    expect(html).not.toContain("a-doc.pdf");
  });
  it("type filter narrows results", async () => {
    const html = await (await call("https://test.local/admin?type=video", uTok)).text();
    expect(html).toContain("u-clip.mp4");
    expect(html).not.toContain("u-cat.png");
  });
  it("search by filename", async () => {
    const html = await (await call("https://test.local/admin?q=cat", uTok)).text();
    expect(html).toContain("u-cat.png");
    expect(html).not.toContain("u-clip.mp4");
  });
  it("non-numeric page does not 500 (clamps to 1)", async () => {
    const res = await call("https://test.local/admin?page=abc", uTok);
    expect(res.status).toBe(200);
  });
  it("out-of-range page clamps without error", async () => {
    const res = await call("https://test.local/admin?page=9999", uTok);
    expect(res.status).toBe(200);
  });
});
