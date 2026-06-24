import { resolveUser, isSameOrigin } from "../auth/middleware.js";
import { performUpload } from "./uploadCore.js";
import { jsonResponse } from "../utils/http.js";

export async function handleUpload(request, env, config) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const auth = await resolveUser(request, env, config);
  if (!auth || auth.via !== "session") return jsonResponse({ error: "未登录" }, 401);
  if (!isSameOrigin(request)) return jsonResponse({ error: "非法请求来源" }, 403);
  try {
    const form = await request.formData();
    const { url } = await performUpload({ file: form.get("file"), user: auth.user, env, config });
    return jsonResponse({ data: url });
  } catch (e) {
    return jsonResponse({ error: e.message }, e.status || 500);
  }
}
