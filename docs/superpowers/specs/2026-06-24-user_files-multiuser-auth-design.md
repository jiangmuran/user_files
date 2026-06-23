# 设计方案：user_files 多用户化改造（多用户 / API key / 安全密码 / 增强后台 / Bug 修复）

- **日期**: 2026-06-24
- **状态**: 待评审（Draft）
- **项目**: jiangmuran/user_files（Telegraph 图床，Cloudflare Worker + D1 + Telegram Bot API）

---

## 1. 背景与现状

当前是单文件 `_worker.js`（约 1700 行，内含全部 HTML/CSS/JS），核心：

- 路由：`/`（上传页）、`/${ADMIN_PATH}`（图库后台）、`/upload`（POST 上传）、`/bing-images`、`/delete-images`、默认 → 图片服务。
- 鉴权：HTTP Basic Auth，比对 `USERNAME`/`PASSWORD` **明文环境变量**（单管理员）。
- 存储：文件存 Telegram，D1 表 `media(url TEXT PRIMARY KEY, fileId TEXT NOT NULL)` 存映射。
- 后台已有服务端分页（`?page=N`、每页 50、上/下页），但有 bug（见 §9）。

## 2. 目标与非目标

### 目标
1. 修复已知 bug（§9）。
2. **增强管理后台分页**：跳页、每页数量、排序、搜索、类型筛选。
3. **多用户**：多账号 + 角色（admin/user），文件**按用户隔离**。
4. **API key**：用于程序化**上传**（PicGo/ShareX 等），按 key 所属用户归属。
5. **安全密码存储**：PBKDF2-SHA256，告别明文。
6. **上传一律需登录**（移除匿名上传）。
7. **admin 可选查看全部用户的文件**。
8. **每个用户可上传的文件类型可限制**。

### 非目标（YAGNI）
- 不做公开注册（仅 admin 建号）。
- 不做 API 的列表/删除/管理接口（API key **仅上传**）。
- 不做从 Telegram 端真正删除文件（原项目也未做，删除仅去 DB + Cache）。
- 不做按用户的存储配额/大小限制（保留全局 `MAX_SIZE_MB`）。

## 3. 已锁定的关键决策

| 议题 | 决策 |
|------|------|
| 部署形态 | wrangler 多文件项目，wrangler 原生 bundle，`main = src/index.js`；D1 binding 名 `DATABASE` 不变 |
| 网页端登录 | **无状态签名 cookie**（HMAC-SHA256），`/login`、`/logout`，`users.token_version` 支持强制下线 |
| 会话密钥 | 新增 secret `SESSION_SECRET`（必填） |
| 文件归属 | **按用户隔离**：`media.owner_id`；user 只见自己，admin 可看全部 |
| 首次引导 | **首次运行 `/setup` 向导**创建首个 admin；建成后 /setup 关闭；存量 media 归该 admin |
| API key 范围 | **仅上传**（`POST /api/upload`） |
| 密码哈希 | PBKDF2-SHA256，随机 16B salt，存 `pbkdf2$<iter>$<salt_b64>$<hash_b64>` |
| 注册 | 仅 admin 建号，无公开注册 |
| 上传鉴权 | 一律需登录；移除 `ENABLE_AUTH` |
| 文件类型限制 | 每个用户 `allowed_types`（类别白名单或 `*`），上传按扩展名→类别校验 |

## 4. 架构总览

```
user_files/
  wrangler.toml            # name, main=src/index.js, compatibility_date, [[d1_databases]], [vars]
  package.json             # devDeps: wrangler, vitest, @cloudflare/vitest-pool-workers
  vitest.config.js
  migrations/
    0001_users_apikeys.sql
    0002_alter_media.sql
  src/
    index.js               # 入口：构造 config + 调 router
    config.js              # 从 env 提取配置
    router.js              # 路由表 + 分发
    auth/
      password.js          # pbkdf2 hash / verify（constant-time）
      session.js           # cookie 签名 / 校验（HMAC-SHA256, exp, token_version）
      apikey.js            # 生成 / sha256 / 校验
      filetypes.js         # 扩展名→类别映射 + allowed_types 校验
      middleware.js        # resolveUser / requireAuth / requireAdmin / csrfCheck
    db/
      users.js             # CRUD + token_version 自增
      apikeys.js           # CRUD（按 user 隔离）
      media.js             # 分页/搜索/筛选查询 + 插入（带元数据）+ owner 校验删除
    handlers/
      home.js              # GET / 上传页（需登录）
      login.js             # GET/POST /login, POST /logout
      setup.js             # GET/POST /setup（仅首次）
      upload.js            # POST /upload（会话）
      apiUpload.js         # POST /api/upload（API key）
      admin.js             # GET 后台图库（分页/搜索/筛选/视图切换）
      users.js             # admin 用户管理（建/改/删/改密/改 allowed_types/改角色）
      apikeysUi.js         # API key 管理（建/列/撤销）
      delete.js            # POST /delete-images（会话，owner 校验）
      image.js             # 默认路由：图片服务（修复缓存 bug）
      bing.js              # GET /bing-images
    views/                 # 模板字符串函数，返回 HTML
      layout.js  homePage.js  loginPage.js  setupPage.js
      adminPage.js  usersPage.js  apikeysPage.js  styles.js
    utils/
      html.js              # escapeHtml、HTML 响应
      http.js              # jsonResponse、redirect、错误响应、cookie 读写
  test/
    unit/        password.test.js  session.test.js  apikey.test.js  filetypes.test.js  media-query.test.js
    integration/ auth-flow.test.js  upload.test.js  admin.test.js  setup.test.js  api-upload.test.js
  README.md                # 重写部署/升级指引
```

每个模块单一职责、通过明确接口通信、可独立测试。`views/` 与 `handlers/` 分离，避免再出现单文件巨石。

## 5. 数据模型（D1 迁移）

### 0001_users_apikeys.sql
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,             -- pbkdf2$<iter>$<salt_b64>$<hash_b64>
  role TEXT NOT NULL DEFAULT 'user',       -- 'admin' | 'user'
  allowed_types TEXT NOT NULL DEFAULT '*', -- '*' 或逗号分隔类别：image,video,other
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,
  key_hash TEXT NOT NULL UNIQUE,           -- sha256 hex（key 高熵，无需慢 KDF）
  key_prefix TEXT,                         -- 展示用前缀，如 uf_AbCd…
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);
```

### 0002_alter_media.sql
```sql
ALTER TABLE media ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE media ADD COLUMN created_at INTEGER;
ALTER TABLE media ADD COLUMN filename TEXT;
ALTER TABLE media ADD COLUMN content_type TEXT;
ALTER TABLE media ADD COLUMN extension TEXT;
ALTER TABLE media ADD COLUMN size INTEGER;

-- 存量回填：从 URL 末段 <timestamp>.<ext> 反推
UPDATE media
  SET created_at = CAST(substr(substr(url, instr(url,'/')+1), 1,
        instr(substr(url, instr(url,'/')+1), '.')-1) AS INTEGER)
  WHERE created_at IS NULL;  -- 实际以代码迁移更稳妥，SQL 仅示意
CREATE INDEX idx_media_owner_created ON media(owner_id, created_at DESC);
CREATE INDEX idx_media_extension ON media(extension);
```
> 注：`created_at`/`extension` 的回填用代码（迁移脚本或 /setup 时）做更稳妥，避免 SQL 字符串函数边界问题；`owner_id` 留空，待 /setup 建首个 admin 后 `UPDATE media SET owner_id = ? WHERE owner_id IS NULL`。

## 6. 认证与会话

### 网页端（无状态签名 cookie）
- `GET /login`：登录表单。`POST /login`：取 username/password，查 `users`，PBKDF2 verify。成功则签发 cookie。
- Cookie 载荷：`base64url(JSON{uid, role, ver, exp})` + `.` + `base64url(HMAC_SHA256(payload, SESSION_SECRET))`。
- 属性：`HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=<7d>`。
- 校验：验签 → 检查 `exp` 未过期 → 查 `users.token_version === ver`（不等＝已强制下线）。
- `POST /logout`：清 cookie（Set-Cookie Max-Age=0）。
- 改密 / 「强制下线」：`token_version += 1`，使旧 cookie 失效。

### API（API key）
- `POST /api/upload`，头 `Authorization: Bearer <key>`（兼容 `X-API-Key: <key>`）。
- 校验：对 key 取 SHA-256 → 查 `api_keys.key_hash` → 取 `user_id` → 更新 `last_used_at`。
- 失败：401 JSON。

### 中间件
- `resolveUser(request)`：先看 cookie，再看 API key 头，返回 `{user, via}` 或 null。
- `requireAuth`：无身份时 web→302 `/login`，api→401 JSON。
- `requireAdmin`：非 admin→web 403 页 / api 403 JSON。
- `csrfCheck`：状态变更 POST（/upload、/delete-images、/users*、/apikeys*）校验 `Origin`/`Referer` 同源；配合 `SameSite=Strict`。API（bearer，不依赖 cookie）免 CSRF。

### 首次引导 /setup
- 仅当 `users` 表为空时可用：`GET /setup` 显示创建首个管理员表单；`POST /setup` 创建 `role='admin'` 用户（PBKDF2 哈希），并 `UPDATE media SET owner_id=<adminId> WHERE owner_id IS NULL`。
- 已存在用户时访问 /setup → 302 `/login`。

### 登录限速（基础版）
- 按 `username + IP` 维度记失败次数（D1 轻量表或内存 Map，TTL 窗口）；超阈值短暂锁定，返回 429。实现从简，避免阻塞主流程。

## 7. 多用户与权限

- 角色：**admin** / **user**。
  - admin：管理全部用户（建/删/改密/改角色/改 `allowed_types`）；图库可看全部、按用户筛选；管理自己的 API key。
  - user：上传；只见/管自己的文件；管理自己的 API key；改自己的密码。
- **无公开注册**：只有 admin 能建号。
- 删用户：级联删其 `media` 行 + Cache + `api_keys`（`ON DELETE CASCADE`）；Telegram 端文件维持不可删现状。
- admin 不可删除自己 / 不可把最后一个 admin 降级（防锁死）。

## 8. 上传、归属与文件类型限制

### 上传路径
- `POST /upload`（网页，会话）：owner = 当前登录用户。
- `POST /api/upload`（API key）：owner = key 所属用户。
- 两者统一逻辑：校验大小（全局 `MAX_SIZE_MB`）→ **校验文件类型策略** → 转存 Telegram → 写 `media`（含 `owner_id, filename, content_type, extension, size, created_at`）。
- 移除 `ENABLE_AUTH`：未登录访问 `/` 与 `/upload` 一律 302 / 401。

### 文件类型策略（每用户）
- `users.allowed_types`：`'*'`（全部）或逗号分隔类别集合，类别取值 `image` / `video` / `other`。
- 类别映射（`auth/filetypes.js`）：
  - `image`: jpg, jpeg, png, gif, webp, bmp, svg, tiff …
  - `video`: mp4, avi, mov, webm, mkv, wmv, flv …
  - `other`: 其余一切扩展名（文档/压缩包等）。
- 校验：由 `file.name` 取扩展名 → 映射类别 → 若 `allowed_types !== '*'` 且类别 ∉ 集合 → 拒绝（web 提示 + api 415/400 JSON），消息形如「你的账号不允许上传 <category> 文件（允许：image,video）」。
- 默认：新用户 `allowed_types='*'`；admin 在用户管理页按需收紧。admin 自身亦受其策略约束（默认 `*`），无特殊豁免，行为可预期。

## 9. 管理后台增强（分页）

- 服务端分页**参数化 bind**（修当前字符串拼接的 `LIMIT/OFFSET`）；`page` clamp 到 `[1, totalPages]`，NaN/负数归 1。
- 新增能力：
  - 跳页输入框（输入页码跳转）。
  - 每页数量选择：20 / 50 / 100。
  - 排序：时间↑↓、类型、大小。
  - 搜索：文件名 / URL `LIKE`（参数化）。
  - 类型筛选：图片 / 视频 / 其它。
  - **视图切换（admin）**：全部 / 仅自己 / 按指定用户筛选（默认全部）；user 恒为仅自己。
- 「全选」语义修正为**全选本页**；另加「全选当前筛选的全部结果」（带数量二次确认，防误删跨页）。
- 查询统一走 `db/media.js`，根据 `{viewerId, role, viewUser, search, types, sort, page, pageSize}` 构造 `WHERE/ORDER/LIMIT`，并附带同条件的 `COUNT`。
- 新增页面：**API key 管理页**（建/列/撤销，建时明文只显示一次）、**用户管理页**（admin）。

## 10. API（仅上传）

- `POST /api/upload`：multipart `file` 或原始 body；鉴权用 API key。
- 响应：`{ "url": "https://<domain>/<ts>.<ext>" }`；错误 `{ "error": "..." }` + 合适状态码。
- 文档给出 PicGo/ShareX/curl 示例。

## 11. Bug 修复清单

| # | 位置 | 问题 | 修复 |
|---|------|------|------|
| 1 | `_worker.js:919, 1545` | `?page=abc`/负数 → `OFFSET NaN` → 后台 500 | clamp + 参数化 bind |
| 2 | `:1626` | Telegram getFile **临时**失败被永久缓存为 404 | 仅缓存「DB 无记录」404；getFile 失败返回 502 且**不缓存** |
| 3 | `:106` | Basic Auth `split(':')`，密码含 `:` 被截断 | 随会话化移除（API 用 bearer，无此问题） |
| 4 | `:1586` | 死代码 `isImage` | 删除；上传元数据改为显式计算 |
| 5 | `:1678` | 删除接口无 owner 校验 | 按 `owner_id` 校验，user 仅能删自己（admin 全权） |
| 6 | `:1403` | 「全选」只选当前页 | 语义明确化 + 跨页全选选项（带确认） |

## 12. 错误处理

- `/api/*` 与 `/upload`：JSON 错误体 + 状态码（400/401/403/413/415/500/502）。
- 网页路由：HTML 错误页或 302 重定向；鉴权失败 web→/login，api→401。
- 上传失败 / TG 失败 / DB 失败分别映射，日志 `console.error` 保留。

## 13. 安全考量

- 密码：PBKDF2-SHA256，≥150k 迭代，16B 随机 salt，验证用 constant-time 比较。
- 会话：HttpOnly + Secure + SameSite=Strict + 签名 + 过期 + token_version。
- API key：高熵随机（32B → base64url，前缀 `uf_`），仅存 SHA-256；明文只在创建时回显一次。
- CSRF：状态变更 POST 校验同源 + SameSite=Strict。
- 越权：所有按 owner 的读写都强制 `owner_id` 约束（admin 例外）。
- `/setup` 仅在零用户时可用，防重复初始化。
- 登录限速防暴力破解（基础版）。

## 14. 测试策略（实现走 TDD）

- 框架：vitest + `@cloudflare/vitest-pool-workers`；测试启动时 apply migrations 到隔离 D1。
- **单元**：password hash/verify（含错误密码）；session sign/verify（过期、篡改、token_version 失效）；apikey 生成/哈希/校验；filetypes 映射与 allowed_types 校验；media 查询构造（分页/搜索/筛选/排序、owner 约束）。
- **集成**：/setup 仅首次有效；/login→cookie→/admin 可达、未登录被挡；user 看不到他人文件、admin 可看全部；/api/upload with key 归属正确、被限类型时拒绝；删除按 owner 校验；删用户级联；分页边界（NaN/越界）。

## 15. 升级 / 迁移指引（README 重写）

1. 改用 wrangler：`wrangler.toml` 填 D1 `database_id`、`DOMAIN`；`wrangler secret put TG_BOT_TOKEN / TG_CHAT_ID / SESSION_SECRET`。
2. 应用迁移：`wrangler d1 migrations apply <db>`（含存量 media 元数据回填）。
3. 部署：`wrangler deploy`。
4. 初始化：访问 `/setup` 创建首个管理员；存量文件自动归该管理员。
5. 旧 `USERNAME`/`PASSWORD`/`ADMIN_PATH`/`ENABLE_AUTH` 不再使用（admin 路径并入登录后的 `/admin`，或保留可配）。

## 16. 待确认 / 开放问题

1. **文件类型粒度**：当前设计为「类别」（image/video/other）。若你要**精确到扩展名**白名单（如只允许 png/webp），告诉我，改为扩展名级。
2. **API key 头**：默认 `Authorization: Bearer`，兼容 `X-API-Key`。是否够用？
3. **后台路径**：原 `ADMIN_PATH` 可配置后台路径。会话化后建议固定 `/admin`（登录后才可达）。是否保留可配路径？
4. **新用户默认类型**：当前默认 `*`（全部）。是否要默认更严格（如仅 `image`）？
