# user_files 多用户化改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把单文件 Telegraph 图床改造成 wrangler 多文件项目，加入多用户、API key、安全密码存储、增强后台分页与文件类型限制，并修复已知 bug。

**Architecture:** Cloudflare Worker（ES modules，`src/index.js` 入口 + 路由分发到 `handlers/`，逻辑下沉到 `auth/`、`db/`、`utils/`，HTML 在 `views/`）。鉴权：网页端用无状态 HMAC 签名 cookie，程序化上传用 API key（仅上传）。存储沿用 D1 + Telegram，新增 `users`/`api_keys` 表并给 `media` 加 owner 与元数据。自底向上构建：先 crypto/db 原语（单测），再路由装配（集成测试）。

**Tech Stack:** Cloudflare Workers, D1 (SQLite), wrangler, WebCrypto (PBKDF2-SHA256 / HMAC-SHA256 / SHA-256), Vitest + `@cloudflare/vitest-pool-workers`, Telegram Bot API。

## Global Constraints

- D1 binding 名固定 `DATABASE`（不可改，兼容现有部署）。
- 必填 secret：`SESSION_SECRET`、`TG_BOT_TOKEN`、`TG_CHAT_ID`；变量：`DOMAIN`；可选：`MAX_SIZE_MB`（默认 20）。
- 移除 `USERNAME`/`PASSWORD`/`ADMIN_PATH`/`ENABLE_AUTH`（不再使用）。
- 密码哈希：PBKDF2-SHA256，迭代 `150000`，salt 16 字节随机，存储格式 `pbkdf2$<iter>$<saltB64url>$<hashB64url>`。
- 会话 cookie 名固定 `uf_session`；属性 `HttpOnly; Secure; SameSite=Strict; Path=/`；默认 `Max-Age=604800`（7 天）。
- API key 明文格式 `uf_<base64url(32 random bytes)>`；DB 仅存 `sha256(plain)` 的 hex；明文只在创建时回显一次。
- 文件类型类别仅三类：`image` / `video` / `other`；`allowed_types` 取 `*` 或这些类别的逗号分隔子集。
- 角色仅 `admin` / `user`。无公开注册。后台路径固定 `/admin`。
- 所有 SQL 必须参数化 bind（禁止字符串拼接进 SQL，含 LIMIT/OFFSET）。
- 所有写操作（POST）做同源校验（Origin/Referer），cookie 走 SameSite=Strict；API key 路径免 CSRF。
- 测试框架：Vitest + `@cloudflare/vitest-pool-workers`；每个测试隔离 D1 并在 setup `applyD1Migrations`。

---

## File Structure

| 文件 | 职责 |
|------|------|
| `wrangler.toml` | worker 配置：`main`、D1 binding、vars、compatibility_date |
| `package.json` | scripts + devDeps（wrangler / vitest / pool-workers） |
| `vitest.config.js` | workers pool 配置 + 读取 migrations 注入测试 |
| `migrations/0001_users_apikeys.sql` | 建 `users`、`api_keys` |
| `migrations/0002_alter_media.sql` | `media` 加列 + 索引 |
| `src/index.js` | 入口：`export default { fetch }`，构造 config → 调 router |
| `src/config.js` | 从 env 提取配置对象 |
| `src/router.js` | 路由表 + 分发 |
| `src/utils/html.js` | `escapeHtml` |
| `src/utils/http.js` | `jsonResponse` / `htmlResponse` / `redirect` / `getCookie` / 错误响应 |
| `src/auth/password.js` | `hashPassword` / `verifyPassword` |
| `src/auth/session.js` | `signSession` / `verifySession` / `sessionCookieHeader` / `clearSessionCookieHeader` |
| `src/auth/apikey.js` | `generateApiKey` / `hashApiKey` / `extractApiKey` |
| `src/auth/filetypes.js` | `extensionOf` / `categoryForExtension` / `isTypeAllowed` / `normalizeAllowedTypes` |
| `src/auth/middleware.js` | `resolveUser` / `requireAuth` / `requireAdmin` / `isSameOrigin` |
| `src/db/users.js` | users 表 CRUD |
| `src/db/apikeys.js` | api_keys 表 CRUD |
| `src/db/media.js` | media 插入 / 查询（分页筛选）/ 删除（owner 校验）/ 迁移辅助 |
| `src/handlers/*.js` | 各路由 handler（home/login/setup/upload/apiUpload/admin/users/apikeysUi/delete/image/bing） |
| `src/views/*.js` | HTML 模板函数 |
| `test/unit/*.test.js` | 原语单测 |
| `test/integration/*.test.js` | 路由集成测试 |

---

## Phase 1 — 项目脚手架与测试基座

### Task 1: wrangler + vitest 脚手架与冒烟测试

**Files:**
- Create: `wrangler.toml`
- Create: `package.json`
- Create: `vitest.config.js`
- Create: `src/index.js`
- Create: `migrations/0001_users_apikeys.sql` (空占位，仅含注释，下一任务填充)
- Test: `test/unit/smoke.test.js`

**Interfaces:**
- Consumes: 无
- Produces: 可运行的 worker 入口 `export default { fetch(request, env) }`；`npm test` 可跑通。

- [ ] **Step 1: 写 `package.json`**

```json
{
  "name": "user-files",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "migrate:local": "wrangler d1 migrations apply DATABASE --local",
    "migrate:remote": "wrangler d1 migrations apply DATABASE --remote"
  },
  "devDependencies": {
    "wrangler": "^3.90.0",
    "vitest": "~2.1.0",
    "@cloudflare/vitest-pool-workers": "^0.5.0"
  }
}
```

- [ ] **Step 2: 写 `wrangler.toml`**

```toml
name = "user-files"
main = "src/index.js"
compatibility_date = "2024-11-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DATABASE"
database_name = "images"
database_id = "REPLACE_WITH_YOUR_D1_ID"
migrations_dir = "migrations"

[vars]
DOMAIN = "example.workers.dev"
# secrets（用 `wrangler secret put`）：SESSION_SECRET / TG_BOT_TOKEN / TG_CHAT_ID
```

- [ ] **Step 3: 写 `vitest.config.js`（读取 migrations 注入测试 D1）**

```js
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
import path from "node:path";

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, "migrations"));
  return {
    test: {
      setupFiles: ["./test/apply-migrations.js"],
      poolOptions: {
        workers: {
          singleWorker: true,
          miniflare: {
            compatibilityDate: "2024-11-01",
            compatibilityFlags: ["nodejs_compat"],
            d1Databases: ["DATABASE"],
            bindings: { TEST_MIGRATIONS: migrations, SESSION_SECRET: "test-secret-please-change" },
          },
          wrangler: { configPath: "./wrangler.toml" },
        },
      },
    },
  };
});
```

- [ ] **Step 4: 写测试 setup `test/apply-migrations.js`**

```js
import { applyD1Migrations, env } from "cloudflare:test";

// 每个测试文件运行前把 migrations 应用到隔离的 D1
await applyD1Migrations(env.DATABASE, env.TEST_MIGRATIONS);
```

- [ ] **Step 5: 写 `src/index.js`（最小入口）**

```js
export default {
  async fetch(request, env) {
    return new Response("user-files booting", { status: 200 });
  },
};
```

- [ ] **Step 6: 写冒烟测试 `test/unit/smoke.test.js`**

```js
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../../src/index.js";

describe("smoke", () => {
  it("responds 200 and DATABASE binding exists", async () => {
    const req = new Request("https://example.com/");
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(env.DATABASE).toBeDefined();
  });
});
```

- [ ] **Step 7: 占位 migration `migrations/0001_users_apikeys.sql`**

```sql
-- filled in Task 2
SELECT 1;
```

- [ ] **Step 8: 跑测试确认通过**

Run: `npm install && npm test`
Expected: PASS（smoke 1 passed）

- [ ] **Step 9: Commit**

```bash
git add package.json wrangler.toml vitest.config.js src/index.js test/ migrations/
git commit -m "chore: scaffold wrangler project + vitest workers pool"
```

---

### Task 2: 数据库迁移（users / api_keys / media 改造）

**Files:**
- Modify: `migrations/0001_users_apikeys.sql`
- Create: `migrations/0002_alter_media.sql`
- Test: `test/unit/schema.test.js`

**Interfaces:**
- Consumes: 测试基座（Task 1）
- Produces: 表 `users(id,username,password_hash,role,allowed_types,token_version,created_at)`、`api_keys(id,user_id,name,key_hash,key_prefix,created_at,last_used_at)`、`media` 新列 `owner_id,created_at,filename,content_type,extension,size`。

- [ ] **Step 1: 写 schema 测试 `test/unit/schema.test.js`**

```js
import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";

async function columns(table) {
  const { results } = await env.DATABASE.prepare(`PRAGMA table_info(${table})`).all();
  return results.map((r) => r.name);
}

describe("schema", () => {
  it("users table has expected columns", async () => {
    const cols = await columns("users");
    expect(cols).toEqual(
      expect.arrayContaining(["id", "username", "password_hash", "role", "allowed_types", "token_version", "created_at"])
    );
  });
  it("api_keys table has expected columns", async () => {
    const cols = await columns("api_keys");
    expect(cols).toEqual(
      expect.arrayContaining(["id", "user_id", "name", "key_hash", "key_prefix", "created_at", "last_used_at"])
    );
  });
  it("media table gained owner_id and metadata columns", async () => {
    const cols = await columns("media");
    expect(cols).toEqual(
      expect.arrayContaining(["url", "fileId", "owner_id", "created_at", "filename", "content_type", "extension", "size"])
    );
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- schema`
Expected: FAIL（media 无 owner_id 等列；users/api_keys 不存在）

- [ ] **Step 3: 填充 `migrations/0001_users_apikeys.sql`**

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  allowed_types TEXT NOT NULL DEFAULT '*',
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
```

- [ ] **Step 4: 写 `migrations/0002_alter_media.sql`**

```sql
-- media 原为 (url TEXT PRIMARY KEY, fileId TEXT NOT NULL)
ALTER TABLE media ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE media ADD COLUMN created_at INTEGER;
ALTER TABLE media ADD COLUMN filename TEXT;
ALTER TABLE media ADD COLUMN content_type TEXT;
ALTER TABLE media ADD COLUMN extension TEXT;
ALTER TABLE media ADD COLUMN size INTEGER;
CREATE INDEX IF NOT EXISTS idx_media_owner_created ON media(owner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_media_extension ON media(extension);
```

> 注：若现有部署的 `media` 表尚不存在（全新库），需先有建表语句。为兼容老库（已存在 media），这里只 ALTER。全新部署请先在 D1 执行 `CREATE TABLE media (url TEXT PRIMARY KEY, fileId TEXT NOT NULL);`（README 升级指引会写明），或把该 CREATE 放进 0001 之前的 0000 迁移。实现时新增 `migrations/0000_init_media.sql` 内容：`CREATE TABLE IF NOT EXISTS media (url TEXT PRIMARY KEY, fileId TEXT NOT NULL);`

- [ ] **Step 5: 新增 `migrations/0000_init_media.sql`（保证 media 存在）**

```sql
CREATE TABLE IF NOT EXISTS media (
  url TEXT PRIMARY KEY,
  fileId TEXT NOT NULL
);
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npm test -- schema`
Expected: PASS（3 passed）

- [ ] **Step 7: Commit**

```bash
git add migrations/
git commit -m "feat: add users/api_keys tables and media metadata columns"
```

---

## Phase 2 — Crypto 与工具原语（单测）

### Task 3: 密码哈希 `auth/password.js`

**Files:**
- Create: `src/auth/password.js`
- Test: `test/unit/password.test.js`

**Interfaces:**
- Produces:
  - `async hashPassword(password: string): Promise<string>` → `pbkdf2$150000$<saltB64url>$<hashB64url>`
  - `async verifyPassword(password: string, stored: string): Promise<boolean>`（constant-time 比较；格式非法返回 false）

- [ ] **Step 1: 写测试 `test/unit/password.test.js`**

```js
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../../src/auth/password.js";

describe("password", () => {
  it("hash format is pbkdf2$iter$salt$hash", async () => {
    const h = await hashPassword("hunter2");
    expect(h.split("$")).toHaveLength(4);
    expect(h.startsWith("pbkdf2$150000$")).toBe(true);
  });
  it("verifies correct password", async () => {
    const h = await hashPassword("p@ss:word");
    expect(await verifyPassword("p@ss:word", h)).toBe(true);
  });
  it("rejects wrong password", async () => {
    const h = await hashPassword("hunter2");
    expect(await verifyPassword("hunter3", h)).toBe(false);
  });
  it("rejects malformed stored hash", async () => {
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
  it("two hashes of same password differ (random salt)", async () => {
    expect(await hashPassword("a")).not.toBe(await hashPassword("a"));
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- password`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/auth/password.js`**

```js
const ITERATIONS = 150000;
const KEYLEN_BITS = 256;
const enc = new TextEncoder();

function toB64url(bytes) {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function pbkdf2(password, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    KEYLEN_BITS
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64url(salt)}$${toB64url(hash)}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, iterStr, saltB64, hashB64] = String(stored).split("$");
    if (scheme !== "pbkdf2") return false;
    const iterations = parseInt(iterStr, 10);
    if (!Number.isInteger(iterations) || iterations <= 0) return false;
    const salt = fromB64url(saltB64);
    const expected = fromB64url(hashB64);
    const actual = await pbkdf2(password, salt, iterations);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- password`
Expected: PASS（5 passed）

- [ ] **Step 5: Commit**

```bash
git add src/auth/password.js test/unit/password.test.js
git commit -m "feat: PBKDF2-SHA256 password hashing"
```

---

### Task 4: 会话签名 `auth/session.js`

**Files:**
- Create: `src/auth/session.js`
- Test: `test/unit/session.test.js`

**Interfaces:**
- Produces:
  - `async signSession(payload: {uid:number, role:string, ver:number}, secret: string, ttlSec=604800): Promise<string>` → `<b64url(payloadJson)>.<b64url(hmac)>`，payload 内含 `exp`
  - `async verifySession(token: string, secret: string): Promise<{uid,role,ver,exp}|null>`（验签 + 过期检查；失败 null）
  - `const SESSION_COOKIE = "uf_session"`
  - `sessionCookieHeader(token: string, maxAgeSec=604800): string`
  - `clearSessionCookieHeader(): string`
  - 内部时间用 `nowSec()`（`Math.floor(Date.now()/1000)`）

- [ ] **Step 1: 写测试 `test/unit/session.test.js`**

```js
import { describe, it, expect } from "vitest";
import { signSession, verifySession, sessionCookieHeader, clearSessionCookieHeader, SESSION_COOKIE } from "../../src/auth/session.js";

const SECRET = "test-secret";

describe("session", () => {
  it("round-trips a valid token", async () => {
    const token = await signSession({ uid: 1, role: "admin", ver: 0 }, SECRET);
    const payload = await verifySession(token, SECRET);
    expect(payload).toMatchObject({ uid: 1, role: "admin", ver: 0 });
    expect(payload.exp).toBeGreaterThan(0);
  });
  it("rejects tampered payload", async () => {
    const token = await signSession({ uid: 1, role: "admin", ver: 0 }, SECRET);
    const [, sig] = token.split(".");
    const forged = btoa(JSON.stringify({ uid: 1, role: "admin", ver: 0, exp: 9999999999 })).replace(/=+$/, "") + "." + sig;
    expect(await verifySession(forged, SECRET)).toBeNull();
  });
  it("rejects wrong secret", async () => {
    const token = await signSession({ uid: 1, role: "user", ver: 0 }, SECRET);
    expect(await verifySession(token, "other")).toBeNull();
  });
  it("rejects expired token", async () => {
    const token = await signSession({ uid: 1, role: "user", ver: 0 }, SECRET, -1);
    expect(await verifySession(token, SECRET)).toBeNull();
  });
  it("cookie header sets HttpOnly Secure SameSite=Strict", () => {
    const h = sessionCookieHeader("abc.def");
    expect(h).toContain(`${SESSION_COOKIE}=abc.def`);
    expect(h).toMatch(/HttpOnly/);
    expect(h).toMatch(/Secure/);
    expect(h).toMatch(/SameSite=Strict/);
  });
  it("clear header expires the cookie", () => {
    expect(clearSessionCookieHeader()).toMatch(/Max-Age=0/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- session`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/auth/session.js`**

```js
export const SESSION_COOKIE = "uf_session";
const enc = new TextEncoder();
const nowSec = () => Math.floor(Date.now() / 1000);

function toB64url(bytes) {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function strToB64url(str) {
  return toB64url(enc.encode(str));
}
function b64urlToStr(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64);
}
function timingSafeEqualStr(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function hmac(data, secret) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return toB64url(sig);
}

export async function signSession(payload, secret, ttlSec = 604800) {
  const body = { ...payload, exp: nowSec() + ttlSec };
  const p = strToB64url(JSON.stringify(body));
  const sig = await hmac(p, secret);
  return `${p}.${sig}`;
}

export async function verifySession(token, secret) {
  try {
    if (typeof token !== "string" || !token.includes(".")) return null;
    const [p, sig] = token.split(".");
    const expected = await hmac(p, secret);
    if (!timingSafeEqualStr(sig, expected)) return null;
    const payload = JSON.parse(b64urlToStr(p));
    if (typeof payload.exp !== "number" || payload.exp < nowSec()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieHeader(token, maxAgeSec = 604800) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAgeSec}`;
}
export function clearSessionCookieHeader() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- session`
Expected: PASS（6 passed）

- [ ] **Step 5: Commit**

```bash
git add src/auth/session.js test/unit/session.test.js
git commit -m "feat: stateless HMAC-signed session cookies"
```

---

### Task 5: API key `auth/apikey.js`

**Files:**
- Create: `src/auth/apikey.js`
- Test: `test/unit/apikey.test.js`

**Interfaces:**
- Produces:
  - `generateApiKey(): { plain: string, prefix: string }`（plain=`uf_<b64url(32B)>`，prefix=plain 前 12 字符）
  - `async hashApiKey(plain: string): Promise<string>`（sha256 hex）
  - `extractApiKey(request: Request): string|null`（先 `Authorization: Bearer`，再 `X-API-Key`）

- [ ] **Step 1: 写测试 `test/unit/apikey.test.js`**

```js
import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey, extractApiKey } from "../../src/auth/apikey.js";

describe("apikey", () => {
  it("generates uf_-prefixed key with matching prefix", () => {
    const { plain, prefix } = generateApiKey();
    expect(plain.startsWith("uf_")).toBe(true);
    expect(prefix).toBe(plain.slice(0, 12));
    expect(plain.length).toBeGreaterThan(20);
  });
  it("hash is stable 64-hex", async () => {
    const h1 = await hashApiKey("uf_abc");
    const h2 = await hashApiKey("uf_abc");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
  it("extracts from Authorization: Bearer", () => {
    const req = new Request("https://x/", { headers: { Authorization: "Bearer uf_xyz" } });
    expect(extractApiKey(req)).toBe("uf_xyz");
  });
  it("extracts from X-API-Key", () => {
    const req = new Request("https://x/", { headers: { "X-API-Key": "uf_xyz" } });
    expect(extractApiKey(req)).toBe("uf_xyz");
  });
  it("returns null when absent", () => {
    expect(extractApiKey(new Request("https://x/"))).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- apikey`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/auth/apikey.js`**

```js
const enc = new TextEncoder();

function toB64url(bytes) {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateApiKey() {
  const plain = "uf_" + toB64url(crypto.getRandomValues(new Uint8Array(32)));
  return { plain, prefix: plain.slice(0, 12) };
}

export async function hashApiKey(plain) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(plain));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function extractApiKey(request) {
  const auth = request.headers.get("Authorization");
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim() || null;
  const x = request.headers.get("X-API-Key");
  return x ? x.trim() : null;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- apikey`
Expected: PASS（5 passed）

- [ ] **Step 5: Commit**

```bash
git add src/auth/apikey.js test/unit/apikey.test.js
git commit -m "feat: API key generation/hashing/extraction"
```

---

### Task 6: 文件类型策略 `auth/filetypes.js`

**Files:**
- Create: `src/auth/filetypes.js`
- Test: `test/unit/filetypes.test.js`

**Interfaces:**
- Produces:
  - `extensionOf(filename: string): string`（小写，无点；无扩展名返回 ""）
  - `categoryForExtension(ext: string): "image"|"video"|"other"`
  - `normalizeAllowedTypes(input: string): string`（清洗为 `*` 或排序去重的 `image,video,other` 子集；空/非法→`*`）
  - `isTypeAllowed(filename: string, allowedTypes: string): boolean`

- [ ] **Step 1: 写测试 `test/unit/filetypes.test.js`**

```js
import { describe, it, expect } from "vitest";
import { extensionOf, categoryForExtension, normalizeAllowedTypes, isTypeAllowed } from "../../src/auth/filetypes.js";

describe("filetypes", () => {
  it("extensionOf", () => {
    expect(extensionOf("a.PNG")).toBe("png");
    expect(extensionOf("archive.tar.gz")).toBe("gz");
    expect(extensionOf("noext")).toBe("");
  });
  it("categoryForExtension", () => {
    expect(categoryForExtension("jpg")).toBe("image");
    expect(categoryForExtension("mp4")).toBe("video");
    expect(categoryForExtension("pdf")).toBe("other");
  });
  it("normalizeAllowedTypes", () => {
    expect(normalizeAllowedTypes("*")).toBe("*");
    expect(normalizeAllowedTypes("video,image,image")).toBe("image,video");
    expect(normalizeAllowedTypes("bogus")).toBe("*");
    expect(normalizeAllowedTypes("")).toBe("*");
  });
  it("isTypeAllowed honors policy", () => {
    expect(isTypeAllowed("a.png", "*")).toBe(true);
    expect(isTypeAllowed("a.png", "image")).toBe(true);
    expect(isTypeAllowed("a.mp4", "image")).toBe(false);
    expect(isTypeAllowed("a.pdf", "image,video")).toBe(false);
    expect(isTypeAllowed("a.pdf", "other")).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- filetypes`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/auth/filetypes.js`**

```js
const IMAGE = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tiff", "tif", "ico", "avif"]);
const VIDEO = new Set(["mp4", "avi", "mov", "webm", "mkv", "wmv", "flv", "m4v", "mpeg", "mpg"]);
const CATEGORIES = ["image", "video", "other"];

export function extensionOf(filename) {
  const name = String(filename || "");
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function categoryForExtension(ext) {
  if (IMAGE.has(ext)) return "image";
  if (VIDEO.has(ext)) return "video";
  return "other";
}

export function normalizeAllowedTypes(input) {
  if (!input || input === "*") return input === "*" ? "*" : "*";
  const parts = String(input)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => CATEGORIES.includes(s));
  const uniq = [...new Set(parts)].sort();
  return uniq.length ? uniq.join(",") : "*";
}

export function isTypeAllowed(filename, allowedTypes) {
  if (!allowedTypes || allowedTypes === "*") return true;
  const allowed = new Set(allowedTypes.split(",").map((s) => s.trim()));
  return allowed.has(categoryForExtension(extensionOf(filename)));
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- filetypes`
Expected: PASS（4 passed）

- [ ] **Step 5: Commit**

```bash
git add src/auth/filetypes.js test/unit/filetypes.test.js
git commit -m "feat: per-user file type policy helpers"
```

---

### Task 7: HTTP/HTML 工具 `utils/http.js` + `utils/html.js`

**Files:**
- Create: `src/utils/html.js`
- Create: `src/utils/http.js`
- Test: `test/unit/http.test.js`

**Interfaces:**
- Produces:
  - html.js: `escapeHtml(text): string`
  - http.js: `jsonResponse(data, status=200)`、`htmlResponse(html, status=200, headers={})`、`redirect(location, status=302, headers={})`、`getCookie(request, name): string|null`

- [ ] **Step 1: 写测试 `test/unit/http.test.js`**

```js
import { describe, it, expect } from "vitest";
import { escapeHtml } from "../../src/utils/html.js";
import { jsonResponse, redirect, getCookie } from "../../src/utils/http.js";

describe("utils", () => {
  it("escapeHtml escapes dangerous chars", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });
  it("jsonResponse sets content-type and status", async () => {
    const res = jsonResponse({ ok: true }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(await res.json()).toEqual({ ok: true });
  });
  it("redirect sets Location", () => {
    const res = redirect("/login");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/login");
  });
  it("getCookie parses a named cookie", () => {
    const req = new Request("https://x/", { headers: { Cookie: "a=1; uf_session=tok.en; b=2" } });
    expect(getCookie(req, "uf_session")).toBe("tok.en");
    expect(getCookie(req, "missing")).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- http`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/utils/html.js`**

```js
const MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (m) => MAP[m]);
}
```

- [ ] **Step 4: 实现 `src/utils/http.js`**

```js
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function htmlResponse(html, status = 200, headers = {}) {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...headers },
  });
}

export function redirect(location, status = 302, headers = {}) {
  return new Response(null, { status, headers: { Location: location, ...headers } });
}

export function getCookie(request, name) {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test -- http`
Expected: PASS（4 passed）

- [ ] **Step 6: Commit**

```bash
git add src/utils/ test/unit/http.test.js
git commit -m "feat: html escaping + http response helpers"
```

---

## Phase 3 — 数据访问层（集成测试，跑真 D1）

### Task 8: 用户表访问 `db/users.js`

**Files:**
- Create: `src/db/users.js`
- Test: `test/integration/users-db.test.js`

**Interfaces:**
- Produces（`db` = D1 binding）:
  - `countUsers(db): Promise<number>`
  - `countAdmins(db): Promise<number>`
  - `getUserByUsername(db, username): Promise<user|null>`
  - `getUserById(db, id): Promise<user|null>`
  - `createUser(db, {username, passwordHash, role, allowedTypes, createdAt}): Promise<{id:number}>`
  - `listUsers(db): Promise<user[]>`（按 id 升序）
  - `updateUserPassword(db, id, passwordHash): Promise<void>`（同时 token_version+1）
  - `bumpTokenVersion(db, id): Promise<void>`
  - `updateUserAllowedTypes(db, id, allowedTypes): Promise<void>`
  - `updateUserRole(db, id, role): Promise<void>`
  - `deleteUser(db, id): Promise<void>`
  - user 形如 `{id, username, password_hash, role, allowed_types, token_version, created_at}`

- [ ] **Step 1: 写测试 `test/integration/users-db.test.js`**

```js
import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import * as users from "../../src/db/users.js";

beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM users").run();
});

describe("db/users", () => {
  it("counts, creates, fetches", async () => {
    expect(await users.countUsers(env.DATABASE)).toBe(0);
    const { id } = await users.createUser(env.DATABASE, {
      username: "alice", passwordHash: "h", role: "admin", allowedTypes: "*", createdAt: 1000,
    });
    expect(id).toBeGreaterThan(0);
    expect(await users.countUsers(env.DATABASE)).toBe(1);
    expect(await users.countAdmins(env.DATABASE)).toBe(1);
    const byName = await users.getUserByUsername(env.DATABASE, "alice");
    expect(byName.role).toBe("admin");
    const byId = await users.getUserById(env.DATABASE, id);
    expect(byId.username).toBe("alice");
  });
  it("updateUserPassword bumps token_version", async () => {
    const { id } = await users.createUser(env.DATABASE, { username: "b", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 1 });
    await users.updateUserPassword(env.DATABASE, id, "h2");
    const u = await users.getUserById(env.DATABASE, id);
    expect(u.password_hash).toBe("h2");
    expect(u.token_version).toBe(1);
  });
  it("update role / allowed_types / delete", async () => {
    const { id } = await users.createUser(env.DATABASE, { username: "c", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 1 });
    await users.updateUserRole(env.DATABASE, id, "admin");
    await users.updateUserAllowedTypes(env.DATABASE, id, "image");
    let u = await users.getUserById(env.DATABASE, id);
    expect(u.role).toBe("admin");
    expect(u.allowed_types).toBe("image");
    await users.deleteUser(env.DATABASE, id);
    expect(await users.getUserById(env.DATABASE, id)).toBeNull();
  });
  it("username is unique", async () => {
    await users.createUser(env.DATABASE, { username: "dup", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 1 });
    await expect(
      users.createUser(env.DATABASE, { username: "dup", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 1 })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- users-db`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/db/users.js`**

```js
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- users-db`
Expected: PASS（4 passed）

- [ ] **Step 5: Commit**

```bash
git add src/db/users.js test/integration/users-db.test.js
git commit -m "feat: users DB access layer"
```

---

### Task 9: API key 表访问 `db/apikeys.js`

**Files:**
- Create: `src/db/apikeys.js`
- Test: `test/integration/apikeys-db.test.js`

**Interfaces:**
- Produces:
  - `createApiKey(db, {userId, name, keyHash, keyPrefix, createdAt}): Promise<{id:number}>`
  - `getApiKeyByHash(db, keyHash): Promise<row|null>`（row 含 `user_id`）
  - `listApiKeys(db, userId): Promise<row[]>`（不含敏感 hash，含 id/name/key_prefix/created_at/last_used_at）
  - `deleteApiKey(db, id, userId): Promise<boolean>`（仅删属于该 user 的，返回是否删到）
  - `touchApiKey(db, id, ts): Promise<void>`

- [ ] **Step 1: 写测试 `test/integration/apikeys-db.test.js`**

```js
import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import * as apikeys from "../../src/db/apikeys.js";
import * as users from "../../src/db/users.js";

let uid;
beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM api_keys").run();
  await env.DATABASE.prepare("DELETE FROM users").run();
  ({ id: uid } = await users.createUser(env.DATABASE, { username: "u", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 1 }));
});

describe("db/apikeys", () => {
  it("create, lookup by hash, list, touch, delete", async () => {
    const { id } = await apikeys.createApiKey(env.DATABASE, { userId: uid, name: "k1", keyHash: "abc", keyPrefix: "uf_abc", createdAt: 10 });
    const found = await apikeys.getApiKeyByHash(env.DATABASE, "abc");
    expect(found.user_id).toBe(uid);
    await apikeys.touchApiKey(env.DATABASE, id, 999);
    const list = await apikeys.listApiKeys(env.DATABASE, uid);
    expect(list).toHaveLength(1);
    expect(list[0].last_used_at).toBe(999);
    expect(list[0].key_hash).toBeUndefined();
    expect(await apikeys.deleteApiKey(env.DATABASE, id, uid)).toBe(true);
    expect(await apikeys.listApiKeys(env.DATABASE, uid)).toHaveLength(0);
  });
  it("cannot delete another user's key", async () => {
    const { id } = await apikeys.createApiKey(env.DATABASE, { userId: uid, name: "k", keyHash: "z", keyPrefix: "uf_z", createdAt: 1 });
    expect(await apikeys.deleteApiKey(env.DATABASE, id, uid + 999)).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- apikeys-db`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/db/apikeys.js`**

```js
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- apikeys-db`
Expected: PASS（2 passed）

- [ ] **Step 5: Commit**

```bash
git add src/db/apikeys.js test/integration/apikeys-db.test.js
git commit -m "feat: api_keys DB access layer"
```

---

### Task 10: media 访问层 `db/media.js`（分页/搜索/筛选/owner 校验）

**Files:**
- Create: `src/db/media.js`
- Test: `test/integration/media-db.test.js`

**Interfaces:**
- Produces:
  - `insertMedia(db, {url, fileId, ownerId, filename, contentType, extension, size, createdAt}): Promise<void>`
  - `getMediaFileId(db, url): Promise<string|null>`
  - `queryMedia(db, opts): Promise<row[]>` 与 `countMedia(db, opts): Promise<number>`，`opts = {ownerId=null, search="", types=[], sort="time_desc", limit=50, offset=0}`；`ownerId=null` 表示不限 owner（admin 看全部）；`types` 为 `['image','video','other']` 子集；`sort ∈ {time_desc,time_asc,type,size_desc,size_asc}`
  - `deleteMedia(db, urls, {ownerId=null}): Promise<number>`（返回删除行数；`ownerId` 非空则仅删该 owner 的）
  - `assignOwnerlessMedia(db, ownerId): Promise<number>`
  - `backfillMediaMetadata(db): Promise<void>`（从 url `…/<ts>.<ext>` 回填 `created_at`/`extension`，仅补 NULL 行）

- [ ] **Step 1: 写测试 `test/integration/media-db.test.js`**

```js
import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import * as media from "../../src/db/media.js";

const base = "https://d/";
async function seed(rows) {
  for (const r of rows) {
    await media.insertMedia(env.DATABASE, {
      url: base + r.url, fileId: r.url, ownerId: r.owner, filename: r.filename ?? r.url,
      contentType: "x", extension: r.ext, size: r.size ?? 1, createdAt: r.ts,
    });
  }
}
beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM media").run();
});

describe("db/media", () => {
  it("insert + getMediaFileId", async () => {
    await seed([{ url: "1.png", owner: 1, ext: "png", ts: 10 }]);
    expect(await media.getMediaFileId(env.DATABASE, base + "1.png")).toBe("1.png");
    expect(await media.getMediaFileId(env.DATABASE, base + "nope")).toBeNull();
  });
  it("owner isolation in query/count", async () => {
    await seed([{ url: "1.png", owner: 1, ext: "png", ts: 1 }, { url: "2.png", owner: 2, ext: "png", ts: 2 }]);
    expect(await media.countMedia(env.DATABASE, { ownerId: 1 })).toBe(1);
    expect(await media.countMedia(env.DATABASE, { ownerId: null })).toBe(2);
    const mine = await media.queryMedia(env.DATABASE, { ownerId: 1 });
    expect(mine.map((r) => r.url)).toEqual([base + "1.png"]);
  });
  it("search by filename/url", async () => {
    await seed([{ url: "cat.png", owner: 1, ext: "png", ts: 1, filename: "cat.png" }, { url: "dog.png", owner: 1, ext: "png", ts: 2, filename: "dog.png" }]);
    const r = await media.queryMedia(env.DATABASE, { ownerId: 1, search: "cat" });
    expect(r.map((x) => x.filename)).toEqual(["cat.png"]);
  });
  it("type filter image/video/other", async () => {
    await seed([
      { url: "a.png", owner: 1, ext: "png", ts: 1 },
      { url: "b.mp4", owner: 1, ext: "mp4", ts: 2 },
      { url: "c.pdf", owner: 1, ext: "pdf", ts: 3 },
    ]);
    expect((await media.queryMedia(env.DATABASE, { ownerId: 1, types: ["image"] })).map((r) => r.extension)).toEqual(["png"]);
    expect((await media.queryMedia(env.DATABASE, { ownerId: 1, types: ["other"] })).map((r) => r.extension)).toEqual(["pdf"]);
    expect((await media.queryMedia(env.DATABASE, { ownerId: 1, types: ["image", "video"] })).length).toBe(2);
  });
  it("sort + pagination", async () => {
    await seed([{ url: "1", owner: 1, ext: "png", ts: 1 }, { url: "2", owner: 1, ext: "png", ts: 2 }, { url: "3", owner: 1, ext: "png", ts: 3 }]);
    const page1 = await media.queryMedia(env.DATABASE, { ownerId: 1, sort: "time_desc", limit: 2, offset: 0 });
    expect(page1.map((r) => r.created_at)).toEqual([3, 2]);
    const page2 = await media.queryMedia(env.DATABASE, { ownerId: 1, sort: "time_desc", limit: 2, offset: 2 });
    expect(page2.map((r) => r.created_at)).toEqual([1]);
  });
  it("deleteMedia honors owner; admin (null) deletes any", async () => {
    await seed([{ url: "1.png", owner: 1, ext: "png", ts: 1 }, { url: "2.png", owner: 2, ext: "png", ts: 2 }]);
    expect(await media.deleteMedia(env.DATABASE, [base + "2.png"], { ownerId: 1 })).toBe(0); // not owner
    expect(await media.deleteMedia(env.DATABASE, [base + "1.png"], { ownerId: 1 })).toBe(1);
    expect(await media.deleteMedia(env.DATABASE, [base + "2.png"], { ownerId: null })).toBe(1); // admin
  });
  it("assignOwnerlessMedia + backfill", async () => {
    await env.DATABASE.prepare("INSERT INTO media (url, fileId) VALUES (?, ?)").bind(base + "1700000000000.jpg", "fid").run();
    expect(await media.assignOwnerlessMedia(env.DATABASE, 7)).toBe(1);
    await media.backfillMediaMetadata(env.DATABASE);
    const row = await env.DATABASE.prepare("SELECT * FROM media WHERE url = ?").bind(base + "1700000000000.jpg").first();
    expect(row.owner_id).toBe(7);
    expect(row.extension).toBe("jpg");
    expect(row.created_at).toBe(1700000000000);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- media-db`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/db/media.js`**

```js
import { extensionOf, categoryForExtension } from "../auth/filetypes.js";

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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test -- media-db`
Expected: PASS（7 passed）

- [ ] **Step 5: Commit**

```bash
git add src/db/media.js test/integration/media-db.test.js
git commit -m "feat: media DB layer with pagination/search/filter + owner-scoped delete"
```

---

## Phase 4 — 配置、中间件与认证路由（setup/login/logout）

### Task 11: `config.js` + `auth/middleware.js`

**Files:**
- Create: `src/config.js`
- Create: `src/auth/middleware.js`
- Test: `test/integration/middleware.test.js`

**Interfaces:**
- Produces:
  - `extractConfig(env): {domain, sessionSecret, tgBotToken, tgChatId, maxSize}`
  - `resolveUser(request, env, config): Promise<{user, via:"session"|"apikey"}|null>`
  - `isSameOrigin(request): boolean`

- [ ] **Step 1: 写测试 `test/integration/middleware.test.js`**

```js
import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { resolveUser, isSameOrigin } from "../../src/auth/middleware.js";
import { signSession, sessionCookieHeader } from "../../src/auth/session.js";
import { createUser } from "../../src/db/users.js";
import { createApiKey } from "../../src/db/apikeys.js";
import { generateApiKey, hashApiKey } from "../../src/auth/apikey.js";

const config = { sessionSecret: "s" };
const cookieOf = (t) => sessionCookieHeader(t).split(";")[0];
beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM api_keys").run();
  await env.DATABASE.prepare("DELETE FROM users").run();
});

describe("middleware.resolveUser", () => {
  it("resolves via session cookie", async () => {
    const { id } = await createUser(env.DATABASE, { username: "a", passwordHash: "h", role: "admin", allowedTypes: "*", createdAt: 1 });
    const token = await signSession({ uid: id, role: "admin", ver: 0 }, config.sessionSecret);
    const req = new Request("https://x/", { headers: { Cookie: cookieOf(token) } });
    const auth = await resolveUser(req, env, config);
    expect(auth.via).toBe("session");
    expect(auth.user.id).toBe(id);
  });
  it("rejects session with stale token_version", async () => {
    const { id } = await createUser(env.DATABASE, { username: "b", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 1 });
    const token = await signSession({ uid: id, role: "user", ver: 5 }, config.sessionSecret);
    const req = new Request("https://x/", { headers: { Cookie: cookieOf(token) } });
    expect(await resolveUser(req, env, config)).toBeNull();
  });
  it("resolves via api key and updates last_used", async () => {
    const { id } = await createUser(env.DATABASE, { username: "c", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 1 });
    const { plain, prefix } = generateApiKey();
    await createApiKey(env.DATABASE, { userId: id, name: "k", keyHash: await hashApiKey(plain), keyPrefix: prefix, createdAt: 1 });
    const req = new Request("https://x/", { headers: { Authorization: `Bearer ${plain}` } });
    const auth = await resolveUser(req, env, config);
    expect(auth.via).toBe("apikey");
    expect(auth.user.id).toBe(id);
  });
  it("isSameOrigin checks Origin/Referer host", () => {
    expect(isSameOrigin(new Request("https://x/p", { method: "POST", headers: { Origin: "https://x" } }))).toBe(true);
    expect(isSameOrigin(new Request("https://x/p", { method: "POST", headers: { Origin: "https://evil" } }))).toBe(false);
    expect(isSameOrigin(new Request("https://x/p", { method: "POST" }))).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- middleware`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/config.js`**

```js
export function extractConfig(env) {
  return {
    domain: env.DOMAIN,
    sessionSecret: env.SESSION_SECRET,
    tgBotToken: env.TG_BOT_TOKEN,
    tgChatId: env.TG_CHAT_ID,
    maxSize: (env.MAX_SIZE_MB ? parseInt(env.MAX_SIZE_MB, 10) : 20) * 1024 * 1024,
  };
}
```

- [ ] **Step 4: 实现 `src/auth/middleware.js`**

```js
import { getCookie } from "../utils/http.js";
import { SESSION_COOKIE, verifySession } from "./session.js";
import { extractApiKey, hashApiKey } from "./apikey.js";
import { getUserById } from "../db/users.js";
import { getApiKeyByHash, touchApiKey } from "../db/apikeys.js";

export async function resolveUser(request, env, config) {
  const token = getCookie(request, SESSION_COOKIE);
  if (token) {
    const payload = await verifySession(token, config.sessionSecret);
    if (payload) {
      const user = await getUserById(env.DATABASE, payload.uid);
      if (user && user.token_version === payload.ver) return { user, via: "session" };
    }
  }
  const key = extractApiKey(request);
  if (key) {
    const row = await getApiKeyByHash(env.DATABASE, await hashApiKey(key));
    if (row) {
      const user = await getUserById(env.DATABASE, row.user_id);
      if (user) {
        await touchApiKey(env.DATABASE, row.id, Date.now());
        return { user, via: "apikey" };
      }
    }
  }
  return null;
}

export function isSameOrigin(request) {
  const url = new URL(request.url);
  for (const h of ["Origin", "Referer"]) {
    const val = request.headers.get(h);
    if (val) {
      try { return new URL(val).host === url.host; } catch { return false; }
    }
  }
  return false;
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test -- middleware`
Expected: PASS（4 passed）

- [ ] **Step 6: Commit**

```bash
git add src/config.js src/auth/middleware.js test/integration/middleware.test.js
git commit -m "feat: config + auth middleware (resolveUser, same-origin)"
```

---

### Task 12: 视图骨架 `views/layout.js` + `loginPage.js` + `setupPage.js`

**Files:**
- Create: `src/views/layout.js`
- Create: `src/views/loginPage.js`
- Create: `src/views/setupPage.js`
- Test: `test/unit/views-auth.test.js`

**Interfaces:**
- Produces:
  - `pageLayout({title, body, head=""}): string`
  - `loginPage(error=""): string`
  - `setupPage(error=""): string`

- [ ] **Step 1: 写测试 `test/unit/views-auth.test.js`**

```js
import { describe, it, expect } from "vitest";
import { pageLayout } from "../../src/views/layout.js";
import { loginPage } from "../../src/views/loginPage.js";
import { setupPage } from "../../src/views/setupPage.js";

describe("auth views", () => {
  it("layout wraps body and escapes title", () => {
    const html = pageLayout({ title: "<x>", body: "<main>hi</main>" });
    expect(html).toContain("<main>hi</main>");
    expect(html).toContain("&lt;x&gt;");
  });
  it("loginPage has username/password fields and posts to /login", () => {
    const html = loginPage();
    expect(html).toMatch(/action="\/login"/);
    expect(html).toMatch(/name="username"/);
    expect(html).toMatch(/name="password"/);
  });
  it("loginPage renders escaped error", () => {
    expect(loginPage("<bad>")).toContain("&lt;bad&gt;");
  });
  it("setupPage posts to /setup", () => {
    expect(setupPage()).toMatch(/action="\/setup"/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- views-auth`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/views/layout.js`**

```js
import { escapeHtml } from "../utils/html.js";

const BASE_CSS = `
  *{box-sizing:border-box} body{margin:0;font-family:'Segoe UI',Tahoma,sans-serif;
  background:linear-gradient(135deg,#f5f7fa 0%,#e4e8f0 100%);min-height:100vh}
  .auth-card{max-width:380px;margin:8vh auto;background:#fff;border-radius:16px;
  box-shadow:0 8px 32px rgba(0,0,0,.1);padding:32px}
  .auth-card h1{font-size:24px;text-align:center;background:linear-gradient(135deg,#667eea,#764ba2);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;margin:0 0 24px}
  .auth-card label{display:block;font-size:14px;color:#555;margin:12px 0 6px}
  .auth-card input{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:15px}
  .auth-card button{width:100%;margin-top:20px;padding:11px;border:none;border-radius:8px;color:#fff;
  font-weight:500;cursor:pointer;background:linear-gradient(135deg,#667eea,#764ba2)}
  .auth-error{background:#fdecea;color:#b3261e;border-radius:8px;padding:10px;font-size:14px;margin-bottom:8px}
`;

export function pageLayout({ title, body, head = "" }) {
  return `<!DOCTYPE html><html lang="zh-CN"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="https://p1.meituan.net/csc/c195ee91001e783f39f41ffffbbcbd484286.ico" type="image/x-icon">
<style>${BASE_CSS}</style>
${head}
</head><body>${body}</body></html>`;
}
```

- [ ] **Step 4: 实现 `src/views/loginPage.js`**

```js
import { pageLayout } from "./layout.js";
import { escapeHtml } from "../utils/html.js";

export function loginPage(error = "") {
  const body = `
  <form class="auth-card" method="post" action="/login">
    <h1>登录</h1>
    ${error ? `<div class="auth-error">${escapeHtml(error)}</div>` : ""}
    <label for="username">用户名</label>
    <input id="username" name="username" autocomplete="username" required>
    <label for="password">密码</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">登录</button>
  </form>`;
  return pageLayout({ title: "登录 - 图床", body });
}
```

- [ ] **Step 5: 实现 `src/views/setupPage.js`**

```js
import { pageLayout } from "./layout.js";
import { escapeHtml } from "../utils/html.js";

export function setupPage(error = "") {
  const body = `
  <form class="auth-card" method="post" action="/setup">
    <h1>初始化管理员</h1>
    ${error ? `<div class="auth-error">${escapeHtml(error)}</div>` : ""}
    <p style="color:#888;font-size:13px;text-align:center;margin:0 0 8px">首次部署：创建第一个管理员账号</p>
    <label for="username">用户名（≥3 位）</label>
    <input id="username" name="username" required minlength="3">
    <label for="password">密码（≥6 位）</label>
    <input id="password" name="password" type="password" required minlength="6">
    <button type="submit">创建并登录</button>
  </form>`;
  return pageLayout({ title: "初始化 - 图床", body });
}
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npm test -- views-auth`
Expected: PASS（4 passed）

- [ ] **Step 7: Commit**

```bash
git add src/views/ test/unit/views-auth.test.js
git commit -m "feat: auth views (layout, login, setup)"
```

---

### Task 13: `/setup` 处理器 + 路由装配（`router.js` + `index.js`）

**Files:**
- Create: `src/handlers/setup.js`
- Create: `src/router.js`
- Modify: `src/index.js`
- Test: `test/integration/setup.test.js`

**Interfaces:**
- Consumes: `extractConfig`、`countUsers`/`createUser`、`assignOwnerlessMedia`/`backfillMediaMetadata`、`hashPassword`、`signSession`/`sessionCookieHeader`、`normalizeAllowedTypes`、`isSameOrigin`、`setupPage`
- Produces:
  - `handleSetup(request, env, config): Promise<Response>`
  - `route(request, env, config): Promise<Response>`（router 入口；本任务支持 `/setup`，其余 → 占位 404，后续任务扩展）

- [ ] **Step 1: 写测试 `test/integration/setup.test.js`**

```js
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../src/index.js";
import { countUsers } from "../../src/db/users.js";

const post = (url, body) =>
  new Request(url, { method: "POST", headers: { Origin: new URL(url).origin, "Content-Type": "application/x-www-form-urlencoded" }, body });

beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM media").run();
  await env.DATABASE.prepare("DELETE FROM users").run();
});

async function call(req) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("/setup", () => {
  it("GET shows form when no users", async () => {
    const res = await call(new Request("https://x/setup"));
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/初始化管理员/);
  });
  it("POST creates first admin, sets cookie, claims orphan media", async () => {
    await env.DATABASE.prepare("INSERT INTO media (url, fileId) VALUES (?, ?)").bind("https://x/1700000000000.jpg", "fid").run();
    const res = await call(post("https://x/setup", "username=root&password=secret1"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/admin");
    expect(res.headers.get("Set-Cookie")).toMatch(/uf_session=/);
    expect(await countUsers(env.DATABASE)).toBe(1);
    const media = await env.DATABASE.prepare("SELECT owner_id, extension FROM media WHERE url=?").bind("https://x/1700000000000.jpg").first();
    expect(media.owner_id).toBeGreaterThan(0);
    expect(media.extension).toBe("jpg");
  });
  it("GET redirects to /login once a user exists", async () => {
    await call(post("https://x/setup", "username=root&password=secret1"));
    const res = await call(new Request("https://x/setup"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/login");
  });
  it("rejects cross-origin POST", async () => {
    const req = new Request("https://x/setup", { method: "POST", headers: { Origin: "https://evil", "Content-Type": "application/x-www-form-urlencoded" }, body: "username=root&password=secret1" });
    const res = await call(req);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- setup`
Expected: FAIL（handler/router 不存在）

- [ ] **Step 3: 实现 `src/handlers/setup.js`**

```js
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
```

- [ ] **Step 4: 实现 `src/router.js`**

```js
import { handleSetup } from "./handlers/setup.js";

export async function route(request, env, config) {
  const { pathname } = new URL(request.url);
  switch (pathname) {
    case "/setup":
      return handleSetup(request, env, config);
    default:
      return new Response("Not Found", { status: 404 });
  }
}
```

- [ ] **Step 5: 改写 `src/index.js`**

```js
import { extractConfig } from "./config.js";
import { route } from "./router.js";

export default {
  async fetch(request, env) {
    const config = extractConfig(env);
    return route(request, env, config);
  },
};
```

> 注：smoke 测试断言 `/` 返回 200，现在 `/` 走 router 默认分支返回 404，会失败。把 `test/unit/smoke.test.js` 中对 `/` 的断言改为请求 `/setup` 且断言 `res.status === 200`（仍验证 `env.DATABASE` 存在）。

- [ ] **Step 6: 跑测试确认通过**

Run: `npm test -- setup smoke`
Expected: PASS（setup 4 + smoke 1）

- [ ] **Step 7: Commit**

```bash
git add src/handlers/setup.js src/router.js src/index.js test/
git commit -m "feat: /setup first-run admin wizard + router skeleton"
```

---

### Task 14: `/login` + `/logout` 处理器（含基础登录限速）

**Files:**
- Create: `src/auth/ratelimit.js`
- Create: `src/handlers/login.js`
- Modify: `src/router.js`
- Test: `test/unit/ratelimit.test.js`
- Test: `test/integration/login.test.js`

**Interfaces:**
- Produces:
  - `checkRateLimit(store, key, {max, windowMs, now}): {allowed:boolean, retryAfterMs:number}`（纯函数，`store` 为 `Map`）
  - `handleLogin(request, env, config): Promise<Response>`（GET 表单 / POST 校验）
  - `handleLogout(request): Promise<Response>`（POST 清 cookie）
  - router 新增 `/login`、`/logout`

- [ ] **Step 1: 写限速单测 `test/unit/ratelimit.test.js`**

```js
import { describe, it, expect } from "vitest";
import { checkRateLimit } from "../../src/auth/ratelimit.js";

describe("checkRateLimit", () => {
  it("allows up to max then blocks within window", () => {
    const store = new Map();
    const opts = { max: 2, windowMs: 1000 };
    expect(checkRateLimit(store, "k", { ...opts, now: 0 }).allowed).toBe(true);
    expect(checkRateLimit(store, "k", { ...opts, now: 10 }).allowed).toBe(true);
    const third = checkRateLimit(store, "k", { ...opts, now: 20 });
    expect(third.allowed).toBe(false);
    expect(third.retryAfterMs).toBeGreaterThan(0);
  });
  it("resets after window", () => {
    const store = new Map();
    const opts = { max: 1, windowMs: 1000 };
    expect(checkRateLimit(store, "k", { ...opts, now: 0 }).allowed).toBe(true);
    expect(checkRateLimit(store, "k", { ...opts, now: 1001 }).allowed).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- ratelimit`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/auth/ratelimit.js`**

```js
// 进程内（per-isolate）尽力而为的限速；非强一致，仅用于减缓暴力破解。
export function checkRateLimit(store, key, { max, windowMs, now }) {
  const entry = store.get(key);
  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (entry.count < max) {
    entry.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }
  return { allowed: false, retryAfterMs: entry.resetAt - now };
}
```

- [ ] **Step 4: 写登录集成测试 `test/integration/login.test.js`**

```js
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../src/index.js";
import { createUser } from "../../src/db/users.js";
import { hashPassword } from "../../src/auth/password.js";

async function call(req) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const post = (url, body) =>
  new Request(url, { method: "POST", headers: { Origin: new URL(url).origin, "Content-Type": "application/x-www-form-urlencoded" }, body });

beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM users").run();
  await createUser(env.DATABASE, { username: "root", passwordHash: await hashPassword("secret1"), role: "admin", allowedTypes: "*", createdAt: 1 });
});

describe("/login + /logout", () => {
  it("GET shows form", async () => {
    const res = await call(new Request("https://x/login"));
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/action="\/login"/);
  });
  it("POST wrong password → 401", async () => {
    const res = await call(post("https://x/login", "username=root&password=nope"));
    expect(res.status).toBe(401);
  });
  it("POST correct → 302 /admin with cookie", async () => {
    const res = await call(post("https://x/login", "username=root&password=secret1"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/admin");
    expect(res.headers.get("Set-Cookie")).toMatch(/uf_session=/);
  });
  it("logout clears cookie", async () => {
    const res = await call(post("https://x/logout", ""));
    expect(res.status).toBe(302);
    expect(res.headers.get("Set-Cookie")).toMatch(/Max-Age=0/);
  });
  it("cross-origin POST rejected", async () => {
    const req = new Request("https://x/login", { method: "POST", headers: { Origin: "https://evil", "Content-Type": "application/x-www-form-urlencoded" }, body: "username=root&password=secret1" });
    expect((await call(req)).status).toBe(403);
  });
});
```

- [ ] **Step 5: 实现 `src/handlers/login.js`**

```js
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
```

- [ ] **Step 6: 在 `src/router.js` 增加 `/login`、`/logout`**

在 `import { handleSetup } ...` 下方添加：
```js
import { handleLogin, handleLogout } from "./handlers/login.js";
```
在 switch 中 `case "/setup":` 之后添加：
```js
    case "/login":
      return handleLogin(request, env, config);
    case "/logout":
      return handleLogout(request);
```

- [ ] **Step 7: 跑测试确认通过**

Run: `npm test -- ratelimit login`
Expected: PASS（ratelimit 2 + login 5）

- [ ] **Step 8: Commit**

```bash
git add src/auth/ratelimit.js src/handlers/login.js src/router.js test/
git commit -m "feat: /login + /logout with basic rate limiting"
```

---

## Phase 5 — 上传页与上传（网页会话 + API key）

### Task 15: 首页上传页 `GET /`（需登录）

**Files:**
- Create: `src/views/homePage.js`
- Create: `src/handlers/home.js`
- Modify: `src/router.js`
- Test: `test/integration/home.test.js`

**Interfaces:**
- Consumes: `resolveUser`、`redirect`/`htmlResponse`
- Produces:
  - `homePage(user): string`（上传页 HTML，含顶栏：当前用户 + 进入后台 + 登出）
  - `handleHome(request, env, config): Promise<Response>`（未登录 302 `/login`）
  - router 新增 `/`

- [ ] **Step 1: 写测试 `test/integration/home.test.js`**

```js
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../src/index.js";
import { createUser } from "../../src/db/users.js";
import { signSession, sessionCookieHeader } from "../../src/auth/session.js";

const cookieOf = (t) => sessionCookieHeader(t).split(";")[0];
async function call(req) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
let token;
beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM users").run();
  const { id } = await createUser(env.DATABASE, { username: "u", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 1 });
  token = await signSession({ uid: id, role: "user", ver: 0 }, env.SESSION_SECRET);
});

describe("GET /", () => {
  it("redirects to /login when not authenticated", async () => {
    const res = await call(new Request("https://x/"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/login");
  });
  it("renders uploader when logged in", async () => {
    const res = await call(new Request("https://x/", { headers: { Cookie: cookieOf(token) } }));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/action="\/upload"/);
    expect(html).toMatch(/\/logout/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- home`
Expected: FAIL（handler/view 不存在）

- [ ] **Step 3: 实现 `src/views/homePage.js`（移植现有上传 UI + 顶栏）**

移植说明（一次性、可机械执行）：把**当前** `_worker.js` 中 `handleRootRequest` 内联模板 `<body>…</body>` 的**上传卡片与脚本**（即 `<div class="card">…</div>` 及其后的 `<script>`，约 `_worker.js:423–906`）整体搬到本文件，做三处改动：①去掉与 Basic-Auth/访客验证相关的任何残留；②在 `<body>` 顶部插入下方顶栏；③上传脚本里的接口仍为 `/upload`，且 `responseData.data` 字段保持不变（见 Task 16 的响应形状）。骨架如下：

```js
import { pageLayout } from "./layout.js";
import { escapeHtml } from "../utils/html.js";

export function homePage(user) {
  const topbar = `
  <div style="position:fixed;top:0;left:0;right:0;display:flex;justify-content:space-between;
    align-items:center;padding:10px 16px;background:rgba(255,255,255,.85);backdrop-filter:blur(8px);z-index:2000">
    <span style="color:#555;font-size:14px">👤 ${escapeHtml(user.username)}（${escapeHtml(user.role)}）</span>
    <span>
      <a href="/admin" style="color:#667eea;text-decoration:none;margin-right:14px">进入后台</a>
      <form method="post" action="/logout" style="display:inline">
        <button type="submit" style="border:none;background:none;color:#b3261e;cursor:pointer">登出</button>
      </form>
    </span>
  </div>`;

  // ↓↓↓ 这里粘贴从 _worker.js handleRootRequest 移植来的上传卡片 + 背景 + <script>（约原文件 423–906 行）
  const uploaderMarkup = `<div class="background" id="background"></div>
  <div class="card"> ... 移植内容 ... </div>
  <script> ... 移植上传/压缩/拖拽/粘贴/历史脚本（接口 /upload，字段 responseData.data 不变） ... </script>`;

  // 原 <head> 里的 CSS/CDN <link> 也一并移到 head 参数
  const head = `<!-- 移植 _worker.js handleRootRequest <head> 内的 bootstrap/fileinput/toastr/fontawesome <link> 与 <style> -->
  <style>body{padding-top:48px}</style>`;

  return pageLayout({ title: "Telegraph图床", head, body: topbar + uploaderMarkup });
}
```

> 注：`pageLayout` 已输出 `<!DOCTYPE html><html><head>…`，移植时**只取**原 `<body>` 内内容与 `<head>` 内的 link/style 片段，不要把整页 `<html>` 再嵌套一层。

- [ ] **Step 4: 实现 `src/handlers/home.js`**

```js
import { resolveUser } from "../auth/middleware.js";
import { htmlResponse, redirect } from "../utils/http.js";
import { homePage } from "../views/homePage.js";

export async function handleHome(request, env, config) {
  const auth = await resolveUser(request, env, config);
  if (!auth || auth.via !== "session") return redirect("/login");
  return htmlResponse(homePage(auth.user), 200, { "Cache-Control": "no-store" });
}
```

- [ ] **Step 5: `src/router.js` 增加 `/`**

加 import：`import { handleHome } from "./handlers/home.js";`
在 switch 增加：
```js
    case "/":
      return handleHome(request, env, config);
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npm test -- home`
Expected: PASS（2 passed）

- [ ] **Step 7: Commit**

```bash
git add src/views/homePage.js src/handlers/home.js src/router.js test/integration/home.test.js
git commit -m "feat: authenticated upload home page with top bar"
```

---

### Task 16: 上传核心 + 网页上传 `POST /upload`

**Files:**
- Create: `src/utils/contentType.js`
- Create: `src/handlers/uploadCore.js`
- Create: `src/handlers/upload.js`
- Modify: `src/router.js`
- Modify: `vitest.config.js`（测试环境补 DOMAIN/TG_BOT_TOKEN/TG_CHAT_ID 绑定）
- Test: `test/integration/upload.test.js`

**Interfaces:**
- Produces:
  - `CONTENT_TYPE_MAP`、`getContentType(ext): string`
  - `performUpload({file, user, env, config}): Promise<{url:string}>`（校验大小/类型→转存 Telegram→写 media；失败抛带 `.status` 的 Error）
  - `handleUpload(request, env, config): Promise<Response>`（会话用户；响应 `{data:url}` 兼容前端）
  - router 新增 `/upload`

- [ ] **Step 1: 在 `vitest.config.js` 的 `miniflare.bindings` 补充测试变量**

把 `bindings: { TEST_MIGRATIONS: migrations, SESSION_SECRET: "test-secret-please-change" }` 改为：
```js
bindings: {
  TEST_MIGRATIONS: migrations,
  SESSION_SECRET: "test-secret-please-change",
  DOMAIN: "test.local",
  TG_BOT_TOKEN: "TESTTOKEN",
  TG_CHAT_ID: "-100",
},
```

- [ ] **Step 2: 写测试 `test/integration/upload.test.js`**

```js
import { env, createExecutionContext, waitOnExecutionContext, fetchMock } from "cloudflare:test";
import { describe, it, expect, beforeAll, afterEach, beforeEach } from "vitest";
import worker from "../../src/index.js";
import { createUser } from "../../src/db/users.js";
import { signSession, sessionCookieHeader } from "../../src/auth/session.js";

const cookieOf = (t) => sessionCookieHeader(t).split(";")[0];
async function call(req) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
function uploadReq(token, filename, type, allowedSize = 4) {
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array(allowedSize)], filename, { type }), filename);
  return new Request("https://test.local/upload", { method: "POST", headers: { Origin: "https://test.local", Cookie: cookieOf(token) }, body: fd });
}
function mockTelegram() {
  fetchMock.get("https://api.telegram.org")
    .intercept({ path: "/botTESTTOKEN/sendDocument", method: "POST" })
    .reply(200, { ok: true, result: { document: { file_id: "FID123" } } });
}

beforeAll(() => { fetchMock.activate(); fetchMock.disableNetConnect(); });
afterEach(() => { try { fetchMock.assertNoPendingInterceptors(); } catch {} });

let imgUser, imgToken;
beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM media").run();
  await env.DATABASE.prepare("DELETE FROM users").run();
  ({ id: imgUser } = await createUser(env.DATABASE, { username: "img", passwordHash: "h", role: "user", allowedTypes: "image", createdAt: 1 }));
  imgToken = await signSession({ uid: imgUser, role: "user", ver: 0 }, env.SESSION_SECRET);
});

describe("POST /upload", () => {
  it("stores file and returns {data:url} owned by user", async () => {
    mockTelegram();
    const res = await call(uploadReq(imgToken, "pic.png", "image/png"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatch(/^https:\/\/test\.local\/\d+\.png$/);
    const row = await env.DATABASE.prepare("SELECT owner_id, extension FROM media WHERE url=?").bind(json.data).first();
    expect(row.owner_id).toBe(imgUser);
    expect(row.extension).toBe("png");
  });
  it("rejects disallowed type for restricted user (415)", async () => {
    const res = await call(uploadReq(imgToken, "clip.mp4", "video/mp4"));
    expect(res.status).toBe(415);
    expect((await res.json()).error).toMatch(/不允许/);
  });
  it("requires authentication (401)", async () => {
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(2)], "a.png", { type: "image/png" }), "a.png");
    const res = await call(new Request("https://test.local/upload", { method: "POST", headers: { Origin: "https://test.local" }, body: fd }));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npm test -- upload`
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现 `src/utils/contentType.js`**

```js
export const CONTENT_TYPE_MAP = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml",
  mp4: "video/mp4", avi: "video/x-msvideo", mov: "video/quicktime", webm: "video/webm",
};
export function getContentType(ext) {
  return CONTENT_TYPE_MAP[ext] || "application/octet-stream";
}
```

- [ ] **Step 5: 实现 `src/handlers/uploadCore.js`**

```js
import { isTypeAllowed, extensionOf, categoryForExtension } from "../auth/filetypes.js";
import { getContentType } from "../utils/contentType.js";
import { insertMedia } from "../db/media.js";

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export async function performUpload({ file, user, env, config }) {
  if (!file || typeof file === "string") throw fail(400, "缺少文件");
  if (file.size > config.maxSize) throw fail(413, `文件大小超过 ${config.maxSize / (1024 * 1024)}MB 限制`);
  if (!isTypeAllowed(file.name, user.allowed_types)) {
    const cat = categoryForExtension(extensionOf(file.name));
    throw fail(415, `你的账号不允许上传 ${cat} 类型文件（允许：${user.allowed_types}）`);
  }

  const fd = new FormData();
  fd.append("chat_id", config.tgChatId);
  let toSend = file;
  if (file.type.startsWith("image/gif")) {
    toSend = new File([file], file.name.replace(/\.gif$/i, ".jpeg"), { type: "image/jpeg" });
  }
  fd.append("document", toSend);

  const tgRes = await fetch(`https://api.telegram.org/bot${config.tgBotToken}/sendDocument`, { method: "POST", body: fd });
  if (!tgRes.ok) {
    const err = await tgRes.json().catch(() => ({}));
    throw fail(502, err.description || "上传到 Telegram 失败");
  }
  const data = await tgRes.json();
  const fileId = data.result?.video?.file_id || data.result?.document?.file_id || data.result?.sticker?.file_id;
  if (!fileId) throw fail(502, "返回数据中没有文件 ID");

  const ext = extensionOf(file.name);
  const ts = Date.now();
  const url = `https://${config.domain}/${ts}.${ext}`;
  await insertMedia(env.DATABASE, {
    url, fileId, ownerId: user.id, filename: file.name,
    contentType: getContentType(ext), extension: ext, size: file.size, createdAt: ts,
  });
  return { url };
}
```

- [ ] **Step 6: 实现 `src/handlers/upload.js`**

```js
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
```

- [ ] **Step 7: `src/router.js` 增加 `/upload`**

加 import：`import { handleUpload } from "./handlers/upload.js";`
switch 增加：
```js
    case "/upload":
      return handleUpload(request, env, config);
```

- [ ] **Step 8: 跑测试确认通过**

Run: `npm test -- upload`
Expected: PASS（3 passed）

- [ ] **Step 9: Commit**

```bash
git add src/utils/contentType.js src/handlers/uploadCore.js src/handlers/upload.js src/router.js vitest.config.js test/integration/upload.test.js
git commit -m "feat: authenticated web upload with per-user type enforcement"
```

---

### Task 17: API 上传 `POST /api/upload`（API key）

**Files:**
- Create: `src/handlers/apiUpload.js`
- Modify: `src/router.js`
- Test: `test/integration/api-upload.test.js`

**Interfaces:**
- Consumes: `resolveUser`、`performUpload`
- Produces:
  - `handleApiUpload(request, env, config): Promise<Response>`（仅认 API key；响应 `{url}`）
  - router 新增 `/api/upload`

- [ ] **Step 1: 写测试 `test/integration/api-upload.test.js`**

```js
import { env, createExecutionContext, waitOnExecutionContext, fetchMock } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import worker from "../../src/index.js";
import { createUser } from "../../src/db/users.js";
import { createApiKey } from "../../src/db/apikeys.js";
import { generateApiKey, hashApiKey } from "../../src/auth/apikey.js";

async function call(req) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
function mockTelegram() {
  fetchMock.get("https://api.telegram.org")
    .intercept({ path: "/botTESTTOKEN/sendDocument", method: "POST" })
    .reply(200, { ok: true, result: { document: { file_id: "FID" } } });
}
function apiReq(key, filename, type) {
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array(3)], filename, { type }), filename);
  return new Request("https://test.local/api/upload", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd });
}

beforeAll(() => { fetchMock.activate(); fetchMock.disableNetConnect(); });
let key, uid;
beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM api_keys").run();
  await env.DATABASE.prepare("DELETE FROM media").run();
  await env.DATABASE.prepare("DELETE FROM users").run();
  ({ id: uid } = await createUser(env.DATABASE, { username: "api", passwordHash: "h", role: "user", allowedTypes: "image", createdAt: 1 }));
  const gen = generateApiKey();
  key = gen.plain;
  await createApiKey(env.DATABASE, { userId: uid, name: "k", keyHash: await hashApiKey(key), keyPrefix: gen.prefix, createdAt: 1 });
});

describe("POST /api/upload", () => {
  it("uploads with valid key, returns {url}, owner set", async () => {
    mockTelegram();
    const res = await call(apiReq(key, "p.png", "image/png"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toMatch(/^https:\/\/test\.local\/\d+\.png$/);
    const row = await env.DATABASE.prepare("SELECT owner_id FROM media WHERE url=?").bind(json.url).first();
    expect(row.owner_id).toBe(uid);
  });
  it("401 without key", async () => {
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(3)], "p.png", { type: "image/png" }), "p.png");
    const res = await call(new Request("https://test.local/api/upload", { method: "POST", body: fd }));
    expect(res.status).toBe(401);
  });
  it("415 disallowed type", async () => {
    const res = await call(apiReq(key, "v.mp4", "video/mp4"));
    expect(res.status).toBe(415);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- api-upload`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/handlers/apiUpload.js`**

```js
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
```

- [ ] **Step 4: `src/router.js` 增加 `/api/upload`**

加 import：`import { handleApiUpload } from "./handlers/apiUpload.js";`
switch 增加：
```js
    case "/api/upload":
      return handleApiUpload(request, env, config);
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test -- api-upload`
Expected: PASS（3 passed）

- [ ] **Step 6: Commit**

```bash
git add src/handlers/apiUpload.js src/router.js test/integration/api-upload.test.js
git commit -m "feat: API key upload endpoint (upload-only)"
```

---

## Phase 6 — 图片服务、删除、后台增强、用户/Key 管理、收尾

### Task 18: 图片服务（默认路由）+ 修复临时失败被永久缓存

**Files:**
- Create: `src/handlers/image.js`
- Modify: `src/router.js`
- Test: `test/integration/image.test.js`

**Interfaces:**
- Consumes: `getMediaFileId`、`getContentType`、`extensionOf`
- Produces: `handleImage(request, env, config): Promise<Response>`（router 默认分支）

- [ ] **Step 1: 写测试 `test/integration/image.test.js`**

```js
import { env, createExecutionContext, waitOnExecutionContext, fetchMock } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import worker from "../../src/index.js";
import { insertMedia } from "../../src/db/media.js";

async function call(req) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
beforeAll(() => { fetchMock.activate(); fetchMock.disableNetConnect(); });
beforeEach(async () => { await env.DATABASE.prepare("DELETE FROM media").run(); });

describe("image serving (default route)", () => {
  it("404 for unknown url (DB miss is cacheable)", async () => {
    const res = await call(new Request("https://test.local/doesnotexist.png"));
    expect(res.status).toBe(404);
  });
  it("serves file with correct content-type when present", async () => {
    const url = "https://test.local/1700000000001.png";
    await insertMedia(env.DATABASE, { url, fileId: "FID", ownerId: 1, filename: "a.png", contentType: "image/png", extension: "png", size: 1, createdAt: 1 });
    fetchMock.get("https://api.telegram.org").intercept({ path: (p) => p.includes("/getFile"), method: "GET" })
      .reply(200, { ok: true, result: { file_path: "photos/x.png" } });
    fetchMock.get("https://api.telegram.org").intercept({ path: (p) => p.includes("/file/botTESTTOKEN/") })
      .reply(200, "BINARY", { headers: { "Content-Type": "application/octet-stream" } });
    const res = await call(new Request(url));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
  });
  it("transient Telegram getFile failure → 502 (NOT cached as 404)", async () => {
    const url = "https://test.local/1700000000002.png";
    await insertMedia(env.DATABASE, { url, fileId: "FID2", ownerId: 1, filename: "b.png", contentType: "image/png", extension: "png", size: 1, createdAt: 1 });
    fetchMock.get("https://api.telegram.org").intercept({ path: (p) => p.includes("/getFile"), method: "GET" }).reply(500, {}).times(3);
    const res = await call(new Request(url));
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- image`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/handlers/image.js`**

```js
import { getMediaFileId } from "../db/media.js";
import { getContentType } from "../utils/contentType.js";
import { extensionOf } from "../auth/filetypes.js";

const IMAGE_TTL = 86400;

export async function handleImage(request, env, config) {
  const cache = caches.default;
  const cacheKey = new Request(request.url);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const fileId = await getMediaFileId(env.DATABASE, request.url);
  if (!fileId) {
    const notFound = new Response("资源不存在", { status: 404, headers: { "Cache-Control": `public, max-age=${IMAGE_TTL}` } });
    await cache.put(cacheKey, notFound.clone());
    return notFound;
  }

  let filePath;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`https://api.telegram.org/bot${config.tgBotToken}/getFile?file_id=${fileId}`);
    if (r.ok) {
      const d = await r.json();
      if (d.ok && d.result?.file_path) { filePath = d.result.file_path; break; }
    }
  }
  // BUGFIX：Telegram 临时失败时返回 502 且【不缓存】，避免把瞬时故障固化成 24h 永久 404
  if (!filePath) return new Response("暂时无法获取文件，请稍后重试", { status: 502 });

  const fileRes = await fetch(`https://api.telegram.org/file/bot${config.tgBotToken}/${filePath}`);
  if (!fileRes.ok) return new Response("获取文件内容失败", { status: 502 });

  const ext = extensionOf((request.url.split("/").pop() || ""));
  const headers = new Headers(fileRes.headers);
  headers.set("Content-Type", getContentType(ext));
  headers.set("Content-Disposition", "inline");
  headers.set("Cache-Control", `public, max-age=${IMAGE_TTL}`);
  headers.set("CDN-Cache-Control", `public, max-age=${IMAGE_TTL}`);
  const out = new Response(fileRes.body, { status: fileRes.status, headers });
  await cache.put(cacheKey, out.clone());
  return out;
}
```

- [ ] **Step 4: `src/router.js` 默认分支改为图片服务**

加 import：`import { handleImage } from "./handlers/image.js";`
把 `default: return new Response("Not Found", { status: 404 });` 改为：
```js
    default:
      return handleImage(request, env, config);
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test -- image`
Expected: PASS（3 passed）

- [ ] **Step 6: Commit**

```bash
git add src/handlers/image.js src/router.js test/integration/image.test.js
git commit -m "fix: serve images via D1; stop caching transient Telegram failures as 404"
```

---

### Task 19: Bing 背景接口 `GET /bing-images`

**Files:**
- Create: `src/handlers/bing.js`
- Modify: `src/router.js`
- Test: `test/integration/bing.test.js`

**Interfaces:**
- Produces: `handleBing(): Promise<Response>`（router 新增 `/bing-images`）

- [ ] **Step 1: 写测试 `test/integration/bing.test.js`**

```js
import { env, createExecutionContext, waitOnExecutionContext, fetchMock } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../../src/index.js";

async function call(req) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
beforeAll(() => { fetchMock.activate(); fetchMock.disableNetConnect(); });

describe("GET /bing-images", () => {
  it("returns mapped image urls", async () => {
    fetchMock.get("https://cn.bing.com").intercept({ path: (p) => p.startsWith("/HPImageArchive.aspx") })
      .reply(200, { images: [{ url: "/th?id=1" }, { url: "/th?id=2" }] });
    const res = await call(new Request("https://test.local/bing-images"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data[0].url).toBe("https://cn.bing.com/th?id=1");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- bing`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/handlers/bing.js`**

```js
const API_TTL = 300;

export async function handleBing() {
  const cache = caches.default;
  const cacheKey = new Request("https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=5");
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const res = await fetch(cacheKey);
  if (!res.ok) return new Response("请求 Bing API 失败", { status: res.status });
  const data = await res.json();
  const images = (data.images || []).map((img) => ({ url: `https://cn.bing.com${img.url}` }));
  const body = JSON.stringify({ status: true, message: "操作成功", data: images });
  const out = new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${API_TTL}` } });
  await cache.put(cacheKey, out.clone());
  return out;
}
```

- [ ] **Step 4: `src/router.js` 增加 `/bing-images`**

加 import：`import { handleBing } from "./handlers/bing.js";`
switch 增加：
```js
    case "/bing-images":
      return handleBing();
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test -- bing`
Expected: PASS（1 passed）

- [ ] **Step 6: Commit**

```bash
git add src/handlers/bing.js src/router.js test/integration/bing.test.js
git commit -m "feat: port bing background endpoint"
```

---

### Task 20: 删除 `POST /delete-images`（owner 校验）

**Files:**
- Create: `src/handlers/delete.js`
- Modify: `src/router.js`
- Test: `test/integration/delete.test.js`

**Interfaces:**
- Consumes: `resolveUser`/`isSameOrigin`、`deleteMedia`
- Produces: `handleDelete(request, env, config): Promise<Response>`（router 新增 `/delete-images`）

- [ ] **Step 1: 写测试 `test/integration/delete.test.js`**

```js
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../src/index.js";
import { createUser } from "../../src/db/users.js";
import { insertMedia } from "../../src/db/media.js";
import { signSession, sessionCookieHeader } from "../../src/auth/session.js";

const cookieOf = (t) => sessionCookieHeader(t).split(";")[0];
async function call(req) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const delReq = (token, urls) => new Request("https://test.local/delete-images", {
  method: "POST", headers: { Origin: "https://test.local", "Content-Type": "application/json", Cookie: cookieOf(token) }, body: JSON.stringify(urls),
});

let userToken, adminToken, uId, aId;
beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM media").run();
  await env.DATABASE.prepare("DELETE FROM users").run();
  ({ id: uId } = await createUser(env.DATABASE, { username: "u", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 1 }));
  ({ id: aId } = await createUser(env.DATABASE, { username: "a", passwordHash: "h", role: "admin", allowedTypes: "*", createdAt: 1 }));
  userToken = await signSession({ uid: uId, role: "user", ver: 0 }, env.SESSION_SECRET);
  adminToken = await signSession({ uid: aId, role: "admin", ver: 0 }, env.SESSION_SECRET);
  await insertMedia(env.DATABASE, { url: "https://test.local/u.png", fileId: "1", ownerId: uId, filename: "u", contentType: "image/png", extension: "png", size: 1, createdAt: 1 });
  await insertMedia(env.DATABASE, { url: "https://test.local/a.png", fileId: "2", ownerId: aId, filename: "a", contentType: "image/png", extension: "png", size: 1, createdAt: 2 });
});

describe("POST /delete-images", () => {
  it("user cannot delete another user's file", async () => {
    const res = await call(delReq(userToken, ["https://test.local/a.png"]));
    expect(res.status).toBe(404);
    const still = await env.DATABASE.prepare("SELECT 1 FROM media WHERE url=?").bind("https://test.local/a.png").first();
    expect(still).not.toBeNull();
  });
  it("user deletes own file", async () => {
    const res = await call(delReq(userToken, ["https://test.local/u.png"]));
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe(1);
  });
  it("admin deletes any file", async () => {
    const res = await call(delReq(adminToken, ["https://test.local/u.png"]));
    expect(res.status).toBe(200);
  });
  it("401 when not logged in", async () => {
    const res = await call(new Request("https://test.local/delete-images", { method: "POST", headers: { Origin: "https://test.local", "Content-Type": "application/json" }, body: "[]" }));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- delete`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/handlers/delete.js`**

```js
import { resolveUser, isSameOrigin } from "../auth/middleware.js";
import { deleteMedia } from "../db/media.js";
import { jsonResponse } from "../utils/http.js";

export async function handleDelete(request, env, config) {
  if (request.method !== "POST") return jsonResponse({ error: "Method Not Allowed" }, 405);
  const auth = await resolveUser(request, env, config);
  if (!auth || auth.via !== "session") return jsonResponse({ error: "未登录" }, 401);
  if (!isSameOrigin(request)) return jsonResponse({ error: "非法请求来源" }, 403);

  let urls;
  try { urls = await request.json(); } catch { return jsonResponse({ error: "无效请求体" }, 400); }
  if (!Array.isArray(urls) || urls.length === 0) return jsonResponse({ message: "没有要删除的项" }, 400);

  const ownerId = auth.user.role === "admin" ? null : auth.user.id; // admin 可删任意
  const cache = caches.default;
  const [changes] = await Promise.all([
    deleteMedia(env.DATABASE, urls, { ownerId }),
    Promise.all(urls.map((u) => cache.delete(new Request(u)))),
  ]);
  if (changes === 0) return jsonResponse({ message: "未找到可删除的项（或无权限）" }, 404);
  return jsonResponse({ message: "删除成功", deleted: changes });
}
```

- [ ] **Step 4: `src/router.js` 增加 `/delete-images`**

加 import：`import { handleDelete } from "./handlers/delete.js";`
switch 增加：
```js
    case "/delete-images":
      return handleDelete(request, env, config);
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm test -- delete`
Expected: PASS（4 passed）

- [ ] **Step 6: Commit**

```bash
git add src/handlers/delete.js src/router.js test/integration/delete.test.js
git commit -m "feat: owner-scoped delete (admin can delete any)"
```

---

### Task 21: 增强后台图库 `GET /admin`（分页/搜索/筛选/排序/视图切换）

**Files:**
- Create: `src/views/adminPage.js`
- Create: `src/handlers/admin.js`
- Modify: `src/router.js`
- Test: `test/integration/admin.test.js`

**Interfaces:**
- Consumes: `resolveUser`、`queryMedia`/`countMedia`、`listUsers`
- Produces:
  - `adminPage(data): string`，`data = {rows,total,page,totalPages,pageSize,sort,search,types,isAdmin,users,viewUser,currentUser,allFilteredKeys}`
  - `handleAdmin(request, env, config): Promise<Response>`（router 新增 `/admin`）
- Constants（与 db 层 `SORTS` 对齐）：`PAGE_SIZES=[20,50,100]`、`SORTS=["time_desc","time_asc","type","size_desc","size_asc"]`、`TYPES=["image","video","other"]`

- [ ] **Step 1: 写测试 `test/integration/admin.test.js`**

```js
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../src/index.js";
import { createUser } from "../../src/db/users.js";
import { insertMedia } from "../../src/db/media.js";
import { signSession, sessionCookieHeader } from "../../src/auth/session.js";

const cookieOf = (t) => sessionCookieHeader(t).split(";")[0];
async function call(url, token) {
  const ctx = createExecutionContext();
  const headers = token ? { Cookie: cookieOf(token) } : {};
  const res = await worker.fetch(new Request(url, { headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
let uId, aId, uTok, aTok;
beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM media").run();
  await env.DATABASE.prepare("DELETE FROM users").run();
  ({ id: uId } = await createUser(env.DATABASE, { username: "u", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 1 }));
  ({ id: aId } = await createUser(env.DATABASE, { username: "a", passwordHash: "h", role: "admin", allowedTypes: "*", createdAt: 1 }));
  uTok = await signSession({ uid: uId, role: "user", ver: 0 }, env.SESSION_SECRET);
  aTok = await signSession({ uid: aId, role: "admin", ver: 0 }, env.SESSION_SECRET);
  await insertMedia(env.DATABASE, { url: "https://test.local/u-cat.png", fileId: "1", ownerId: uId, filename: "cat.png", contentType: "image/png", extension: "png", size: 1, createdAt: 10 });
  await insertMedia(env.DATABASE, { url: "https://test.local/u-clip.mp4", fileId: "2", ownerId: uId, filename: "clip.mp4", contentType: "video/mp4", extension: "mp4", size: 1, createdAt: 20 });
  await insertMedia(env.DATABASE, { url: "https://test.local/a-doc.pdf", fileId: "3", ownerId: aId, filename: "doc.pdf", contentType: "x", extension: "pdf", size: 1, createdAt: 30 });
});

describe("GET /admin", () => {
  it("redirects to /login when not authenticated", async () => {
    expect((await call("https://test.local/admin")).status).toBe(302);
  });
  it("user sees only own files", async () => {
    const html = await (await call("https://test.local/admin", uTok)).text();
    expect(html).toContain("u-cat.png");
    expect(html).toContain("u-clip.mp4");
    expect(html).not.toContain("a-doc.pdf");
  });
  it("admin sees all by default", async () => {
    const html = await (await call("https://test.local/admin", aTok)).text();
    expect(html).toContain("u-cat.png");
    expect(html).toContain("a-doc.pdf");
  });
  it("admin can scope to a specific user", async () => {
    const html = await (await call(`https://test.local/admin?user=${uId}`, aTok)).text();
    expect(html).toContain("u-cat.png");
    expect(html).not.toContain("a-doc.pdf");
  });
  it("type filter narrows results", async () => {
    const html = await (await call("https://test.local/admin?type=video", uTok)).text();
    expect(html).toContain("u-clip.mp4");
    expect(html).not.toContain("u-cat.png");
  });
  it("search by filename", async () => {
    const html = await (await call("https://test.local/admin?q=cat", uTok)).text();
    expect(html).toContain("u-cat.png");
    expect(html).not.toContain("u-clip.mp4");
  });
  it("non-numeric page does not 500 (clamps to 1)", async () => {
    const res = await call("https://test.local/admin?page=abc", uTok);
    expect(res.status).toBe(200);
  });
  it("out-of-range page clamps without error", async () => {
    const res = await call("https://test.local/admin?page=9999", uTok);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- admin`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/views/adminPage.js`**

```js
import { pageLayout } from "./layout.js";
import { escapeHtml } from "../utils/html.js";

const VIDEO = ["mp4", "avi", "mov", "webm", "mkv", "wmv", "flv", "m4v", "mpeg", "mpg"];
const IMAGE = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tiff", "tif", "ico", "avif"];

function tile(row) {
  const url = escapeHtml(row.url);
  const ext = escapeHtml(row.extension || "");
  const name = escapeHtml(row.filename || row.url.split("/").pop());
  const when = row.created_at ? escapeHtml(new Date(row.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })) : "";
  let media;
  if (VIDEO.includes(row.extension)) media = `<video class="m" preload="none" controls><source data-src="${url}" type="video/${ext}"></video>`;
  else if (IMAGE.includes(row.extension)) media = `<img class="m lazy" data-src="${url}" alt="">`;
  else media = `<div class="icon">📁</div>`;
  return `<div class="tile" data-key="${url}" onclick="toggleSel(this)" title="${name}">
    <div class="badge">${ext}</div>${media}<div class="when">${when}</div></div>`;
}

function opt(value, label, selected) {
  return `<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`;
}

export function adminPage(d) {
  const { rows, total, page, totalPages, pageSize, sort, search, types, isAdmin, users, viewUser, currentUser, allFilteredKeys } = d;
  const typeChecked = (t) => (types.includes(t) ? " checked" : "");
  const userOptions = isAdmin
    ? `<select name="user"><option value="all"${viewUser === "all" ? " selected" : ""}>全部用户</option>` +
      users.map((u) => `<option value="${u.id}"${viewUser === String(u.id) ? " selected" : ""}>${escapeHtml(u.username)}</option>`).join("") +
      `</select>`
    : "";

  const controls = `
  <form id="filters" method="get" action="/admin" class="controls">
    <input type="text" name="q" value="${escapeHtml(search)}" placeholder="搜索文件名/URL">
    <label><input type="checkbox" name="type" value="image"${typeChecked("image")}>图片</label>
    <label><input type="checkbox" name="type" value="video"${typeChecked("video")}>视频</label>
    <label><input type="checkbox" name="type" value="other"${typeChecked("other")}>其它</label>
    <select name="sort">
      ${opt("time_desc", "时间↓", sort)}${opt("time_asc", "时间↑", sort)}${opt("type", "类型", sort)}${opt("size_desc", "大小↓", sort)}${opt("size_asc", "大小↑", sort)}
    </select>
    <select name="size">${[20, 50, 100].map((s) => opt(String(s), s + "/页", String(pageSize))).join("")}</select>
    ${userOptions}
    <input type="hidden" name="page" id="pageField" value="1">
    <button type="submit">应用</button>
  </form>`;

  const header = `
  <div class="header">
    <div class="left">
      <span>媒体文件 ${total} 个</span>
      <span>已选 <span id="selCount">0</span> 个</span>
      <a href="/">上传</a>
      ${isAdmin ? '<a href="/users">用户管理</a>' : ""}
      <a href="/apikeys">API Key</a>
      <form method="post" action="/logout" style="display:inline"><button class="link">登出</button></form>
    </div>
    <div class="right hidden" id="actions">
      <div class="dropdown"><button class="btn">复制</button>
        <div class="menu"><button onclick="copyFmt('url')">URL</button><button onclick="copyFmt('bbcode')">BBCode</button><button onclick="copyFmt('markdown')">Markdown</button></div>
      </div>
      <button class="btn" onclick="selectPage()">全选本页</button>
      ${allFilteredKeys ? `<button class="btn" onclick="selectAllFiltered()">全选筛选结果(${total})</button>` : ""}
      <button class="btn danger" onclick="del()">删除</button>
    </div>
  </div>`;

  const gallery = rows.length
    ? `<div class="gallery">${rows.map(tile).join("")}</div>`
    : `<div class="empty">📁 暂无媒体文件</div>`;

  const pagination = `
  <div class="pager">
    <button onclick="goPage(${page - 1})" ${page <= 1 ? "disabled" : ""}>上一页</button>
    <span>第 ${page} / ${totalPages} 页（共 ${total} 个）</span>
    <button onclick="goPage(${page + 1})" ${page >= totalPages ? "disabled" : ""}>下一页</button>
    <input type="number" id="jump" min="1" max="${totalPages}" placeholder="页码" style="width:70px">
    <button onclick="goPage(parseInt(document.getElementById('jump').value,10))">跳转</button>
  </div>`;

  const css = `
  body{font-family:'Segoe UI',sans-serif;background:linear-gradient(135deg,#f5f7fa,#e4e8f0);margin:0;padding:16px}
  .header{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;background:#fff;padding:12px 16px;border-radius:12px;box-shadow:0 4px 20px rgba(102,126,234,.12);margin-bottom:12px}
  .header .left{display:flex;gap:14px;align-items:center;color:#555;flex-wrap:wrap}
  .header a,.link{color:#667eea;text-decoration:none;background:none;border:none;cursor:pointer;font-size:14px}
  .controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center;background:#fff;padding:12px 16px;border-radius:12px;margin-bottom:12px}
  .controls input[type=text]{padding:7px 10px;border:1px solid #ddd;border-radius:8px}
  .controls select{padding:7px;border:1px solid #ddd;border-radius:8px}
  .btn{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;border-radius:8px;padding:8px 16px;cursor:pointer}
  .btn.danger{background:linear-gradient(135deg,#e57373,#b3261e)}
  .hidden{display:none}
  .right{display:flex;gap:8px;align-items:center}
  .dropdown{position:relative}.dropdown .menu{display:none;position:absolute;right:0;background:#fff;border-radius:8px;box-shadow:0 8px 25px rgba(0,0,0,.15);overflow:hidden;z-index:10}
  .dropdown:hover .menu{display:block}.dropdown .menu button{display:block;width:100%;border:none;background:none;padding:10px 16px;text-align:left;cursor:pointer}
  .gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px}
  .tile{position:relative;aspect-ratio:1;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,.08);cursor:pointer;border:2px solid transparent}
  .tile.sel{border-color:#667eea;box-shadow:0 0 18px rgba(102,126,234,.35)}
  .tile .m{width:100%;height:100%;object-fit:contain}
  .tile .icon{display:flex;align-items:center;justify-content:center;height:100%;font-size:48px}
  .badge{position:absolute;top:8px;left:8px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:3px 8px;border-radius:12px;font-size:11px;text-transform:uppercase;z-index:2}
  .when{position:absolute;bottom:0;left:0;right:0;background:rgba(255,255,255,.9);font-size:11px;padding:5px;color:#555;display:none}
  .tile.sel .when{display:block}
  .empty{text-align:center;padding:80px;color:#999;background:#fff;border-radius:12px}
  .pager{display:flex;gap:12px;justify-content:center;align-items:center;margin:20px 0;flex-wrap:wrap}
  .pager button{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;border-radius:8px;padding:8px 18px;cursor:pointer}
  .pager button:disabled{background:#ccc;cursor:not-allowed}`;

  const script = `
  const ALL_KEYS = ${JSON.stringify(allFilteredKeys || null)};
  const selected = new Set();
  function refresh(){ document.getElementById('selCount').textContent = selected.size;
    document.getElementById('actions').classList.toggle('hidden', selected.size===0); }
  function toggleSel(el){ const k=el.dataset.key; if(selected.has(k)){selected.delete(k);el.classList.remove('sel');}else{selected.add(k);el.classList.add('sel');} refresh(); }
  function selectPage(){ document.querySelectorAll('.tile').forEach(t=>{selected.add(t.dataset.key);t.classList.add('sel');}); refresh(); }
  function selectAllFiltered(){ if(!ALL_KEYS) return; if(!confirm('将选中当前筛选的全部 '+ALL_KEYS.length+' 个文件，确定？')) return; ALL_KEYS.forEach(k=>selected.add(k)); document.querySelectorAll('.tile').forEach(t=>{ if(selected.has(t.dataset.key)) t.classList.add('sel'); }); refresh(); }
  function goPage(n){ if(!Number.isInteger(n)||n<1) return; document.getElementById('pageField').value=n; document.getElementById('filters').submit(); }
  function fmt(urls,f){ if(f==='bbcode') return urls.map(u=>'[img]'+u+'[/img]').join('\\n\\n'); if(f==='markdown') return urls.map(u=>'![image]('+u+')').join('\\n\\n'); return urls.join('\\n\\n'); }
  function copyFmt(f){ const t=fmt([...selected],f); navigator.clipboard?.writeText(t).then(()=>alert('复制成功')).catch(()=>alert('复制失败')); }
  async function del(){ if(selected.size===0) return; if(!confirm('确定删除选中的 '+selected.size+' 个文件？此操作不可撤回。')) return;
    const res=await fetch('/delete-images',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify([...selected])});
    if(res.ok){ [...selected].forEach(k=>{ const el=document.querySelector('.tile[data-key="'+CSS.escape(k)+'"]'); if(el) el.remove(); }); selected.clear(); refresh(); alert('删除成功'); }
    else alert('删除失败'); }
  document.addEventListener('DOMContentLoaded',()=>{ const io=new IntersectionObserver((es,o)=>{ es.forEach(e=>{ if(!e.isIntersecting) return; const el=e.target; const v=el.querySelector('video'); if(v){const s=v.querySelector('source'); if(s&&s.dataset.src){v.src=s.dataset.src;v.load();}} else {const i=el.querySelector('img'); if(i&&i.dataset.src&&!i.src) i.src=i.dataset.src;} o.unobserve(el); }); },{rootMargin:'150px'});
    document.querySelectorAll('.tile').forEach(t=>io.observe(t)); });`;

  const body = `${controls}${header}${gallery}${totalPages > 1 || rows.length ? pagination : ""}<script>${script}</script>`;
  return pageLayout({ title: "图库管理", head: `<style>${css}</style>`, body });
}
```

- [ ] **Step 4: 实现 `src/handlers/admin.js`**

```js
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
```

- [ ] **Step 5: `src/router.js` 增加 `/admin`**

加 import：`import { handleAdmin } from "./handlers/admin.js";`
switch 增加：
```js
    case "/admin":
      return handleAdmin(request, env, config);
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npm test -- admin`
Expected: PASS（8 passed）

- [ ] **Step 7: Commit**

```bash
git add src/views/adminPage.js src/handlers/admin.js src/router.js test/integration/admin.test.js
git commit -m "feat: enhanced admin gallery (pagination/search/filter/sort/view scope) + page-param fix"
```

---

### Task 22: 用户管理 `/users`（仅 admin）

**Files:**
- Create: `src/views/usersPage.js`
- Create: `src/handlers/users.js`
- Modify: `src/router.js`
- Test: `test/integration/users-page.test.js`

**Interfaces:**
- Produces:
  - `usersPage({users, currentUser, error}): string`
  - `handleUsersPage(request, env, config): Promise<Response>`
  - `handleUsersAction(request, env, config, action: "create"|"update"|"delete"): Promise<Response>`
  - router 新增 `/users`、`/users/create`、`/users/update`、`/users/delete`
- 守卫：非 admin → 403；不能删自己；不能删除/降级最后一个 admin；改密会 `token_version+1`（强制下线）

- [ ] **Step 1: 写测试 `test/integration/users-page.test.js`**

```js
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../src/index.js";
import { createUser, getUserByUsername, listUsers } from "../../src/db/users.js";
import { signSession, sessionCookieHeader } from "../../src/auth/session.js";

const cookieOf = (t) => sessionCookieHeader(t).split(";")[0];
async function call(req) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const form = (token, url, body) => new Request(url, { method: "POST", headers: { Origin: "https://test.local", "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieOf(token) }, body });

let aTok, uTok, aId, uId;
beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM users").run();
  ({ id: aId } = await createUser(env.DATABASE, { username: "admin", passwordHash: "h", role: "admin", allowedTypes: "*", createdAt: 1 }));
  ({ id: uId } = await createUser(env.DATABASE, { username: "bob", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 2 }));
  aTok = await signSession({ uid: aId, role: "admin", ver: 0 }, env.SESSION_SECRET);
  uTok = await signSession({ uid: uId, role: "user", ver: 0 }, env.SESSION_SECRET);
});

describe("/users", () => {
  it("non-admin gets 403", async () => {
    const res = await call(new Request("https://test.local/users", { headers: { Cookie: cookieOf(uTok) } }));
    expect(res.status).toBe(403);
  });
  it("admin sees user list", async () => {
    const html = await (await call(new Request("https://test.local/users", { headers: { Cookie: cookieOf(aTok) } }))).text();
    expect(html).toContain("admin");
    expect(html).toContain("bob");
  });
  it("admin creates a restricted user", async () => {
    const res = await call(form(aTok, "https://test.local/users/create", "username=carol&password=secret1&role=user&allowed_types=image"));
    expect(res.status).toBe(302);
    const carol = await getUserByUsername(env.DATABASE, "carol");
    expect(carol.allowed_types).toBe("image");
  });
  it("update allowed_types persists", async () => {
    await call(form(aTok, "https://test.local/users/update", `id=${uId}&field=allowed_types&value=video`));
    const bob = await getUserByUsername(env.DATABASE, "bob");
    expect(bob.allowed_types).toBe("video");
  });
  it("cannot delete self", async () => {
    await call(form(aTok, "https://test.local/users/delete", `id=${aId}`));
    expect((await listUsers(env.DATABASE)).some((u) => u.id === aId)).toBe(true);
  });
  it("cannot delete the last admin", async () => {
    // bob is user; admin is the only admin → deleting admin blocked even via another admin? here self-delete already blocked; make bob admin then delete admin should be allowed. Test the guard: demote-protection
    await call(form(aTok, "https://test.local/users/update", `id=${aId}&field=role&value=user`));
    const stillAdmin = await getUserByUsername(env.DATABASE, "admin");
    expect(stillAdmin.role).toBe("admin"); // blocked: last admin can't be demoted
  });
  it("admin deletes another user", async () => {
    const res = await call(form(aTok, "https://test.local/users/delete", `id=${uId}`));
    expect(res.status).toBe(302);
    expect((await listUsers(env.DATABASE)).some((u) => u.id === uId)).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- users-page`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/views/usersPage.js`**

```js
import { pageLayout } from "./layout.js";
import { escapeHtml } from "../utils/html.js";

function row(u, currentUser) {
  const id = u.id;
  const self = u.id === currentUser.id;
  return `<tr>
    <td>${id}</td><td>${escapeHtml(u.username)}${self ? "（你）" : ""}</td>
    <td>
      <form method="post" action="/users/update" class="inline">
        <input type="hidden" name="id" value="${id}"><input type="hidden" name="field" value="role">
        <select name="value" onchange="this.form.submit()">
          <option value="user"${u.role === "user" ? " selected" : ""}>user</option>
          <option value="admin"${u.role === "admin" ? " selected" : ""}>admin</option>
        </select>
      </form>
    </td>
    <td>
      <form method="post" action="/users/update" class="inline">
        <input type="hidden" name="id" value="${id}"><input type="hidden" name="field" value="allowed_types">
        <input name="value" value="${escapeHtml(u.allowed_types)}" size="14" placeholder="* 或 image,video">
        <button>保存</button>
      </form>
    </td>
    <td>
      <form method="post" action="/users/update" class="inline">
        <input type="hidden" name="id" value="${id}"><input type="hidden" name="field" value="password">
        <input name="value" type="password" placeholder="新密码≥6" size="12"><button>改密</button>
      </form>
    </td>
    <td>
      <form method="post" action="/users/delete" class="inline" onsubmit="return confirm('删除用户「${escapeHtml(u.username)}」及其全部文件？')">
        <input type="hidden" name="id" value="${id}"><button class="danger"${self ? " disabled" : ""}>删除</button>
      </form>
    </td>
  </tr>`;
}

export function usersPage({ users, currentUser, error = "" }) {
  const css = `body{font-family:'Segoe UI',sans-serif;background:#f5f7fa;margin:0;padding:20px}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.06)}
  th,td{padding:10px 12px;border-bottom:1px solid #eee;text-align:left;font-size:14px}
  th{background:#667eea;color:#fff}.inline{display:inline;margin:0}input,select{padding:5px;border:1px solid #ddd;border-radius:6px}
  button{background:#667eea;color:#fff;border:none;border-radius:6px;padding:5px 10px;cursor:pointer}button.danger{background:#b3261e}
  .create{background:#fff;padding:16px;border-radius:12px;margin-bottom:16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
  a{color:#667eea} .err{background:#fdecea;color:#b3261e;padding:10px;border-radius:8px;margin-bottom:12px}`;
  const body = `
  <p><a href="/admin">← 返回图库</a></p>
  <h1>用户管理</h1>
  ${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
  <form class="create" method="post" action="/users/create">
    <input name="username" placeholder="用户名≥3" required>
    <input name="password" type="password" placeholder="密码≥6" required>
    <select name="role"><option value="user">user</option><option value="admin">admin</option></select>
    <input name="allowed_types" value="*" size="14" placeholder="* 或 image,video">
    <button>创建用户</button>
  </form>
  <table><thead><tr><th>ID</th><th>用户名</th><th>角色</th><th>允许类型</th><th>重置密码</th><th>操作</th></tr></thead>
  <tbody>${users.map((u) => row(u, currentUser)).join("")}</tbody></table>`;
  return pageLayout({ title: "用户管理", head: `<style>${css}</style>`, body });
}
```

- [ ] **Step 4: 实现 `src/handlers/users.js`**

```js
import { resolveUser, isSameOrigin } from "../auth/middleware.js";
import {
  listUsers, getUserById, getUserByUsername, createUser,
  updateUserRole, updateUserAllowedTypes, updateUserPassword, deleteUser, countAdmins,
} from "../db/users.js";
import { hashPassword } from "../auth/password.js";
import { normalizeAllowedTypes } from "../auth/filetypes.js";
import { htmlResponse, redirect } from "../utils/http.js";
import { usersPage } from "../views/usersPage.js";

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
  return htmlResponse(usersPage({ users, currentUser: g.auth.user }), 200, { "Cache-Control": "no-store" });
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
    await deleteUser(db, id);
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
```

- [ ] **Step 5: `src/router.js` 增加 users 路由**

加 import：`import { handleUsersPage, handleUsersAction } from "./handlers/users.js";`
switch 增加：
```js
    case "/users":
      return handleUsersPage(request, env, config);
    case "/users/create":
      return handleUsersAction(request, env, config, "create");
    case "/users/update":
      return handleUsersAction(request, env, config, "update");
    case "/users/delete":
      return handleUsersAction(request, env, config, "delete");
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npm test -- users-page`
Expected: PASS（7 passed）

- [ ] **Step 7: Commit**

```bash
git add src/views/usersPage.js src/handlers/users.js src/router.js test/integration/users-page.test.js
git commit -m "feat: admin user management (create/role/allowed_types/password/delete with guards)"
```

---

### Task 23: API Key 管理 `/apikeys`

**Files:**
- Create: `src/views/apikeysPage.js`
- Create: `src/handlers/apikeysUi.js`
- Modify: `src/router.js`
- Test: `test/integration/apikeys-page.test.js`

**Interfaces:**
- Produces:
  - `apikeysPage({keys, newKeyPlain, user}): string`（`newKeyPlain` 非空时一次性显示明文）
  - `handleApiKeysPage(request, env, config, newKeyPlain=null): Promise<Response>`
  - `handleApiKeysAction(request, env, config, action: "create"|"delete"): Promise<Response>`
  - router 新增 `/apikeys`、`/apikeys/create`、`/apikeys/delete`

- [ ] **Step 1: 写测试 `test/integration/apikeys-page.test.js`**

```js
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../src/index.js";
import { createUser } from "../../src/db/users.js";
import { listApiKeys } from "../../src/db/apikeys.js";
import { signSession, sessionCookieHeader } from "../../src/auth/session.js";

const cookieOf = (t) => sessionCookieHeader(t).split(";")[0];
async function call(req) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const form = (token, url, body) => new Request(url, { method: "POST", headers: { Origin: "https://test.local", "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieOf(token) }, body });

let tok, uid;
beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM api_keys").run();
  await env.DATABASE.prepare("DELETE FROM users").run();
  ({ id: uid } = await createUser(env.DATABASE, { username: "u", passwordHash: "h", role: "user", allowedTypes: "*", createdAt: 1 }));
  tok = await signSession({ uid, role: "user", ver: 0 }, env.SESSION_SECRET);
});

describe("/apikeys", () => {
  it("redirects to /login when anonymous", async () => {
    expect((await call(new Request("https://test.local/apikeys"))).status).toBe(302);
  });
  it("create shows plaintext once and persists a hashed key", async () => {
    const res = await call(form(tok, "https://test.local/apikeys/create", "name=mykey"));
    const html = await res.text();
    expect(html).toMatch(/uf_[A-Za-z0-9_-]+/); // 明文一次性展示
    const keys = await listApiKeys(env.DATABASE, uid);
    expect(keys).toHaveLength(1);
    expect(keys[0].name).toBe("mykey");
  });
  it("list page does not expose plaintext or hash", async () => {
    await call(form(tok, "https://test.local/apikeys/create", "name=k"));
    const html = await (await call(new Request("https://test.local/apikeys", { headers: { Cookie: cookieOf(tok) } }))).text();
    expect(html).toContain("uf_"); // 仅前缀
    expect(html).not.toMatch(/uf_[A-Za-z0-9_-]{30,}/); // 不含完整明文
  });
  it("delete revokes the key", async () => {
    await call(form(tok, "https://test.local/apikeys/create", "name=k"));
    const [k] = await listApiKeys(env.DATABASE, uid);
    const res = await call(form(tok, "https://test.local/apikeys/delete", `id=${k.id}`));
    expect(res.status).toBe(302);
    expect(await listApiKeys(env.DATABASE, uid)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test -- apikeys-page`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/views/apikeysPage.js`**

```js
import { pageLayout } from "./layout.js";
import { escapeHtml } from "../utils/html.js";

export function apikeysPage({ keys, newKeyPlain, user }) {
  const css = `body{font-family:'Segoe UI',sans-serif;background:#f5f7fa;margin:0;padding:20px}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.06)}
  th,td{padding:10px 12px;border-bottom:1px solid #eee;text-align:left;font-size:14px}th{background:#667eea;color:#fff}
  button{background:#667eea;color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer}button.danger{background:#b3261e}
  .create,.newkey,.docs{background:#fff;padding:16px;border-radius:12px;margin-bottom:16px}
  .newkey{background:#e8f5e9;border:1px solid #66bb6a}.newkey code{font-size:15px;word-break:break-all}
  input{padding:6px;border:1px solid #ddd;border-radius:6px}a{color:#667eea}pre{background:#272822;color:#f8f8f2;padding:12px;border-radius:8px;overflow:auto}`;
  const newBanner = newKeyPlain
    ? `<div class="newkey"><b>新 API Key（仅显示这一次，请立即保存）：</b><br><code>${escapeHtml(newKeyPlain)}</code></div>`
    : "";
  const rows = keys.length
    ? keys.map((k) => `<tr>
        <td>${escapeHtml(k.name || "(无名)")}</td>
        <td><code>${escapeHtml(k.key_prefix)}…</code></td>
        <td>${escapeHtml(new Date(k.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }))}</td>
        <td>${k.last_used_at ? escapeHtml(new Date(k.last_used_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })) : "从未"}</td>
        <td><form method="post" action="/apikeys/delete" style="display:inline" onsubmit="return confirm('撤销该 Key？')"><input type="hidden" name="id" value="${k.id}"><button class="danger">撤销</button></form></td>
      </tr>`).join("")
    : `<tr><td colspan="5" style="text-align:center;color:#999">还没有 API Key</td></tr>`;
  const body = `
  <p><a href="/admin">← 返回图库</a></p>
  <h1>API Key 管理</h1>
  ${newBanner}
  <form class="create" method="post" action="/apikeys/create">
    <input name="name" placeholder="备注名（可选）" maxlength="64">
    <button>创建新 Key</button>
  </form>
  <table><thead><tr><th>备注</th><th>前缀</th><th>创建时间</th><th>最近使用</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="docs"><b>用法（仅上传）：</b>
    <pre>curl -X POST https://&lt;your-domain&gt;/api/upload \\
  -H "Authorization: Bearer &lt;API_KEY&gt;" \\
  -F "file=@/path/to/image.png"</pre>
    也支持请求头 <code>X-API-Key: &lt;API_KEY&gt;</code>。
  </div>`;
  return pageLayout({ title: "API Key 管理", head: `<style>${css}</style>`, body });
}
```

- [ ] **Step 4: 实现 `src/handlers/apikeysUi.js`**

```js
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
```

- [ ] **Step 5: `src/router.js` 增加 apikeys 路由**

加 import：`import { handleApiKeysPage, handleApiKeysAction } from "./handlers/apikeysUi.js";`
switch 增加：
```js
    case "/apikeys":
      return handleApiKeysPage(request, env, config);
    case "/apikeys/create":
      return handleApiKeysAction(request, env, config, "create");
    case "/apikeys/delete":
      return handleApiKeysAction(request, env, config, "delete");
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npm test -- apikeys-page`
Expected: PASS（4 passed）

- [ ] **Step 7: Commit**

```bash
git add src/views/apikeysPage.js src/handlers/apikeysUi.js src/router.js test/integration/apikeys-page.test.js
git commit -m "feat: API key management UI (create once-shown / list / revoke)"
```

---

### Task 24: 清理旧文件、README 升级指引、全量测试

**Files:**
- Delete: `_worker.js`（确认 `views/homePage.js` 已移植其上传 UI 后再删）
- Modify: `README.md`
- Test: 全量 `npm test`

- [ ] **Step 1: 确认 homePage 已移植旧上传 UI**

Run: `npm test -- home`
Expected: PASS（断言含 `action="/upload"`）。若失败，先回到 Task 15 完成移植。

- [ ] **Step 2: 删除旧入口 `_worker.js`**

```bash
git rm _worker.js
```

- [ ] **Step 3: 重写 `README.md`（关键章节，完整内容）**

替换「部署步骤」「变量说明」为下列内容（其余介绍可保留）：

````markdown
## 部署（wrangler）

### 1. 环境变量 / Secret
| 名称 | 类型 | 必填 | 说明 |
|------|------|------|------|
| DOMAIN | var | 是 | 你的自定义域名，如 img.example.com |
| DATABASE | D1 binding | 是 | 绑定名固定为 DATABASE |
| SESSION_SECRET | secret | 是 | 会话签名密钥，随机长字符串 |
| TG_BOT_TOKEN | secret | 是 | Telegram Bot Token |
| TG_CHAT_ID | secret | 是 | Telegram 频道/群组 ID |
| MAX_SIZE_MB | var | 否 | 单文件上限，默认 20 |

### 2. 安装与配置
```bash
npm install
# 在 wrangler.toml 填入 D1 database_id 与 DOMAIN
wrangler secret put SESSION_SECRET
wrangler secret put TG_BOT_TOKEN
wrangler secret put TG_CHAT_ID
```

### 3. 应用数据库迁移
```bash
wrangler d1 migrations apply DATABASE --remote
```
迁移会创建 users/api_keys 表，并给 media 添加 owner 与元数据列（含存量数据回填）。

### 4. 部署
```bash
wrangler deploy
```

### 5. 初始化管理员
首次访问 `https://<domain>/setup` 创建第一个管理员账号。**存量图片会自动归属到该管理员。** 创建后 /setup 自动关闭。

## 使用
- 网页端：`/login` 登录 → `/`（上传）、`/admin`（图库）、`/users`（管理员管理用户）、`/apikeys`（管理 API Key）。
- 程序化上传（API Key，仅上传）：
```bash
curl -X POST https://<domain>/api/upload \
  -H "Authorization: Bearer <API_KEY>" \
  -F "file=@./image.png"
```

## 从旧版（单文件 _worker.js）升级
1. 拉取新代码，按上文配置 wrangler 与 SESSION_SECRET。
2. 运行 `wrangler d1 migrations apply DATABASE --remote`。
3. `wrangler deploy`。
4. 访问 `/setup` 建管理员；旧图片自动归属。
5. 旧变量 USERNAME/PASSWORD/ADMIN_PATH/ENABLE_AUTH 已弃用，可删除。
````

- [ ] **Step 4: 跑全量测试**

Run: `npm test`
Expected: PASS（全部 suites 通过）。如有失败，按失败用例定位修复后再继续。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove legacy _worker.js; rewrite README for wrangler + multi-user"
```

---

## 自检与覆盖

- **Spec §5 数据模型** → Task 2（迁移）✓
- **Spec §6 认证与会话**（无状态 cookie / setup / login / logout / token_version / CSRF / 限速）→ Task 4、11、13、14 ✓
- **Spec §7 多用户与权限**（角色 / 仅 admin 建号 / 删用户级联 / 最后 admin 保护）→ Task 8、22 ✓
- **Spec §8 上传与文件类型限制**（需登录 / owner / allowed_types / 移除 ENABLE_AUTH）→ Task 6、15、16、17 ✓
- **Spec §9 后台增强**（参数化分页 / 跳页 / 每页数量 / 排序 / 搜索 / 类型筛选 / 视图切换 / 全选修正 / 用户管理页 / apikey 页）→ Task 21、22、23 ✓
- **Spec §10 API 仅上传** → Task 17 ✓
- **Spec §11 Bug 修复**（page NaN、临时失败缓存、`:` 截断随会话化消失、死代码、删除 owner 校验、全选语义）→ Task 16/18/20/21 ✓
- **Spec §13 安全**（PBKDF2 / cookie 属性 / key 仅存 hash / CSRF / 越权 / setup 一次性）→ Task 3、4、5、11、13、20、22 ✓
- **Spec §14 测试** → 各任务 TDD + Task 24 全量 ✓
- **Spec §15 升级指引** → Task 24 ✓
