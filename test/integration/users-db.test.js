import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import * as users from "../../src/db/users.js";

beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM users").run();
});

describe("db/users", () => {
  it("counts, creates, fetches", async () => {
    expect(await users.countUsers(env.DATABASE)).toBe(0);
    const { id } = await users.createUser(env.DATABASE, {
      username: "alice", passwordHash: "h", role: "admin", allowedTypes: "*", createdAt: 1000,
    });
    expect(id).toBeGreaterThan(0);
    expect(await users.countUsers(env.DATABASE)).toBe(1);
    expect(await users.countAdmins(env.DATABASE)).toBe(1);
    const byName = await users.getUserByUsername(env.DATABASE, "alice");
    expect(byName.role).toBe("admin");
    const byId = await users.getUserById(env.DATABASE, id);
    expect(byId.username).toBe("alice");
  });
  it("updateUserPassword bumps token_version", async () => {
    const { id } = await users.createUser(env.DATABASE, { username: "b", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 1 });
    await users.updateUserPassword(env.DATABASE, id, "h2");
    const u = await users.getUserById(env.DATABASE, id);
    expect(u.password_hash).toBe("h2");
    expect(u.token_version).toBe(1);
  });
  it("update role / allowed_types / delete", async () => {
    const { id } = await users.createUser(env.DATABASE, { username: "c", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 1 });
    await users.updateUserRole(env.DATABASE, id, "admin");
    await users.updateUserAllowedTypes(env.DATABASE, id, "image");
    let u = await users.getUserById(env.DATABASE, id);
    expect(u.role).toBe("admin");
    expect(u.allowed_types).toBe("image");
    await users.deleteUser(env.DATABASE, id);
    expect(await users.getUserById(env.DATABASE, id)).toBeNull();
  });
  it("username is unique", async () => {
    await users.createUser(env.DATABASE, { username: "dup", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 1 });
    await expect(
      users.createUser(env.DATABASE, { username: "dup", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 1 })
    ).rejects.toThrow();
  });
});
