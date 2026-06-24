import { env, createExecutionContext, waitOnExecutionContext, fetchMock } from "cloudflare:test";
import { describe, it, expect, beforeAll, afterEach, beforeEach } from "vitest";
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
function uploadReq(token, filename, type, allowedSize = 4) {
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array(allowedSize)], filename, { type }), filename);
  return new Request("https://test.local/upload", { method: "POST", headers: { Origin: "https://test.local", Cookie: cookieOf(token) }, body: fd });
}
function mockTelegram() {
  fetchMock.get("https://api.telegram.org")
    .intercept({ path: "/botTESTTOKEN/sendDocument", method: "POST" })
    .reply(200, { ok: true, result: { document: { file_id: "FID123" } } });
}

beforeAll(() => { fetchMock.activate(); fetchMock.disableNetConnect(); });
afterEach(() => { try { fetchMock.assertNoPendingInterceptors(); } catch {} });

let imgUser, imgToken;
beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM media").run();
  await env.DATABASE.prepare("DELETE FROM users").run();
  ({ id: imgUser } = await createUser(env.DATABASE, { username: "img", passwordHash: "h", role: "user", allowedTypes: "image", createdAt: 1 }));
  imgToken = await signSession({ uid: imgUser, role: "user", ver: 0 }, env.SESSION_SECRET);
});

describe("POST /upload", () => {
  it("stores file and returns {data:url} owned by user", async () => {
    mockTelegram();
    const res = await call(uploadReq(imgToken, "pic.png", "image/png"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatch(/^https:\/\/test\.local\/uploads\/\d+\.png$/);
    const row = await env.DATABASE.prepare("SELECT owner_id, extension FROM media WHERE url=?").bind(json.data).first();
    expect(row.owner_id).toBe(imgUser);
    expect(row.extension).toBe("png");
  });
  it("rejects disallowed type for restricted user (415)", async () => {
    const res = await call(uploadReq(imgToken, "clip.mp4", "video/mp4"));
    expect(res.status).toBe(415);
    expect((await res.json()).error).toMatch(/不允许/);
  });
  it("requires authentication (401)", async () => {
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(2)], "a.png", { type: "image/png" }), "a.png");
    const res = await call(new Request("https://test.local/upload", { method: "POST", headers: { Origin: "https://test.local" }, body: fd }));
    expect(res.status).toBe(401);
  });
});
