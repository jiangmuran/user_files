import { resolveUser, isSameOrigin } from "../auth/middleware.js";
import { deleteMedia } from "../db/media.js";
import { jsonResponse } from "../utils/http.js";

export async function handleDelete(request, env, config) {
  if (request.method !== "POST") return jsonResponse({ error: "Method Not Allowed" }, 405);
  const auth = await resolveUser(request, env, config);
  if (!auth || auth.via !== "session") return jsonResponse({ error: "未登录" }, 401);
  if (!isSameOrigin(request)) return jsonResponse({ error: "非法请求来源" }, 403);

  let urls;
  try { urls = await request.json(); } catch { return jsonResponse({ error: "无效请求体" }, 400); }
  if (!Array.isArray(urls) || urls.length === 0) return jsonResponse({ message: "没有要删除的项" }, 400);

  const ownerId = auth.user.role === "admin" ? null : auth.user.id; // admin 可删任意
  const cache = caches.default;
  const [changes] = await Promise.all([
    deleteMedia(env.DATABASE, urls, { ownerId }),
    Promise.all(urls.map((u) => cache.delete(new Request(u)))),
  ]);
  if (changes === 0) return jsonResponse({ message: "未找到可删除的项（或无权限）" }, 404);
  return jsonResponse({ message: "删除成功", deleted: changes });
}
