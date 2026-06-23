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
