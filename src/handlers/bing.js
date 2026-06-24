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
