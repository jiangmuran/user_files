import { pageLayout } from "./layout.js";
import { escapeHtml } from "../utils/html.js";

export function apikeysPage({ keys, newKeyPlain, user }) {
  const css = `body{font-family:'Segoe UI',sans-serif;background:#f5f7fa;margin:0;padding:20px}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.06)}
  th,td{padding:10px 12px;border-bottom:1px solid #eee;text-align:left;font-size:14px}th{background:#667eea;color:#fff}
  button{background:#667eea;color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer}button.danger{background:#b3261e}
  .create,.newkey,.docs{background:#fff;padding:16px;border-radius:12px;margin-bottom:16px}
  .newkey{background:#e8f5e9;border:1px solid #66bb6a}.newkey code{font-size:15px;word-break:break-all}
  input{padding:6px;border:1px solid #ddd;border-radius:6px}a{color:#667eea}pre{background:#272822;color:#f8f8f2;padding:12px;border-radius:8px;overflow:auto}`;
  const newBanner = newKeyPlain
    ? `<div class="newkey"><b>新 API Key（仅显示这一次，请立即保存）：</b><br><code>${escapeHtml(newKeyPlain)}</code></div>`
    : "";
  const rows = keys.length
    ? keys.map((k) => `<tr>
        <td>${escapeHtml(k.name || "(无名)")}</td>
        <td><code>${escapeHtml(k.key_prefix)}…</code></td>
        <td>${escapeHtml(new Date(k.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }))}</td>
        <td>${k.last_used_at ? escapeHtml(new Date(k.last_used_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })) : "从未"}</td>
        <td><form method="post" action="/apikeys/delete" style="display:inline" onsubmit="return confirm('撤销该 Key？')"><input type="hidden" name="id" value="${k.id}"><button class="danger">撤销</button></form></td>
      </tr>`).join("")
    : `<tr><td colspan="5" style="text-align:center;color:#999">还没有 API Key</td></tr>`;
  const body = `
  <p><a href="/admin">← 返回图库</a></p>
  <h1>API Key 管理</h1>
  ${newBanner}
  <form class="create" method="post" action="/apikeys/create">
    <input name="name" placeholder="备注名（可选）" maxlength="64">
    <button>创建新 Key</button>
  </form>
  <table><thead><tr><th>备注</th><th>前缀</th><th>创建时间</th><th>最近使用</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="docs"><b>用法（仅上传）：</b>
    <pre>curl -X POST https://&lt;your-domain&gt;/api/upload \\
  -H "Authorization: Bearer &lt;API_KEY&gt;" \\
  -F "file=@/path/to/image.png"</pre>
    也支持请求头 <code>X-API-Key: &lt;API_KEY&gt;</code>。
  </div>`;
  return pageLayout({ title: "API Key 管理", head: `<style>${css}</style>`, body });
}
