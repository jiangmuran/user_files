import { pageLayout, topbar } from "./layout.js";
import { escapeHtml } from "../utils/html.js";

const CSS = `
.keyform{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:18px}
.keyform .input{width:auto;min-width:220px}
.keynew{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.keynew .lbl{font-weight:500}
.keynew code{font-family:var(--mono);font-size:13px;color:#fff;word-break:break-all;flex:1;min-width:200px}
.docs{margin-top:22px}
.docs h2{font-family:var(--mono);font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px}
.docs pre{font-family:var(--mono);font-size:12.5px;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:14px;overflow:auto;line-height:1.7;margin:0}
.docs pre .p{color:var(--faint)}
.docs pre .c{color:var(--accent)}
.docs .note{font-family:var(--mono);font-size:12px;color:var(--muted);margin-top:10px}
`;

export function apikeysPage({ keys, newKeyPlain, user }) {
  const newBanner = newKeyPlain
    ? `<div class="alert alert-ok keynew">
        <span class="lbl">新 Key（只显示这一次，请立即保存）</span>
        <code id="newkey">${escapeHtml(newKeyPlain)}</code>
        <button class="btn btn-sm" type="button" onclick="navigator.clipboard&&navigator.clipboard.writeText(document.getElementById('newkey').textContent)">复制</button>
      </div>`
    : "";

  const rows = keys.length
    ? keys.map((k) => `<tr>
        <td>${escapeHtml(k.name || "—")}</td>
        <td><code>${escapeHtml(k.key_prefix)}…</code></td>
        <td class="mono">${escapeHtml(new Date(k.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }))}</td>
        <td class="mono">${k.last_used_at ? escapeHtml(new Date(k.last_used_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })) : "从未"}</td>
        <td><form method="post" action="/apikeys/delete" class="inline" onsubmit="return confirm('撤销该 Key？')"><input type="hidden" name="id" value="${k.id}"><button class="btn btn-sm btn-danger" type="submit">撤销</button></form></td>
      </tr>`).join("")
    : `<tr><td colspan="5" style="text-align:center;color:var(--muted);font-family:var(--mono);padding:28px">还没有 API Key</td></tr>`;

  const body = `${topbar(user, "apikeys")}
<main class="page">
  <div class="eyebrow">API KEYS</div>
  <h1>API Key</h1>
  <p class="sub">用于程序化上传（PicGo / ShareX / curl）。Key 只能上传，不能浏览或删除文件。</p>
  ${newBanner}
  <form class="card keyform" method="post" action="/apikeys/create">
    <input class="input" name="name" placeholder="备注名（可选）" maxlength="64">
    <button class="btn btn-primary" type="submit">创建新 Key</button>
  </form>
  <div class="table-wrap"><table class="tbl">
    <thead><tr><th>备注</th><th>前缀</th><th>创建时间</th><th>最近使用</th><th>操作</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  <div class="docs">
    <h2>用法</h2>
    <pre><span class="p">$</span> curl -X POST https://files.muran.tech<span class="c">/api/upload</span> \\
  -H <span class="c">"Authorization: Bearer &lt;API_KEY&gt;"</span> \\
  -F <span class="c">"file=@./image.png"</span></pre>
    <div class="note">也支持请求头 <code>X-API-Key: &lt;API_KEY&gt;</code>。返回 <code>{ "url": "…" }</code>。</div>
  </div>
</main>`;
  return pageLayout({ title: "API Key · files.muran.tech", head: `<style>${CSS}</style>`, body });
}
