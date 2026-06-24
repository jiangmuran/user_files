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
// media.owner_id FK -> users(id). Seed the owner rows used below (ids 1,2,7) so
// the FK constraint is satisfied. AUTOINCREMENT on a cleared table yields 1,2,3...
async function seedUsers(ids) {
  for (const id of ids) {
    await env.DATABASE
      .prepare("INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .bind(id, `u${id}`, "h", 0)
      .run();
  }
}
beforeEach(async () => {
  await env.DATABASE.prepare("DELETE FROM media").run();
  await env.DATABASE.prepare("DELETE FROM users").run();
  await seedUsers([1, 2, 7]);
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
