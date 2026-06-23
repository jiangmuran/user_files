🎉基于R2储存的图床/视频床/文件床项目已完成，欢迎部署测试👉[JSimages](https://github.com/0-RTT/JSimages)

# Telegraph图床

基于 Cloudflare Worker 和 Telegram Bot API 的图床/视频床/文件床服务。
本仓库为 **wrangler 模块化 + 多用户认证** 重写版（替代旧版单文件 `_worker.js`）。

## 功能特点

### 核心功能
- 🔐 多用户认证：账号密码登录（PBKDF2 哈希），无状态签名 Cookie 会话
- 👥 角色与权限：admin / user 两种角色，仅 admin 可创建/删除用户
- 🔑 API Key：可签发仅用于上传的 API Key（程序化上传）
- 🗜️ 可选的图片压缩功能（默认开启，支持前端切换）
- 📦 可选的文件大小限制（默认 20MB，可通过环境变量配置）
- 📁 支持所有文件格式上传（图片、视频、文档等），可按类型（image/video/other）限制
- 📤 支持多文件上传、拖拽上传和粘贴上传（Ctrl+V）
- 🔄 哈希校验避免重复上传

### 管理功能
- 📋 支持查看本地历史记录
- 🖼️ 图库管理界面：分页/跳页/每页数量、排序、搜索、类型筛选、视图切换、批量操作
- 🗑️ 支持批量删除文件（owner 校验，同步删除数据库记录和缓存）
- ⏰ 显示文件上传时间
- 📋 支持多种格式复制链接（URL、BBCode、Markdown）
- 🧑‍💼 用户管理页 `/users`、API Key 管理页 `/apikeys`

### 性能优化
- ⚡ Cloudflare Cache API 缓存支持
- 🎨 懒加载和骨架屏优化
- 🌅 Bing 每日壁纸背景（自动轮播）
- 📱 响应式设计，支持移动端
- 🔁 自动重试机制（获取文件路径最多重试3次）

### 存储方式
- 📡 基于 Telegram Bot API 的文件存储
- 💾 使用 Cloudflare D1 数据库存储文件映射、用户与 API Key
- 🎯 通过 fileId 实现文件访问

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

> 本地开发可用 `wrangler d1 migrations apply DATABASE --local`（对应 `npm run migrate:local`）。

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

## 创建 Telegram Bot 与频道（首次部署）

### 创建 Telegram Bot
1. 在 Telegram 中找到 [@BotFather](https://t.me/BotFather)
2. 发送 `/newbot` 命令创建新机器人
3. 按照提示设置机器人名和用户名
4. 保存获得的 Bot Token (格式为`123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
   - 这个 Token 用作 secret `TG_BOT_TOKEN`

### 创建 Telegram 频道或群组
1. 创建一个新的频道或群组
2. 将你的 Bot 添加为管理员
3. 获取频道/群组 ID：
   - 发送频道内的任意消息给 [@getidsbot](https://t.me/getidsbot)
   - 在 Origin chat 下找到对应的 ID (格式为 `-100xxxxxxxxxx`)
   - 这个 ID 用作 secret `TG_CHAT_ID`

## 更新日志

> **最近更新**: 2026-06-24
> - 重写为 wrangler 模块化项目，新增多用户认证 / API Key / 增强后台；移除旧版单文件 `_worker.js`

<details>
<summary>历史更新记录</summary>

### 2026-06-24
- 重写为 wrangler 模块化项目，新增多用户认证 / API Key / 增强后台；移除旧版单文件 `_worker.js`

### 2026-01-19
- 使用Claude优化了一下代码

### 2025-08-24
- 修复cdn.bytedance.com下线导致的页面加载异常的问题

### 2025-08-07
- 修复主页背景图片无法加载的问题

### 2024-12-18
- 更新管理界面样式
- 移除前端的文件类型和文件大小限制
- 通过环境变量控制上传文件的大小

### 2024-12-17
- 在前端新增一个压缩按钮，用于控制压缩功能，默认状态为开启。

### 2024-12-13
- 通过哈希校验来避免重复上传。
- 调整压缩率为0.75，同时去除分辨率限制。
- 给删除接口 `/delete-images` 添加了认证检查。

### 2024-11-29
#### 管理页面
- 新增全选和复制功能
- 删除前进行二次确认
- 优化资源加载逻辑
- 禁用视频文件自动播放
#### 首页
- 修复粘贴上传时不显示移除按钮的问题

### 2024-11-21日
- 优化上传体验，默认开启压缩，加快文件上传速度

### 2024-11-01
- 修复上传后无法加载的问题

### 2024-10-19
- 修复webp无法上传的BUG
- 优化数据库结构，[查看迁移教程](https://github.com/0-RTT/telegraph/releases/tag/v2.0)

### 2024-09-29
- 优化缓存功能，采用 Cloudflare Cache API 缓存支持

### 2024-09-25
- 修复GIF文件上传的问题，感谢 [nodeseek](https://www.nodeseek.com/) 用户 [@Libs](https://www.nodeseek.com/space/7214#/general) 提供的思路
- Telegraph接口移到了telegraph分支，main分支为TG_BOT接口

### 2024-09-23
- 修复链接失效的问题，支持视频文件上传

### 2024-09-14
- Telegraph接口上传的文件有**时效性**，建议使用TG_BOT上传

### 2024-09-13
- 支持通过TG_BOT上传到频道

### 2024-09-12
- 已修复，可正常上传到telegraph

### 2024-09-06
> ~~2024年9月6日起 telegra.ph 禁止了上传媒体文件，此项目终结。~~

</details>

## 开源协议

MIT License

## 💰赞助商

- [NodeSupport](https://github.com/NodeSeekDev/NodeSupport)
- [![yxvm_support.png](https://kycloud3.koyoo.cn/20250411e0a01202504111413152588.png)](https://yxvm.com/)
