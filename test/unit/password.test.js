import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../../src/auth/password.js";

describe("password", () => {
  it("hash format is pbkdf2$iter$salt$hash", async () => {
    const h = await hashPassword("hunter2");
    expect(h.split("$")).toHaveLength(4);
    expect(h.startsWith("pbkdf2$150000$")).toBe(true);
  });
  it("verifies correct password", async () => {
    const h = await hashPassword("p@ss:word");
    expect(await verifyPassword("p@ss:word", h)).toBe(true);
  });
  it("rejects wrong password", async () => {
    const h = await hashPassword("hunter2");
    expect(await verifyPassword("hunter3", h)).toBe(false);
  });
  it("rejects malformed stored hash", async () => {
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
  it("two hashes of same password differ (random salt)", async () => {
    expect(await hashPassword("a")).not.toBe(await hashPassword("a"));
  });
});
