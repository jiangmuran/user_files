import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";

async function columns(table) {
  const { results } = await env.DATABASE.prepare(`PRAGMA table_info(${table})`).all();
  return results.map((r) => r.name);
}

describe("schema", () => {
  it("users table has expected columns", async () => {
    const cols = await columns("users");
    expect(cols).toEqual(
      expect.arrayContaining(["id", "username", "password_hash", "role", "allowed_types", "token_version", "created_at"])
    );
  });
  it("api_keys table has expected columns", async () => {
    const cols = await columns("api_keys");
    expect(cols).toEqual(
      expect.arrayContaining(["id", "user_id", "name", "key_hash", "key_prefix", "created_at", "last_used_at"])
    );
  });
  it("media table gained owner_id and metadata columns", async () => {
    const cols = await columns("media");
    expect(cols).toEqual(
      expect.arrayContaining(["url", "fileId", "owner_id", "created_at", "filename", "content_type", "extension", "size"])
    );
  });
});
