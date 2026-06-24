import { pageLayout, topbar } from "./layout.js";
import { escapeHtml } from "../utils/html.js";

const VIDEO = ["mp4", "avi", "mov", "webm", "mkv", "wmv", "flv", "m4v", "mpeg", "mpg"];
const IMAGE = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tiff", "tif", "ico", "avif"];

function tile(row) {
  const url = escapeHtml(row.url);
  const ext = escapeHtml(row.extension || "");
  const name = escapeHtml(row.filename || row.url.split("/").pop());
  const when = row.created_at ? escapeHtml(new Date(row.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })) : "";
  let media;
  if (VIDEO.includes(row.extension)) media = `<video class="m" preload="none" controls><source data-src="${url}" type="video/${ext}"></video>`;
  else if (IMAGE.includes(row.extension)) media = `<img class="m lazy" data-src="${url}" alt="">`;
  else media = `<div class="icon">▢</div>`;
  return `<div class="tile" data-key="${url}" onclick="toggleSel(this)" title="${name}">
    <div class="badge">${ext || "file"}</div>${media}<div class="when">${when}</div></div>`;
}

function opt(value, label, selected) {
  return `<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`;
}

const CSS = `
.lib-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 14px}
.lib-bar .input{width:auto;min-width:190px}
.lib-bar .select{width:auto}
.lib-bar .types{display:inline-flex;gap:12px;align-items:center;font-family:var(--mono);font-size:12px;color:var(--muted)}
.lib-bar .types label{display:inline-flex;gap:5px;align-items:center;cursor:pointer}
.lib-bar .types input{accent-color:var(--accent)}
.actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 16px}
.actions.hidden{display:none}
.dropdown{position:relative}
.dropdown .menu{display:none;position:absolute;left:0;top:calc(100% + 4px);background:var(--panel);border:1px solid var(--line);border-radius:6px;overflow:hidden;z-index:20;min-width:120px}
.dropdown:hover .menu{display:block}
.dropdown .menu button{display:block;width:100%;text-align:left;font-family:var(--mono);font-size:12px;background:none;border:none;color:var(--text);padding:8px 12px;cursor:pointer}
.dropdown .menu button:hover{background:var(--panel2)}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:12px}
.tile{position:relative;aspect-ratio:1;background:var(--panel);border:1px solid var(--line);border-radius:8px;overflow:hidden;cursor:pointer;transition:border-color .15s}
.tile:hover{border-color:var(--line2)}
.tile.sel{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.tile .m{width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .3s}
.tile .m[src]{opacity:1}
.tile .icon{display:flex;align-items:center;justify-content:center;height:100%;font-size:30px;color:var(--faint);font-family:var(--mono)}
.tile .badge{position:absolute;top:7px;left:7px;font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--accent);background:rgba(13,17,23,.78);border:1px solid var(--line);padding:2px 6px;border-radius:4px;z-index:2}
.tile .when{position:absolute;left:0;right:0;bottom:0;font-family:var(--mono);font-size:10px;color:var(--text);background:rgba(13,17,23,.86);padding:5px 7px;display:none}
.tile.sel .when{display:block}
.pager{display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap;margin:26px 0 0;font-family:var(--mono);font-size:12px;color:var(--muted)}
.pager .input{width:62px}
`;

const SCRIPT = `
  const ALL_KEYS = __ALL_KEYS__;
  const selected = new Set();
  function refresh(){ document.getElementById('selCount').textContent = selected.size;
    document.getElementById('actions').classList.toggle('hidden', selected.size===0); }
  function toggleSel(el){ const k=el.dataset.key; if(selected.has(k)){selected.delete(k);el.classList.remove('sel');}else{selected.add(k);el.classList.add('sel');} refresh(); }
  function selectPage(){ document.querySelectorAll('.tile').forEach(t=>{selected.add(t.dataset.key);t.classList.add('sel');}); refresh(); }
  function selectAllFiltered(){ if(!ALL_KEYS) return; if(!confirm('将选中当前筛选的全部 '+ALL_KEYS.length+' 个文件，确定？')) return; ALL_KEYS.forEach(k=>selected.add(k)); document.querySelectorAll('.tile').forEach(t=>{ if(selected.has(t.dataset.key)) t.classList.add('sel'); }); refresh(); }
  function goPage(n){ if(!Number.isInteger(n)||n<1) return; document.getElementById('pageField').value=n; document.getElementById('filters').submit(); }
  function fmt(urls,f){ if(f==='bbcode') return urls.map(u=>'[img]'+u+'[/img]').join('\\n\\n'); if(f==='markdown') return urls.map(u=>'![image]('+u+')').join('\\n\\n'); return urls.join('\\n\\n'); }
  function copyFmt(f){ const t=fmt([...selected],f); navigator.clipboard?.writeText(t).then(()=>alert('复制成功')).catch(()=>alert('复制失败')); }
  async function del(){ if(selected.size===0) return; if(!confirm('确定删除选中的 '+selected.size+' 个文件？此操作不可撤回。')) return;
    const res=await fetch('/delete-images',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify([...selected])});
    if(res.ok){ [...selected].forEach(k=>{ const el=document.querySelector('.tile[data-key="'+CSS.escape(k)+'"]'); if(el) el.remove(); }); selected.clear(); refresh(); alert('删除成功'); }
    else alert('删除失败'); }
  document.addEventListener('DOMContentLoaded',()=>{ const io=new IntersectionObserver((es,o)=>{ es.forEach(e=>{ if(!e.isIntersecting) return; const el=e.target; const v=el.querySelector('video'); if(v){const s=v.querySelector('source'); if(s&&s.dataset.src){v.src=s.dataset.src;v.load();}} else {const i=el.querySelector('img'); if(i&&i.dataset.src&&!i.src) i.src=i.dataset.src;} o.unobserve(el); }); },{rootMargin:'150px'});
    document.querySelectorAll('.tile').forEach(t=>io.observe(t)); });
`;

export function adminPage(d) {
  const { rows, total, page, totalPages, pageSize, sort, search, types, isAdmin, users, viewUser, currentUser, allFilteredKeys } = d;
  const typeChecked = (t) => (types.includes(t) ? " checked" : "");
  const userOptions = isAdmin
    ? `<select class="select" name="user"><option value="all"${viewUser === "all" ? " selected" : ""}>全部用户</option>` +
      users.map((u) => `<option value="${u.id}"${viewUser === String(u.id) ? " selected" : ""}>${escapeHtml(u.username)}</option>`).join("") +
      `</select>`
    : "";

  const controls = `
  <form id="filters" method="get" action="/admin" class="lib-bar">
    <input class="input" type="text" name="q" value="${escapeHtml(search)}" placeholder="搜索文件名 / URL">
    <span class="types">
      <label><input type="checkbox" name="type" value="image"${typeChecked("image")}> 图片</label>
      <label><input type="checkbox" name="type" value="video"${typeChecked("video")}> 视频</label>
      <label><input type="checkbox" name="type" value="other"${typeChecked("other")}> 其它</label>
    </span>
    <select class="select" name="sort">
      ${opt("time_desc", "时间 ↓", sort)}${opt("time_asc", "时间 ↑", sort)}${opt("type", "类型", sort)}${opt("size_desc", "大小 ↓", sort)}${opt("size_asc", "大小 ↑", sort)}
    </select>
    <select class="select" name="size">${[20, 50, 100].map((s) => opt(String(s), s + " / 页", String(pageSize))).join("")}</select>
    ${userOptions}
    <input type="hidden" name="page" id="pageField" value="1">
    <button class="btn" type="submit">应用</button>
  </form>`;

  const actions = `
  <div class="actions hidden" id="actions">
    <span class="dropdown"><button class="btn" type="button">复制 ▾</button>
      <div class="menu">
        <button type="button" onclick="copyFmt('url')">URL</button>
        <button type="button" onclick="copyFmt('markdown')">Markdown</button>
        <button type="button" onclick="copyFmt('bbcode')">BBCode</button>
      </div></span>
    <button class="btn" type="button" onclick="selectPage()">全选本页</button>
    ${allFilteredKeys ? `<button class="btn" type="button" onclick="selectAllFiltered()">全选筛选结果 (${total})</button>` : ""}
    <button class="btn btn-danger" type="button" onclick="del()">删除选中</button>
  </div>`;

  const gallery = rows.length
    ? `<div class="gallery">${rows.map(tile).join("")}</div>`
    : `<div class="empty">▢ 还没有文件 — 去<a href="/">上传</a>一个</div>`;

  const pager = `
  <div class="pager">
    <button class="btn" onclick="goPage(${page - 1})" ${page <= 1 ? "disabled" : ""}>← 上一页</button>
    <span>第 ${page} / ${totalPages} 页 · 共 ${total}</span>
    <button class="btn" onclick="goPage(${page + 1})" ${page >= totalPages ? "disabled" : ""}>下一页 →</button>
    <input class="input" type="number" id="jump" min="1" max="${totalPages}" placeholder="页">
    <button class="btn" onclick="goPage(parseInt(document.getElementById('jump').value,10))">跳转</button>
  </div>`;

  const script = SCRIPT.replace("__ALL_KEYS__", JSON.stringify(allFilteredKeys || null));

  const body = `${topbar(currentUser, "admin")}
<main class="page">
  <div class="eyebrow">LIBRARY</div>
  <h1>图库</h1>
  <p class="sub mono">共 ${total} 个文件 · 已选 <span id="selCount">0</span></p>
  ${controls}
  ${actions}
  ${gallery}
  ${rows.length ? pager : ""}
  <script>${script}</script>
</main>`;
  return pageLayout({ title: "图库 · files.muran.tech", head: `<style>${CSS}</style>`, body });
}
