import { pageLayout, topbar } from "./layout.js";
import { escapeHtml } from "../utils/html.js";

const CSS = `
.userform{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:18px}
.userform .input,.userform .select{width:auto;min-width:130px}
.tbl .inline{display:inline-flex;gap:6px;align-items:center;margin:0}
.tbl .input,.tbl .select{width:auto;min-width:84px;padding:6px 9px}
.tbl .self{color:var(--accent)}
`;

function row(u, currentUser) {
  const id = u.id;
  const self = u.id === currentUser.id;
  return `<tr>
    <td class="mono">${id}</td>
    <td>${escapeHtml(u.username)}${self ? ' <span class="self">(你)</span>' : ""}</td>
    <td>
      <form method="post" action="/users/update" class="inline">
        <input type="hidden" name="id" value="${id}"><input type="hidden" name="field" value="role">
        <select class="select" name="value" onchange="this.form.submit()">
          <option value="user"${u.role === "user" ? " selected" : ""}>user</option>
          <option value="admin"${u.role === "admin" ? " selected" : ""}>admin</option>
        </select>
      </form>
    </td>
    <td>
      <form method="post" action="/users/update" class="inline">
        <input type="hidden" name="id" value="${id}"><input type="hidden" name="field" value="allowed_types">
        <input class="input" name="value" value="${escapeHtml(u.allowed_types)}" placeholder="* 或 image,video">
        <button class="btn btn-sm" type="submit">保存</button>
      </form>
    </td>
    <td>
      <form method="post" action="/users/update" class="inline">
        <input type="hidden" name="id" value="${id}"><input type="hidden" name="field" value="password">
        <input class="input" name="value" type="password" placeholder="新密码 ≥6">
        <button class="btn btn-sm" type="submit">改密</button>
      </form>
    </td>
    <td>
      <form method="post" action="/users/delete" class="inline" onsubmit="return confirm('删除用户「${escapeHtml(u.username)}」及其全部文件？')">
        <input type="hidden" name="id" value="${id}"><button class="btn btn-sm btn-danger" type="submit"${self ? " disabled" : ""}>删除</button>
      </form>
    </td>
  </tr>`;
}

export function usersPage({ users, currentUser, error = "" }) {
  const body = `${topbar(currentUser, "users")}
<main class="page">
  <div class="eyebrow">USERS</div>
  <h1>用户管理</h1>
  <p class="sub">创建账号、设角色、限制可上传类型、重置密码。</p>
  ${error ? `<div class="alert alert-error">${escapeHtml(error)}</div>` : ""}
  <form class="card userform" method="post" action="/users/create">
    <input class="input" name="username" placeholder="用户名 ≥3" required>
    <input class="input" name="password" type="password" placeholder="密码 ≥6" required>
    <select class="select" name="role"><option value="user">user</option><option value="admin">admin</option></select>
    <input class="input" name="allowed_types" value="*" placeholder="允许类型: * 或 image,video">
    <button class="btn btn-primary" type="submit">创建用户</button>
  </form>
  <div class="table-wrap"><table class="tbl">
    <thead><tr><th>ID</th><th>用户名</th><th>角色</th><th>允许类型</th><th>重置密码</th><th>操作</th></tr></thead>
    <tbody>${users.map((u) => row(u, currentUser)).join("")}</tbody>
  </table></div>
</main>`;
  return pageLayout({ title: "用户管理 · files.muran.tech", head: `<style>${CSS}</style>`, body });
}
