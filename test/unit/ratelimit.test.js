import { describe, it, expect } from "vitest";
import { checkRateLimit } from "../../src/auth/ratelimit.js";

describe("checkRateLimit", () => {
  it("allows up to max then blocks within window", () => {
    const store = new Map();
    const opts = { max: 2, windowMs: 1000 };
    expect(checkRateLimit(store, "k", { ...opts, now: 0 }).allowed).toBe(true);
    expect(checkRateLimit(store, "k", { ...opts, now: 10 }).allowed).toBe(true);
    const third = checkRateLimit(store, "k", { ...opts, now: 20 });
    expect(third.allowed).toBe(false);
    expect(third.retryAfterMs).toBeGreaterThan(0);
  });
  it("resets after window", () => {
    const store = new Map();
    const opts = { max: 1, windowMs: 1000 };
    expect(checkRateLimit(store, "k", { ...opts, now: 0 }).allowed).toBe(true);
    expect(checkRateLimit(store, "k", { ...opts, now: 1001 }).allowed).toBe(true);
  });
});
