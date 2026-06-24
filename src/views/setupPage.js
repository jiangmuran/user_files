import { pageLayout } from "./layout.js";
import { escapeHtml } from "../utils/html.js";

export function setupPage(error = "") {
  const body = `<div class="auth">
  <form class="auth-card" method="post" action="/setup">
    <div class="mark">▸ files.muran.tech · setup</div>
    <h1>初始化管理员</h1>
    <p class="sub" style="margin-bottom:18px">首次部署：创建第一个管理员账号</p>
    ${error ? `<div class="alert alert-error">${escapeHtml(error)}</div>` : ""}
    <div class="field">
      <label for="username">用户名（≥3 位）</label>
      <input class="input" id="username" name="username" required minlength="3">
    </div>
    <div class="field">
      <label for="password">密码（≥6 位）</label>
      <input class="input" id="password" name="password" type="password" required minlength="6">
    </div>
    <button class="btn btn-primary" type="submit">创建并登录</button>
  </form>
</div>`;
  return pageLayout({ title: "初始化 · files.muran.tech", body });
}
