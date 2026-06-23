export async function createApiKey(db, { userId, name, keyHash, keyPrefix, createdAt }) {
  const res = await db
    .prepare("INSERT INTO api_keys (user_id, name, key_hash, key_prefix, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(userId, name ?? null, keyHash, keyPrefix, createdAt)
    .run();
  return { id: res.meta.last_row_id };
}
export async function getApiKeyByHash(db, keyHash) {
  return await db.prepare("SELECT * FROM api_keys WHERE key_hash = ?").bind(keyHash).first();
}
export async function listApiKeys(db, userId) {
  const { results } = await db
    .prepare("SELECT id, name, key_prefix, created_at, last_used_at FROM api_keys WHERE user_id = ? ORDER BY id DESC")
    .bind(userId)
    .all();
  return results;
}
export async function deleteApiKey(db, id, userId) {
  const res = await db.prepare("DELETE FROM api_keys WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return res.meta.changes > 0;
}
export async function touchApiKey(db, id, ts) {
  await db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").bind(ts, id).run();
}
