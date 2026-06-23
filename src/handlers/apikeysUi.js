import { resolveUser, isSameOrigin } from "../auth/middleware.js";
import { listApiKeys, createApiKey, deleteApiKey } from "../db/apikeys.js";
import { generateApiKey, hashApiKey } from "../auth/apikey.js";
import { htmlResponse, redirect } from "../utils/http.js";
import { apikeysPage } from "../views/apikeysPage.js";

async function sessionUser(request, env, config) {
  const auth = await resolveUser(request, env, config);
  return auth && auth.via === "session" ? auth.user : null;
}

export async function handleApiKeysPage(request, env, config, newKeyPlain = null) {
  const user = await sessionUser(request, env, config);
  if (!user) return redirect("/login");
  const keys = await listApiKeys(env.DATABASE, user.id);
  return htmlResponse(apikeysPage({ keys, newKeyPlain, user }), 200, { "Cache-Control": "no-store" });
}

export async function handleApiKeysAction(request, env, config, action) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const user = await sessionUser(request, env, config);
  if (!user) return redirect("/login");
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const formData = await request.formData();

  if (action === "create") {
    const name = (formData.get("name") || "").toString().trim().slice(0, 64) || null;
    const { plain, prefix } = generateApiKey();
    await createApiKey(env.DATABASE, { userId: user.id, name, keyHash: await hashApiKey(plain), keyPrefix: prefix, createdAt: Date.now() });
    return handleApiKeysPage(request, env, config, plain); // 一次性展示明文
  }
  if (action === "delete") {
    const id = parseInt(formData.get("id"), 10);
    if (Number.isInteger(id)) await deleteApiKey(env.DATABASE, id, user.id);
    return redirect("/apikeys");
  }
  return new Response("Not Found", { status: 404 });
}
