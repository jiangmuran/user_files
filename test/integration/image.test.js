import { env, createExecutionContext, waitOnExecutionContext, fetchMock } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import worker from "../../src/index.js";
import { insertMedia } from "../../src/db/media.js";

async function call(req) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
beforeAll(() => { fetchMock.activate(); fetchMock.disableNetConnect(); });
// media.owner_id FK -> users(id) and miniflare enforces FKs, so the owner row
// used by insertMedia below (id 1) must exist. Seed it after clearing tables.
beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM media").run();
  await env.DATABASE.prepare("DELETE FROM users").run();
  await env.DATABASE
    .prepare("INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(1, "u1", "h", 0)
    .run();
});

describe("image serving (default route)", () => {
  it("404 for unknown url (DB miss is cacheable)", async () => {
    const res = await call(new Request("https://test.local/uploads/doesnotexist.png"));
    expect(res.status).toBe(404);
  });
  it("serves file with correct content-type when present", async () => {
    const url = "https://test.local/uploads/1700000000001.png";
    await insertMedia(env.DATABASE, { url, fileId: "FID", ownerId: 1, filename: "a.png", contentType: "image/png", extension: "png", size: 1, createdAt: 1 });
    fetchMock.get("https://api.telegram.org").intercept({ path: (p) => p.includes("/getFile"), method: "GET" })
      .reply(200, { ok: true, result: { file_path: "photos/x.png" } });
    fetchMock.get("https://api.telegram.org").intercept({ path: (p) => p.includes("/file/botTESTTOKEN/") })
      .reply(200, "BINARY", { headers: { "Content-Type": "application/octet-stream" } });
    const res = await call(new Request(url));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });
  it("transient Telegram getFile failure → 502 (NOT cached as 404)", async () => {
    const url = "https://test.local/uploads/1700000000002.png";
    await insertMedia(env.DATABASE, { url, fileId: "FID2", ownerId: 1, filename: "b.png", contentType: "image/png", extension: "png", size: 1, createdAt: 1 });
    // getFile fails 3× → handler retries exactly 3 times then gives up.
    fetchMock.get("https://api.telegram.org").intercept({ path: (p) => p.includes("/getFile"), method: "GET" }).reply(500, {}).times(3);
    const res = await call(new Request(url));
    expect(res.status).toBe(502);
    // Retried exactly 3×: all three queued intercepts must have been consumed.
    fetchMock.assertNoPendingInterceptors();

    // Regression guard: the transient 502 must NOT have been cached as a 404.
    // A second request after Telegram recovers must reach Telegram again and
    // serve the file — a cached 404 would short-circuit before any getFile call.
    fetchMock.get("https://api.telegram.org").intercept({ path: (p) => p.includes("/getFile"), method: "GET" })
      .reply(200, { ok: true, result: { file_path: "photos/b.png" } });
    fetchMock.get("https://api.telegram.org").intercept({ path: (p) => p.includes("/file/botTESTTOKEN/") })
      .reply(200, "BINARY", { headers: { "Content-Type": "application/octet-stream" } });
    const res2 = await call(new Request(url));
    expect(res2.status).toBe(200);
    expect(res2.headers.get("Content-Type")).toBe("image/png");
  });

  it("renders uploaded .html in a sandboxed iframe with a notice banner", async () => {
    const url = "https://test.local/uploads/1700000000003.html";
    await insertMedia(env.DATABASE, { url, fileId: "FIDH", ownerId: 1, filename: "page.html", contentType: "text/html", extension: "html", size: 1, createdAt: 1 });
    fetchMock.get("https://api.telegram.org").intercept({ path: (p) => p.includes("/getFile"), method: "GET" })
      .reply(200, { ok: true, result: { file_path: "docs/p.html" } });
    fetchMock.get("https://api.telegram.org").intercept({ path: (p) => p.includes("/file/botTESTTOKEN/") })
      .reply(200, "<h1>Hi</h1><script>alert(1)</script>", { headers: { "Content-Type": "text/plain" } });
    const res = await call(new Request(url));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("report@muran.tech");      // notice banner present
    expect(html).toMatch(/sandbox="[^"]*"/);           // rendered inside a sandbox
    expect(html).not.toMatch(/allow-same-origin/);     // SECURITY: never same-origin
    expect(html).toContain("srcdoc=");
    expect(html).toContain("<h1>Hi</h1>");             // user content embedded
    expect(html).toContain("uf-x");                    // notice is dismissible (✕)
  });
});
