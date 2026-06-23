import { getMediaFileId } from "../db/media.js";
import { getContentType } from "../utils/contentType.js";
import { extensionOf } from "../auth/filetypes.js";

const IMAGE_TTL = 86400;

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

  const ext = extensionOf((request.url.split("/").pop() || ""));
  const headers = new Headers(fileRes.headers);
  headers.set("Content-Type", getContentType(ext));
  headers.set("Content-Disposition", "inline");
  headers.set("Cache-Control", `public, max-age=${IMAGE_TTL}`);
  headers.set("CDN-Cache-Control", `public, max-age=${IMAGE_TTL}`);
  const out = new Response(fileRes.body, { status: fileRes.status, headers });
  await cache.put(cacheKey, out.clone());
  return out;
}
