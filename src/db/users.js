export async function countUsers(db) {
  const row = await db.prepare("SELECT COUNT(*) AS c FROM users").first();
  return row.c;
}
export async function countAdmins(db) {
  const row = await db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").first();
  return row.c;
}
export async function getUserByUsername(db, username) {
  return await db.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
}
export async function getUserById(db, id) {
  return await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
}
export async function createUser(db, { username, passwordHash, role, allowedTypes, createdAt }) {
  const res = await db
    .prepare("INSERT INTO users (username, password_hash, role, allowed_types, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(username, passwordHash, role, allowedTypes, createdAt)
    .run();
  return { id: res.meta.last_row_id };
}
export async function listUsers(db) {
  const { results } = await db.prepare("SELECT * FROM users ORDER BY id ASC").all();
  return results;
}
export async function updateUserPassword(db, id, passwordHash) {
  await db.prepare("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?").bind(passwordHash, id).run();
}
export async function bumpTokenVersion(db, id) {
  await db.prepare("UPDATE users SET token_version = token_version + 1 WHERE id = ?").bind(id).run();
}
export async function updateUserAllowedTypes(db, id, allowedTypes) {
  await db.prepare("UPDATE users SET allowed_types = ? WHERE id = ?").bind(allowedTypes, id).run();
}
export async function updateUserRole(db, id, role) {
  await db.prepare("UPDATE users SET role = ? WHERE id = ?").bind(role, id).run();
}
export async function deleteUser(db, id) {
  await db.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
}
