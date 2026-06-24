import { pageLayout } from "./layout.js";
import { escapeHtml } from "../utils/html.js";

export function loginPage(error = "") {
  const body = `<div class="auth">
  <form class="auth-card" method="post" action="/login">
    <div class="mark">▸ files.muran.tech</div>
    <h1>登录</h1>
    <p class="sub" style="margin-bottom:18px">输入凭据访问你的文件库</p>
    ${error ? `<div class="alert alert-error">${escapeHtml(error)}</div>` : ""}
    <div class="field">
      <label for="username">用户名</label>
      <input class="input" id="username" name="username" autocomplete="username" required>
    </div>
    <div class="field">
      <label for="password">密码</label>
      <input class="input" id="password" name="password" type="password" autocomplete="current-password" required>
    </div>
    <button class="btn btn-primary" type="submit">登录</button>
  </form>
</div>`;
  return pageLayout({ title: "登录 · files.muran.tech", body });
}
