import { pageLayout } from "./layout.js";
import { escapeHtml } from "../utils/html.js";

export function setupPage(error = "") {
  const body = `
  <form class="auth-card" method="post" action="/setup">
    <h1>初始化管理员</h1>
    ${error ? `<div class="auth-error">${escapeHtml(error)}</div>` : ""}
    <p style="color:#888;font-size:13px;text-align:center;margin:0 0 8px">首次部署：创建第一个管理员账号</p>
    <label for="username">用户名（≥3 位）</label>
    <input id="username" name="username" required minlength="3">
    <label for="password">密码（≥6 位）</label>
    <input id="password" name="password" type="password" required minlength="6">
    <button type="submit">创建并登录</button>
  </form>`;
  return pageLayout({ title: "初始化 - 图床", body });
}
