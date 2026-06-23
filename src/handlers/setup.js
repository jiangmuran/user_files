import { countUsers, createUser } from "../db/users.js";
import { assignOwnerlessMedia, backfillMediaMetadata } from "../db/media.js";
import { hashPassword } from "../auth/password.js";
import { signSession, sessionCookieHeader } from "../auth/session.js";
import { normalizeAllowedTypes } from "../auth/filetypes.js";
import { isSameOrigin } from "../auth/middleware.js";
import { htmlResponse, redirect } from "../utils/http.js";
import { setupPage } from "../views/setupPage.js";

export async function handleSetup(request, env, config) {
  const db = env.DATABASE;
  if ((await countUsers(db)) > 0) return redirect("/login");
  if (request.method === "GET") return htmlResponse(setupPage());
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  if (!isSameOrigin(request)) return htmlResponse(setupPage("非法请求来源"), 403);
  const form = await request.formData();
  const username = (form.get("username") || "").toString().trim();
  const password = (form.get("password") || "").toString();
  if (username.length < 3 || password.length < 6) return htmlResponse(setupPage("用户名≥3 位，密码≥6 位"), 400);
  if ((await countUsers(db)) > 0) return redirect("/login"); // 防竞态

  const { id } = await createUser(db, {
    username, passwordHash: await hashPassword(password), role: "admin",
    allowedTypes: normalizeAllowedTypes("*"), createdAt: Date.now(),
  });
  await assignOwnerlessMedia(db, id);
  await backfillMediaMetadata(db);
  const token = await signSession({ uid: id, role: "admin", ver: 0 }, config.sessionSecret);
  return redirect("/admin", 302, { "Set-Cookie": sessionCookieHeader(token) });
}
