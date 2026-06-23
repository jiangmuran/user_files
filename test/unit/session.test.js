import { describe, it, expect } from "vitest";
import { signSession, verifySession, sessionCookieHeader, clearSessionCookieHeader, SESSION_COOKIE } from "../../src/auth/session.js";

const SECRET = "test-secret";

describe("session", () => {
  it("round-trips a valid token", async () => {
    const token = await signSession({ uid: 1, role: "admin", ver: 0 }, SECRET);
    const payload = await verifySession(token, SECRET);
    expect(payload).toMatchObject({ uid: 1, role: "admin", ver: 0 });
    expect(payload.exp).toBeGreaterThan(0);
  });
  it("rejects tampered payload", async () => {
    const token = await signSession({ uid: 1, role: "admin", ver: 0 }, SECRET);
    const [, sig] = token.split(".");
    const forged = btoa(JSON.stringify({ uid: 1, role: "admin", ver: 0, exp: 9999999999 })).replace(/=+$/, "") + "." + sig;
    expect(await verifySession(forged, SECRET)).toBeNull();
  });
  it("rejects wrong secret", async () => {
    const token = await signSession({ uid: 1, role: "user", ver: 0 }, SECRET);
    expect(await verifySession(token, "other")).toBeNull();
  });
  it("rejects expired token", async () => {
    const token = await signSession({ uid: 1, role: "user", ver: 0 }, SECRET, -1);
    expect(await verifySession(token, SECRET)).toBeNull();
  });
  it("cookie header sets HttpOnly Secure SameSite=Strict", () => {
    const h = sessionCookieHeader("abc.def");
    expect(h).toContain(`${SESSION_COOKIE}=abc.def`);
    expect(h).toMatch(/HttpOnly/);
    expect(h).toMatch(/Secure/);
    expect(h).toMatch(/SameSite=Strict/);
  });
  it("clear header expires the cookie", () => {
    expect(clearSessionCookieHeader()).toMatch(/Max-Age=0/);
  });
});
