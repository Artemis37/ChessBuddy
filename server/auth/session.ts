import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "chessbuddy_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Sessions are signed cookies rather than database rows, so checking one never touches
 * Azure SQL and the free-tier database can stay paused while you play.
 * The token is `base64url(payload).base64url(HMAC-SHA256(payload))`.
 */
export function signSession(username: string, secret: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: now + SESSION_TTL_MS })).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

/** The signed-in username, or null if the token is missing, tampered with or expired. */
export function readSession(token: string | undefined, secret: string, now = Date.now()): string | null {
  if (!token) return null;
  const [payload, given, extra] = token.split(".");
  if (!payload || !given || extra !== undefined) return null;

  const expected = Buffer.from(signature(payload, secret));
  const actual = Buffer.from(given);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u?: unknown; exp?: unknown };
    if (typeof data.u !== "string" || typeof data.exp !== "number" || data.exp <= now) return null;
    return data.u;
  } catch {
    return null;
  }
}

/** Reads one cookie from a `Cookie` request header. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(";") ?? []) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
