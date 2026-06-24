import { resolveUser } from "../auth/middleware.js";
import { queryMedia, countMedia } from "../db/media.js";
import { listUsers } from "../db/users.js";
import { htmlResponse, redirect } from "../utils/http.js";
import { adminPage } from "../views/adminPage.js";

const PAGE_SIZES = [20, 50, 100];
const SORTS = ["time_desc", "time_asc", "type", "size_desc", "size_asc"];
const TYPES = ["image", "video", "other"];

export async function handleAdmin(request, env, config) {
  const auth = await resolveUser(request, env, config);
  if (!auth || auth.via !== "session") return redirect("/login");
  const isAdmin = auth.user.role === "admin";
  const q = new URL(request.url).searchParams;

  let pageSize = parseInt(q.get("size"), 10);
  if (!PAGE_SIZES.includes(pageSize)) pageSize = 50;
  let sort = q.get("sort");
  if (!SORTS.includes(sort)) sort = "time_desc";
  const search = (q.get("q") || "").trim().slice(0, 100);
  const types = q.getAll("type").filter((t) => TYPES.includes(t));

  let ownerId, viewUser;
  if (isAdmin) {
    const raw = q.get("user");
    const n = parseInt(raw, 10);
    if (raw && raw !== "all" && Number.isInteger(n)) { ownerId = n; viewUser = String(n); }
    else { ownerId = null; viewUser = "all"; }
  } else {
    ownerId = auth.user.id;
    viewUser = String(auth.user.id);
  }

  const filters = { ownerId, search, types };
  const total = await countMedia(env.DATABASE, filters);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  let page = parseInt(q.get("page"), 10);
  if (!Number.isInteger(page) || page < 1) page = 1;       // BUGFIX: NaN/负数
  if (page > totalPages) page = totalPages;                 // BUGFIX: 越界
  const offset = (page - 1) * pageSize;

  const rows = await queryMedia(env.DATABASE, { ...filters, sort, limit: pageSize, offset });
  const allFilteredKeys = total > 0 && total <= 500 ? (await queryMedia(env.DATABASE, { ...filters, sort, limit: 500, offset: 0 })).map((r) => r.url) : null;
  const users = isAdmin ? await listUsers(env.DATABASE) : [];

  return htmlResponse(
    adminPage({ rows, total, page, totalPages, pageSize, sort, search, types, isAdmin, users, viewUser, currentUser: auth.user, allFilteredKeys }),
    200,
    { "Cache-Control": "no-store" }
  );
}
