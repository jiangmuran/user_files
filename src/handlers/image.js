import { getMediaFileId } from "../db/media.js";
import { getContentType } from "../utils/contentType.js";
import { extensionOf } from "../auth/filetypes.js";

const IMAGE_TTL = 86400;

// Wrap user-uploaded HTML in our own trusted page: a fixed notice banner the
// upload can't touch, plus a sandboxed iframe (NO allow-same-origin) holding
// the raw content via srcdoc. The iframe runs in an opaque origin, so the
// uploaded page cannot read files.muran.tech cookies or call our same-origin
// APIs — it can render and run scripts, but only against itself.
function htmlWrapper(raw) {
  const esc = String(raw).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>用户上传内容 · files.muran.tech</title>
<style>
  html,body{margin:0;height:100%}
  body{display:flex;flex-direction:column;background:#0d1117}
  .uf-banner{flex:none;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 14px;
    background:#161b22;border-bottom:1px solid #f2a33c;color:#e6edf3;
    font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
  .uf-banner b{color:#f2a33c}
  .uf-banner a{color:#f2a33c}
  .uf-frame{flex:1;width:100%;border:0;background:#fff}
</style></head><body>
  <div class="uf-banner"><b>⚠ 用户上传内容</b><span>此内容由用户上传、与本站立场无关；若含违法违规内容，请联系 <a href="mailto:report@muran.tech">report@muran.tech</a></span></div>
  <iframe class="uf-frame" referrerpolicy="no-referrer" sandbox="allow-scripts allow-popups allow-forms allow-modals allow-downloads" srcdoc="${esc}"></iframe>
</body></html>`;
}

export async function handleImage(request, env, config) {
  const cache = caches.default;
  const cacheKey = new Request(request.url);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const fileId = await getMediaFileId(env.DATABASE, request.url);
  if (!fileId) {
    const notFound = new Response("资源不存在", { status: 404, headers: { "Cache-Control": `public, max-age=${IMAGE_TTL}` } });
    await cache.put(cacheKey, notFound.clone());
    return notFound;
  }

  let filePath;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`https://api.telegram.org/bot${config.tgBotToken}/getFile?file_id=${fileId}`);
    if (r.ok) {
      const d = await r.json();
      if (d.ok && d.result?.file_path) { filePath = d.result.file_path; break; }
    }
  }
  // BUGFIX：Telegram 临时失败时返回 502 且【不缓存】，避免把瞬时故障固化成 24h 永久 404
  if (!filePath) return new Response("暂时无法获取文件，请稍后重试", { status: 502 });

  const fileRes = await fetch(`https://api.telegram.org/file/bot${config.tgBotToken}/${filePath}`);
  if (!fileRes.ok) return new Response("获取文件内容失败", { status: 502 });

  const ext = extensionOf((request.url.split("/").pop() || "").split("?")[0]);

  // HTML/HTM: render inside the sandboxed wrapper (never as a bare same-origin doc).
  if (ext === "html" || ext === "htm") {
    const raw = await fileRes.text();
    const out = new Response(htmlWrapper(raw), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": `public, max-age=${IMAGE_TTL}`,
        "CDN-Cache-Control": `public, max-age=${IMAGE_TTL}`,
      },
    });
    await cache.put(cacheKey, out.clone());
    return out;
  }

  const headers = new Headers(fileRes.headers);
  headers.set("Content-Type", getContentType(ext));
  headers.set("Content-Disposition", "inline");
  headers.set("Cache-Control", `public, max-age=${IMAGE_TTL}`);
  headers.set("CDN-Cache-Control", `public, max-age=${IMAGE_TTL}`);
  const out = new Response(fileRes.body, { status: fileRes.status, headers });
  await cache.put(cacheKey, out.clone());
  return out;
}
