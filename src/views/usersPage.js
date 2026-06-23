import { pageLayout } from "./layout.js";
import { escapeHtml } from "../utils/html.js";

function row(u, currentUser) {
  const id = u.id;
  const self = u.id === currentUser.id;
  return `<tr>
    <td>${id}</td><td>${escapeHtml(u.username)}${self ? "（你）" : ""}</td>
    <td>
      <form method="post" action="/users/update" class="inline">
        <input type="hidden" name="id" value="${id}"><input type="hidden" name="field" value="role">
        <select name="value" onchange="this.form.submit()">
          <option value="user"${u.role === "user" ? " selected" : ""}>user</option>
          <option value="admin"${u.role === "admin" ? " selected" : ""}>admin</option>
        </select>
      </form>
    </td>
    <td>
      <form method="post" action="/users/update" class="inline">
        <input type="hidden" name="id" value="${id}"><input type="hidden" name="field" value="allowed_types">
        <input name="value" value="${escapeHtml(u.allowed_types)}" size="14" placeholder="* 或 image,video">
        <button>保存</button>
      </form>
    </td>
    <td>
      <form method="post" action="/users/update" class="inline">
        <input type="hidden" name="id" value="${id}"><input type="hidden" name="field" value="password">
        <input name="value" type="password" placeholder="新密码≥6" size="12"><button>改密</button>
      </form>
    </td>
    <td>
      <form method="post" action="/users/delete" class="inline" onsubmit="return confirm('删除用户「${escapeHtml(u.username)}」及其全部文件？')">
        <input type="hidden" name="id" value="${id}"><button class="danger"${self ? " disabled" : ""}>删除</button>
      </form>
    </td>
  </tr>`;
}

export function usersPage({ users, currentUser, error = "" }) {
  const css = `body{font-family:'Segoe UI',sans-serif;background:#f5f7fa;margin:0;padding:20px}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.06)}
  th,td{padding:10px 12px;border-bottom:1px solid #eee;text-align:left;font-size:14px}
  th{background:#667eea;color:#fff}.inline{display:inline;margin:0}input,select{padding:5px;border:1px solid #ddd;border-radius:6px}
  button{background:#667eea;color:#fff;border:none;border-radius:6px;padding:5px 10px;cursor:pointer}button.danger{background:#b3261e}
  .create{background:#fff;padding:16px;border-radius:12px;margin-bottom:16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  a{color:#667eea} .err{background:#fdecea;color:#b3261e;padding:10px;border-radius:8px;margin-bottom:12px}`;
  const body = `
  <p><a href="/admin">← 返回图库</a></p>
  <h1>用户管理</h1>
  ${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
  <form class="create" method="post" action="/users/create">
    <input name="username" placeholder="用户名≥3" required>
    <input name="password" type="password" placeholder="密码≥6" required>
    <select name="role"><option value="user">user</option><option value="admin">admin</option></select>
    <input name="allowed_types" value="*" size="14" placeholder="* 或 image,video">
    <button>创建用户</button>
  </form>
  <table><thead><tr><th>ID</th><th>用户名</th><th>角色</th><th>允许类型</th><th>重置密码</th><th>操作</th></tr></thead>
  <tbody>${users.map((u) => row(u, currentUser)).join("")}</tbody></table>`;
  return pageLayout({ title: "用户管理", head: `<style>${css}</style>`, body });
}
