import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import * as apikeys from "../../src/db/apikeys.js";
import * as users from "../../src/db/users.js";

let uid;
beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM api_keys").run();
  await env.DATABASE.prepare("DELETE FROM users").run();
  ({ id: uid } = await users.createUser(env.DATABASE, { username: "u", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 1 }));
});

describe("db/apikeys", () => {
  it("create, lookup by hash, list, touch, delete", async () => {
    const { id } = await apikeys.createApiKey(env.DATABASE, { userId: uid, name: "k1", keyHash: "abc", keyPrefix: "uf_abc", createdAt: 10 });
    const found = await apikeys.getApiKeyByHash(env.DATABASE, "abc");
    expect(found.user_id).toBe(uid);
    await apikeys.touchApiKey(env.DATABASE, id, 999);
    const list = await apikeys.listApiKeys(env.DATABASE, uid);
    expect(list).toHaveLength(1);
    expect(list[0].last_used_at).toBe(999);
    expect(list[0].key_hash).toBeUndefined();
    expect(await apikeys.deleteApiKey(env.DATABASE, id, uid)).toBe(true);
    expect(await apikeys.listApiKeys(env.DATABASE, uid)).toHaveLength(0);
  });
  it("cannot delete another user's key", async () => {
    const { id } = await apikeys.createApiKey(env.DATABASE, { userId: uid, name: "k", keyHash: "z", keyPrefix: "uf_z", createdAt: 1 });
    expect(await apikeys.deleteApiKey(env.DATABASE, id, uid + 999)).toBe(false);
  });
});
