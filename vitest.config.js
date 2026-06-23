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
