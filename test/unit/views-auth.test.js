import { describe, it, expect } from "vitest";
import { pageLayout } from "../../src/views/layout.js";
import { loginPage } from "../../src/views/loginPage.js";
import { setupPage } from "../../src/views/setupPage.js";

describe("auth views", () => {
  it("layout wraps body and escapes title", () => {
    const html = pageLayout({ title: "<x>", body: "<main>hi</main>" });
    expect(html).toContain("<main>hi</main>");
    expect(html).toContain("&lt;x&gt;");
  });
  it("loginPage has username/password fields and posts to /login", () => {
    const html = loginPage();
    expect(html).toMatch(/action="\/login"/);
    expect(html).toMatch(/name="username"/);
    expect(html).toMatch(/name="password"/);
  });
  it("loginPage renders escaped error", () => {
    expect(loginPage("<bad>")).toContain("&lt;bad&gt;");
  });
  it("setupPage posts to /setup", () => {
    expect(setupPage()).toMatch(/action="\/setup"/);
  });
});
