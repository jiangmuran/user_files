import { getUserByUsername } from "../db/users.js";
import { verifyPassword } from "../auth/password.js";
import { signSession, sessionCookieHeader, clearSessionCookieHeader } from "../auth/session.js";
import { isSameOrigin, resolveUser } from "../auth/middleware.js";
import { checkRateLimit } from "../auth/ratelimit.js";
import { htmlResponse, redirect } from "../utils/http.js";
import { loginPage } from "../views/loginPage.js";

const loginAttempts = new Map();

export async function handleLogin(request, env, config) {
  if (request.method === "GET") {
    if (await resolveUser(request, env, config)) return redirect("/admin");
    return htmlResponse(loginPage());
  }
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!isSameOrigin(request)) return htmlResponse(loginPage("非法请求来源"), 403);

  const ip = request.headers.get("CF-Connecting-IP") || "anon";
  const rl = checkRateLimit(loginAttempts, ip, { max: 10, windowMs: 60000, now: Date.now() });
  if (!rl.allowed) return htmlResponse(loginPage("尝试过于频繁，请稍后再试"), 429);

  const form = await request.formData();
  const username = (form.get("username") || "").toString().trim();
  const password = (form.get("password") || "").toString();
  const user = await getUserByUsername(env.DATABASE, username);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return htmlResponse(loginPage("用户名或密码错误"), 401);
  }
  const token = await signSession({ uid: user.id, role: user.role, ver: user.token_version }, config.sessionSecret);
  return redirect("/admin", 302, { "Set-Cookie": sessionCookieHeader(token) });
}

export async function handleLogout(request) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  return redirect("/login", 302, { "Set-Cookie": clearSessionCookieHeader() });
}
