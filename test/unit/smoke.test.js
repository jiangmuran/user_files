import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../../src/index.js";

describe("smoke", () => {
  it("responds 200 and DATABASE binding exists", async () => {
    const req = new Request("https://example.com/setup");
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(env.DATABASE).toBeDefined();
  });
});
