import { pageLayout } from "./layout.js";
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
  else media = `<div class="icon">📁</div>`;
  return `<div class="tile" data-key="${url}" onclick="toggleSel(this)" title="${name}">
    <div class="badge">${ext}</div>${media}<div class="when">${when}</div></div>`;
}

function opt(value, label, selected) {
  return `<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`;
}

export function adminPage(d) {
  const { rows, total, page, totalPages, pageSize, sort, search, types, isAdmin, users, viewUser, currentUser, allFilteredKeys } = d;
  const typeChecked = (t) => (types.includes(t) ? " checked" : "");
  const userOptions = isAdmin
    ? `<select name="user"><option value="all"${viewUser === "all" ? " selected" : ""}>全部用户</option>` +
      users.map((u) => `<option value="${u.id}"${viewUser === String(u.id) ? " selected" : ""}>${escapeHtml(u.username)}</option>`).join("") +
      `</select>`
    : "";

  const controls = `
  <form id="filters" method="get" action="/admin" class="controls">
    <input type="text" name="q" value="${escapeHtml(search)}" placeholder="搜索文件名/URL">
    <label><input type="checkbox" name="type" value="image"${typeChecked("image")}>图片</label>
    <label><input type="checkbox" name="type" value="video"${typeChecked("video")}>视频</label>
    <label><input type="checkbox" name="type" value="other"${typeChecked("other")}>其它</label>
    <select name="sort">
      ${opt("time_desc", "时间↓", sort)}${opt("time_asc", "时间↑", sort)}${opt("type", "类型", sort)}${opt("size_desc", "大小↓", sort)}${opt("size_asc", "大小↑", sort)}
    </select>
    <select name="size">${[20, 50, 100].map((s) => opt(String(s), s + "/页", String(pageSize))).join("")}</select>
    ${userOptions}
    <input type="hidden" name="page" id="pageField" value="1">
    <button type="submit">应用</button>
  </form>`;

  const header = `
  <div class="header">
    <div class="left">
      <span>媒体文件 ${total} 个</span>
      <span>已选 <span id="selCount">0</span> 个</span>
      <a href="/">上传</a>
      ${isAdmin ? '<a href="/users">用户管理</a>' : ""}
      <a href="/apikeys">API Key</a>
      <form method="post" action="/logout" style="display:inline"><button class="link">登出</button></form>
    </div>
    <div class="right hidden" id="actions">
      <div class="dropdown"><button class="btn">复制</button>
        <div class="menu"><button onclick="copyFmt('url')">URL</button><button onclick="copyFmt('bbcode')">BBCode</button><button onclick="copyFmt('markdown')">Markdown</button></div>
      </div>
      <button class="btn" onclick="selectPage()">全选本页</button>
      ${allFilteredKeys ? `<button class="btn" onclick="selectAllFiltered()">全选筛选结果(${total})</button>` : ""}
      <button class="btn danger" onclick="del()">删除</button>
    </div>
  </div>`;

  const gallery = rows.length
    ? `<div class="gallery">${rows.map(tile).join("")}</div>`
    : `<div class="empty">📁 暂无媒体文件</div>`;

  const pagination = `
  <div class="pager">
    <button onclick="goPage(${page - 1})" ${page <= 1 ? "disabled" : ""}>上一页</button>
    <span>第 ${page} / ${totalPages} 页（共 ${total} 个）</span>
    <button onclick="goPage(${page + 1})" ${page >= totalPages ? "disabled" : ""}>下一页</button>
    <input type="number" id="jump" min="1" max="${totalPages}" placeholder="页码" style="width:70px">
    <button onclick="goPage(parseInt(document.getElementById('jump').value,10))">跳转</button>
  </div>`;

  const css = `
  body{font-family:'Segoe UI',sans-serif;background:linear-gradient(135deg,#f5f7fa,#e4e8f0);margin:0;padding:16px}
  .header{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;background:#fff;padding:12px 16px;border-radius:12px;box-shadow:0 4px 20px rgba(102,126,234,.12);margin-bottom:12px}
  .header .left{display:flex;gap:14px;align-items:center;color:#555;flex-wrap:wrap}
  .header a,.link{color:#667eea;text-decoration:none;background:none;border:none;cursor:pointer;font-size:14px}
  .controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center;background:#fff;padding:12px 16px;border-radius:12px;margin-bottom:12px}
  .controls input[type=text]{padding:7px 10px;border:1px solid #ddd;border-radius:8px}
  .controls select{padding:7px;border:1px solid #ddd;border-radius:8px}
  .btn{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;border-radius:8px;padding:8px 16px;cursor:pointer}
  .btn.danger{background:linear-gradient(135deg,#e57373,#b3261e)}
  .hidden{display:none}
  .right{display:flex;gap:8px;align-items:center}
  .dropdown{position:relative}.dropdown .menu{display:none;position:absolute;right:0;background:#fff;border-radius:8px;box-shadow:0 8px 25px rgba(0,0,0,.15);overflow:hidden;z-index:10}
  .dropdown:hover .menu{display:block}.dropdown .menu button{display:block;width:100%;border:none;background:none;padding:10px 16px;text-align:left;cursor:pointer}
  .gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px}
  .tile{position:relative;aspect-ratio:1;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,.08);cursor:pointer;border:2px solid transparent}
  .tile.sel{border-color:#667eea;box-shadow:0 0 18px rgba(102,126,234,.35)}
  .tile .m{width:100%;height:100%;object-fit:contain}
  .tile .icon{display:flex;align-items:center;justify-content:center;height:100%;font-size:48px}
  .badge{position:absolute;top:8px;left:8px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:3px 8px;border-radius:12px;font-size:11px;text-transform:uppercase;z-index:2}
  .when{position:absolute;bottom:0;left:0;right:0;background:rgba(255,255,255,.9);font-size:11px;padding:5px;color:#555;display:none}
  .tile.sel .when{display:block}
  .empty{text-align:center;padding:80px;color:#999;background:#fff;border-radius:12px}
  .pager{display:flex;gap:12px;justify-content:center;align-items:center;margin:20px 0;flex-wrap:wrap}
  .pager button{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;border-radius:8px;padding:8px 18px;cursor:pointer}
  .pager button:disabled{background:#ccc;cursor:not-allowed}`;

  const script = `
  const ALL_KEYS = ${JSON.stringify(allFilteredKeys || null)};
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
    document.querySelectorAll('.tile').forEach(t=>io.observe(t)); });`;

  const body = `${controls}${header}${gallery}${totalPages > 1 || rows.length ? pagination : ""}<script>${script}</script>`;
  return pageLayout({ title: "图库管理", head: `<style>${css}</style>`, body });
}
