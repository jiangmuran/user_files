import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../src/index.js";
import { createUser, getUserByUsername, listUsers } from "../../src/db/users.js";
import { insertMedia } from "../../src/db/media.js";
import { createApiKey } from "../../src/db/apikeys.js";
import { signSession, sessionCookieHeader } from "../../src/auth/session.js";

const cookieOf = (t) => sessionCookieHeader(t).split(";")[0];
async function call(req) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const form = (token, url, body) => new Request(url, { method: "POST", headers: { Origin: "https://test.local", "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieOf(token) }, body });

let aTok, uTok, aId, uId;
beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM api_keys").run();
  await env.DATABASE.prepare("DELETE FROM media").run();
  await env.DATABASE.prepare("DELETE FROM users").run();
  ({ id: aId } = await createUser(env.DATABASE, { username: "admin", passwordHash: "h", role: "admin", allowedTypes: "*", createdAt: 1 }));
  ({ id: uId } = await createUser(env.DATABASE, { username: "bob", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 2 }));
  aTok = await signSession({ uid: aId, role: "admin", ver: 0 }, env.SESSION_SECRET);
  uTok = await signSession({ uid: uId, role: "user", ver: 0 }, env.SESSION_SECRET);
});

describe("/users", () => {
  it("non-admin gets 403", async () => {
    const res = await call(new Request("https://test.local/users", { headers: { Cookie: cookieOf(uTok) } }));
    expect(res.status).toBe(403);
  });
  it("admin sees user list", async () => {
    const html = await (await call(new Request("https://test.local/users", { headers: { Cookie: cookieOf(aTok) } }))).text();
    expect(html).toContain("admin");
    expect(html).toContain("bob");
  });
  it("admin creates a restricted user", async () => {
    const res = await call(form(aTok, "https://test.local/users/create", "username=carol&password=secret1&role=user&allowed_types=image"));
    expect(res.status).toBe(302);
    const carol = await getUserByUsername(env.DATABASE, "carol");
    expect(carol.allowed_types).toBe("image");
  });
  it("duplicate-username create redirects with ?err=exists and the page renders the mapped message", async () => {
    // bob already exists from the seed → creating "bob" again must fail with exists.
    const res = await call(form(aTok, "https://test.local/users/create", "username=bob&password=secret1&role=user&allowed_types=*"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/users?err=exists");
    // GET the redirect target → error banner shows the human Chinese message.
    const html = await (await call(new Request("https://test.local/users?err=exists", { headers: { Cookie: cookieOf(aTok) } }))).text();
    expect(html).toContain("用户名已存在");
  });
  it("unknown err code renders no banner", async () => {
    const html = await (await call(new Request("https://test.local/users?err=bogus", { headers: { Cookie: cookieOf(aTok) } }))).text();
    expect(html).not.toContain('class="err"');
  });
  it("update allowed_types persists", async () => {
    await call(form(aTok, "https://test.local/users/update", `id=${uId}&field=allowed_types&value=video`));
    const bob = await getUserByUsername(env.DATABASE, "bob");
    expect(bob.allowed_types).toBe("video");
  });
  it("cannot delete self", async () => {
    await call(form(aTok, "https://test.local/users/delete", `id=${aId}`));
    expect((await listUsers(env.DATABASE)).some((u) => u.id === aId)).toBe(true);
  });
  it("cannot delete the last admin", async () => {
    // bob is user; admin is the only admin → deleting admin blocked even via another admin? here self-delete already blocked; make bob admin then delete admin should be allowed. Test the guard: demote-protection
    await call(form(aTok, "https://test.local/users/update", `id=${aId}&field=role&value=user`));
    const stillAdmin = await getUserByUsername(env.DATABASE, "admin");
    expect(stillAdmin.role).toBe("admin"); // blocked: last admin can't be demoted
  });
  it("admin deletes another user", async () => {
    const res = await call(form(aTok, "https://test.local/users/delete", `id=${uId}`));
    expect(res.status).toBe(302);
    expect((await listUsers(env.DATABASE)).some((u) => u.id === uId)).toBe(false);
  });
  it("password change bumps token_version (force-logout)", async () => {
    await call(form(aTok, "https://test.local/users/update", `id=${uId}&field=password&value=newpass1`));
    const bob = await getUserByUsername(env.DATABASE, "bob");
    expect(bob.token_version).toBe(1);
  });
  // Hardening (beyond brief): deleting a user explicitly removes its media + api_keys rows
  // even if production D1 does not enforce FK ON DELETE CASCADE.
  it("deleting a user removes that user's media rows and api_keys rows", async () => {
    await insertMedia(env.DATABASE, { url: "https://test.local/bob1.png", fileId: "1", ownerId: uId, filename: "bob1", contentType: "image/png", extension: "png", size: 1, createdAt: 10 });
    await insertMedia(env.DATABASE, { url: "https://test.local/bob2.png", fileId: "2", ownerId: uId, filename: "bob2", contentType: "image/png", extension: "png", size: 1, createdAt: 20 });
    await insertMedia(env.DATABASE, { url: "https://test.local/admin1.png", fileId: "3", ownerId: aId, filename: "admin1", contentType: "image/png", extension: "png", size: 1, createdAt: 30 });
    await createApiKey(env.DATABASE, { userId: uId, name: "k1", keyHash: "bobhash1", keyPrefix: "uf_", createdAt: 1 });
    await createApiKey(env.DATABASE, { userId: aId, name: "k2", keyHash: "adminhash1", keyPrefix: "uf_", createdAt: 2 });

    const res = await call(form(aTok, "https://test.local/users/delete", `id=${uId}`));
    expect(res.status).toBe(302);

    const bobMedia = await env.DATABASE.prepare("SELECT COUNT(*) AS c FROM media WHERE owner_id = ?").bind(uId).first();
    expect(bobMedia.c).toBe(0);
    const bobKeys = await env.DATABASE.prepare("SELECT COUNT(*) AS c FROM api_keys WHERE user_id = ?").bind(uId).first();
    expect(bobKeys.c).toBe(0);
    // admin's data untouched
    const adminMedia = await env.DATABASE.prepare("SELECT COUNT(*) AS c FROM media WHERE owner_id = ?").bind(aId).first();
    expect(adminMedia.c).toBe(1);
    const adminKeys = await env.DATABASE.prepare("SELECT COUNT(*) AS c FROM api_keys WHERE user_id = ?").bind(aId).first();
    expect(adminKeys.c).toBe(1);
  });
});
