import { resolveUser, isSameOrigin } from "../auth/middleware.js";
import {
  listUsers, getUserById, getUserByUsername, createUser,
  updateUserRole, updateUserAllowedTypes, updateUserPassword, deleteUserCascade, countAdmins,
} from "../db/users.js";
import { listMediaUrlsByOwner } from "../db/media.js";
import { hashPassword } from "../auth/password.js";
import { normalizeAllowedTypes } from "../auth/filetypes.js";
import { htmlResponse, redirect } from "../utils/http.js";
import { usersPage } from "../views/usersPage.js";

const ERR_MESSAGES = {
  invalid: "用户名≥3位、密码≥6位",
  exists: "用户名已存在",
  notfound: "用户不存在",
  self: "不能删除自己",
  lastadmin: "不能删除或降级最后一个管理员",
};

async function guardAdmin(request, env, config) {
  const auth = await resolveUser(request, env, config);
  if (!auth || auth.via !== "session") return { fail: redirect("/login") };
  if (auth.user.role !== "admin") return { fail: new Response("Forbidden", { status: 403 }) };
  return { auth };
}

export async function handleUsersPage(request, env, config) {
  const g = await guardAdmin(request, env, config);
  if (g.fail) return g.fail;
  const users = await listUsers(env.DATABASE);
  const error = ERR_MESSAGES[new URL(request.url).searchParams.get("err")] || "";
  return htmlResponse(usersPage({ users, currentUser: g.auth.user, error }), 200, { "Cache-Control": "no-store" });
}

export async function handleUsersAction(request, env, config, action) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const g = await guardAdmin(request, env, config);
  if (g.fail) return g.fail;
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const db = env.DATABASE;
  const formData = await request.formData();

  if (action === "create") {
    const username = (formData.get("username") || "").toString().trim();
    const password = (formData.get("password") || "").toString();
    const role = formData.get("role") === "admin" ? "admin" : "user";
    const allowedTypes = normalizeAllowedTypes((formData.get("allowed_types") || "*").toString());
    if (username.length < 3 || password.length < 6) return redirect("/users?err=invalid");
    if (await getUserByUsername(db, username)) return redirect("/users?err=exists");
    await createUser(db, { username, passwordHash: await hashPassword(password), role, allowedTypes, createdAt: Date.now() });
    return redirect("/users");
  }

  const id = parseInt(formData.get("id"), 10);
  if (!Number.isInteger(id)) return redirect("/users?err=invalid");
  const target = await getUserById(db, id);
  if (!target) return redirect("/users?err=notfound");

  if (action === "delete") {
    if (target.id === g.auth.user.id) return redirect("/users?err=self");
    if (target.role === "admin" && (await countAdmins(db)) <= 1) return redirect("/users?err=lastadmin");
    // Hardening (beyond brief): production D1 may not enforce FK ON DELETE CASCADE,
    // so explicitly remove the user's media and api_keys rather than relying solely
    // on the schema cascade. The DB writes run in a single D1 transaction (batch) so a
    // mid-way failure can't orphan rows; cache eviction happens AFTER the batch commits
    // (the Cache API isn't transactional).
    const urls = await listMediaUrlsByOwner(db, id);
    await deleteUserCascade(db, id);
    const cache = caches.default;
    await Promise.all(urls.map((u) => cache.delete(new Request(u))));
    return redirect("/users");
  }

  if (action === "update") {
    const field = formData.get("field");
    if (field === "role") {
      const role = formData.get("value") === "admin" ? "admin" : "user";
      if (target.role === "admin" && role !== "admin" && (await countAdmins(db)) <= 1) return redirect("/users?err=lastadmin");
      await updateUserRole(db, id, role);
    } else if (field === "allowed_types") {
      await updateUserAllowedTypes(db, id, normalizeAllowedTypes((formData.get("value") || "*").toString()));
    } else if (field === "password") {
      const pw = (formData.get("value") || "").toString();
      if (pw.length < 6) return redirect("/users?err=invalid");
      await updateUserPassword(db, id, await hashPassword(pw));
    }
    return redirect("/users");
  }
  return new Response("Not Found", { status: 404 });
}
