import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey, extractApiKey } from "../../src/auth/apikey.js";

describe("apikey", () => {
  it("generates uf_-prefixed key with matching prefix", () => {
    const { plain, prefix } = generateApiKey();
    expect(plain.startsWith("uf_")).toBe(true);
    expect(prefix).toBe(plain.slice(0, 12));
    expect(plain.length).toBeGreaterThan(20);
  });
  it("hash is stable 64-hex", async () => {
    const h1 = await hashApiKey("uf_abc");
    const h2 = await hashApiKey("uf_abc");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
  it("extracts from Authorization: Bearer", () => {
    const req = new Request("https://x/", { headers: { Authorization: "Bearer uf_xyz" } });
    expect(extractApiKey(req)).toBe("uf_xyz");
  });
  it("extracts from X-API-Key", () => {
    const req = new Request("https://x/", { headers: { "X-API-Key": "uf_xyz" } });
    expect(extractApiKey(req)).toBe("uf_xyz");
  });
  it("returns null when absent", () => {
    expect(extractApiKey(new Request("https://x/"))).toBeNull();
  });
});
