import { pageLayout } from "./layout.js";
import { escapeHtml } from "../utils/html.js";

export function loginPage(error = "") {
  const body = `
  <form class="auth-card" method="post" action="/login">
    <h1>登录</h1>
    ${error ? `<div class="auth-error">${escapeHtml(error)}</div>` : ""}
    <label for="username">用户名</label>
    <input id="username" name="username" autocomplete="username" required>
    <label for="password">密码</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">登录</button>
  </form>`;
  return pageLayout({ title: "登录 - 图床", body });
}
