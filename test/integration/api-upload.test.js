import { env, createExecutionContext, waitOnExecutionContext, fetchMock } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import worker from "../../src/index.js";
import { createUser } from "../../src/db/users.js";
import { createApiKey } from "../../src/db/apikeys.js";
import { generateApiKey, hashApiKey } from "../../src/auth/apikey.js";

async function call(req) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
function mockTelegram() {
  fetchMock.get("https://api.telegram.org")
    .intercept({ path: "/botTESTTOKEN/sendDocument", method: "POST" })
    .reply(200, { ok: true, result: { document: { file_id: "FID" } } });
}
function apiReq(key, filename, type) {
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array(3)], filename, { type }), filename);
  return new Request("https://test.local/api/upload", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd });
}

beforeAll(() => { fetchMock.activate(); fetchMock.disableNetConnect(); });
let key, uid;
beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM api_keys").run();
  await env.DATABASE.prepare("DELETE FROM media").run();
  await env.DATABASE.prepare("DELETE FROM users").run();
  ({ id: uid } = await createUser(env.DATABASE, { username: "api", passwordHash: "h", role: "user", allowedTypes: "image", createdAt: 1 }));
  const gen = generateApiKey();
  key = gen.plain;
  await createApiKey(env.DATABASE, { userId: uid, name: "k", keyHash: await hashApiKey(key), keyPrefix: gen.prefix, createdAt: 1 });
});

describe("POST /api/upload", () => {
  it("uploads with valid key, returns {url}, owner set", async () => {
    mockTelegram();
    const res = await call(apiReq(key, "p.png", "image/png"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toMatch(/^https:\/\/test\.local\/\d+\.png$/);
    const row = await env.DATABASE.prepare("SELECT owner_id FROM media WHERE url=?").bind(json.url).first();
    expect(row.owner_id).toBe(uid);
  });
  it("401 without key", async () => {
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(3)], "p.png", { type: "image/png" }), "p.png");
    const res = await call(new Request("https://test.local/api/upload", { method: "POST", body: fd }));
    expect(res.status).toBe(401);
  });
  it("415 disallowed type", async () => {
    const res = await call(apiReq(key, "v.mp4", "video/mp4"));
    expect(res.status).toBe(415);
  });
});
