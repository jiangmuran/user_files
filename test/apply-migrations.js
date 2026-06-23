import { applyD1Migrations, env } from "cloudflare:test";

// 每个测试文件运行前把 migrations 应用到隔离的 D1
await applyD1Migrations(env.DATABASE, env.TEST_MIGRATIONS);
