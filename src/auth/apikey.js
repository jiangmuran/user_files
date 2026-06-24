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
