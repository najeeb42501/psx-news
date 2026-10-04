// Admin session cookie: "<payload>.<signature>", where payload is base64url JSON {e: email, x: expiry ms}
// and signature is HMAC-SHA256 with ADMIN_SESSION_SECRET. Web Crypto only, so proxy.ts can use it too.
// It proves who signed in and until when; lib/admin.ts also re-checks the email against admin_users.

export const SESSION_COOKIE = "sk_session";
export const SESSION_DAYS = 7;

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function key(): Promise<CryptoKey | null> {
  const secret = process.env.ADMIN_SESSION_SECRET ?? "";
  if (secret.length < 32) return null; // no (or a weak) secret: nobody can sign in
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(email: string, now = Date.now()): Promise<string | null> {
  const k = await key();
  if (!k) return null;
  const payload = b64url(enc.encode(JSON.stringify({ e: email, x: now + SESSION_DAYS * 86_400_000 })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(payload)));
  return `${payload}.${b64url(sig)}`;
}

/** The signed-in email, or null if the cookie is missing, forged or expired. */
export async function readSession(cookie: string | undefined, now = Date.now()): Promise<string | null> {
  const k = await key();
  if (!k || !cookie) return null;
  const [payload, sig] = cookie.split(".");
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", k, fromB64url(sig), enc.encode(payload));
    if (!ok) return null;
    const { e, x } = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { e: string; x: number };
    return typeof e === "string" && typeof x === "number" && x > now ? e : null;
  } catch {
    return null;
  }
}
