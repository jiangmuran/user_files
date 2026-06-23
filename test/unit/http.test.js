import { describe, it, expect } from "vitest";
import { escapeHtml } from "../../src/utils/html.js";
import { jsonResponse, redirect, getCookie } from "../../src/utils/http.js";

describe("utils", () => {
  it("escapeHtml escapes dangerous chars", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });
  it("jsonResponse sets content-type and status", async () => {
    const res = jsonResponse({ ok: true }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(await res.json()).toEqual({ ok: true });
  });
  it("redirect sets Location", () => {
    const res = redirect("/login");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/login");
  });
  it("getCookie parses a named cookie", () => {
    const req = new Request("https://x/", { headers: { Cookie: "a=1; uf_session=tok.en; b=2" } });
    expect(getCookie(req, "uf_session")).toBe("tok.en");
    expect(getCookie(req, "missing")).toBeNull();
  });
});
