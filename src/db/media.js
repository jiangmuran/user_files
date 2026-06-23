import { extensionOf } from "../auth/filetypes.js";

const IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tiff", "tif", "ico", "avif"];
const VIDEO_EXTS = ["mp4", "avi", "mov", "webm", "mkv", "wmv", "flv", "m4v", "mpeg", "mpg"];
const SORTS = {
  time_desc: "COALESCE(created_at,0) DESC",
  time_asc: "COALESCE(created_at,0) ASC",
  type: "extension ASC, COALESCE(created_at,0) DESC",
  size_desc: "COALESCE(size,0) DESC",
  size_asc: "COALESCE(size,0) ASC",
};

export async function insertMedia(db, { url, fileId, ownerId, filename, contentType, extension, size, createdAt }) {
  await db
    .prepare(
      `INSERT INTO media (url, fileId, owner_id, filename, content_type, extension, size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(url) DO NOTHING`
    )
    .bind(url, fileId, ownerId, filename ?? null, contentType ?? null, extension ?? null, size ?? null, createdAt)
    .run();
}

export async function getMediaFileId(db, url) {
  const row = await db.prepare("SELECT fileId FROM media WHERE url = ?").bind(url).first();
  return row ? row.fileId : null;
}

// 构造 WHERE 与 bind 列表（owner/search/types）
function buildFilters({ ownerId = null, search = "", types = [] }) {
  const where = [];
  const binds = [];
  if (ownerId !== null && ownerId !== undefined) {
    where.push("owner_id = ?");
    binds.push(ownerId);
  }
  if (search) {
    where.push("(filename LIKE ? OR url LIKE ?)");
    binds.push(`%${search}%`, `%${search}%`);
  }
  const set = new Set(types);
  const hasAll = set.size === 0 || (set.has("image") && set.has("video") && set.has("other"));
  if (!hasAll) {
    const clauses = [];
    const inExts = [];
    if (set.has("image")) inExts.push(...IMAGE_EXTS);
    if (set.has("video")) inExts.push(...VIDEO_EXTS);
    if (inExts.length) {
      clauses.push(`extension IN (${inExts.map(() => "?").join(",")})`);
      binds.push(...inExts);
    }
    if (set.has("other")) {
      const known = [...IMAGE_EXTS, ...VIDEO_EXTS];
      clauses.push(`(extension IS NULL OR extension NOT IN (${known.map(() => "?").join(",")}))`);
      binds.push(...known);
    }
    if (clauses.length) where.push(`(${clauses.join(" OR ")})`);
  }
  return { whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "", binds };
}

export async function queryMedia(db, opts = {}) {
  const { sort = "time_desc", limit = 50, offset = 0 } = opts;
  const { whereSql, binds } = buildFilters(opts);
  const orderSql = SORTS[sort] || SORTS.time_desc;
  const lim = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
  const off = Math.max(0, parseInt(offset, 10) || 0);
  const { results } = await db
    .prepare(`SELECT url, fileId, owner_id, filename, content_type, extension, size, created_at FROM media ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`)
    .bind(...binds, lim, off)
    .all();
  return results;
}

export async function countMedia(db, opts = {}) {
  const { whereSql, binds } = buildFilters(opts);
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM media ${whereSql}`).bind(...binds).first();
  return row.c;
}

export async function deleteMedia(db, urls, { ownerId = null } = {}) {
  if (!Array.isArray(urls) || urls.length === 0) return 0;
  const ph = urls.map(() => "?").join(",");
  let sql = `DELETE FROM media WHERE url IN (${ph})`;
  const binds = [...urls];
  if (ownerId !== null && ownerId !== undefined) {
    sql += " AND owner_id = ?";
    binds.push(ownerId);
  }
  const res = await db.prepare(sql).bind(...binds).run();
  return res.meta.changes;
}

export async function listMediaUrlsByOwner(db, ownerId) {
  const { results } = await db.prepare("SELECT url FROM media WHERE owner_id = ?").bind(ownerId).all();
  return results.map((r) => r.url);
}

export async function deleteMediaByOwner(db, ownerId) {
  const res = await db.prepare("DELETE FROM media WHERE owner_id = ?").bind(ownerId).run();
  return res.meta.changes;
}

export async function assignOwnerlessMedia(db, ownerId) {
  const res = await db.prepare("UPDATE media SET owner_id = ? WHERE owner_id IS NULL").bind(ownerId).run();
  return res.meta.changes;
}

export async function backfillMediaMetadata(db) {
  const { results } = await db.prepare("SELECT url FROM media WHERE created_at IS NULL OR extension IS NULL").all();
  for (const { url } of results) {
    const last = url.split("/").pop() || "";
    const ext = extensionOf(last);
    const tsStr = last.includes(".") ? last.slice(0, last.lastIndexOf(".")) : last;
    const ts = /^\d+$/.test(tsStr) ? parseInt(tsStr, 10) : null;
    await db.prepare("UPDATE media SET created_at = COALESCE(created_at, ?), extension = COALESCE(extension, ?) WHERE url = ?")
      .bind(ts, ext || null, url).run();
  }
}
