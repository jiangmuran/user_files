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
