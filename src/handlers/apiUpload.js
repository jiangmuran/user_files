import { resolveUser } from "../auth/middleware.js";
import { performUpload } from "./uploadCore.js";
import { jsonResponse } from "../utils/http.js";

export async function handleApiUpload(request, env, config) {
  if (request.method !== "POST") return jsonResponse({ error: "Method Not Allowed" }, 405);
  const auth = await resolveUser(request, env, config);
  if (!auth || auth.via !== "apikey") return jsonResponse({ error: "需要有效的 API key" }, 401);
  try {
    const form = await request.formData();
    const { url } = await performUpload({ file: form.get("file"), user: auth.user, env, config });
    return jsonResponse({ url });
  } catch (e) {
    return jsonResponse({ error: e.message }, e.status || 500);
  }
}
