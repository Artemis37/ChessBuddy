import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "chessbuddy_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** The account behind a session, as it was when it signed in. */
export interface SessionUser {
  username: string;
  /** VIP accounts may use every coach model, Opus included. */
  vip: boolean;
}

/**
 * Sessions are signed cookies rather than database rows, so checking one never touches
 * Azure SQL and the free-tier database can stay paused while you play. The VIP flag travels in
 * the signed payload too, so a change to an account applies from its next sign-in.
 * The token is `base64url(payload).base64url(HMAC-SHA256(payload))`.
 */
export function signSession(user: SessionUser, secret: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: user.username, v: user.vip, exp: now + SESSION_TTL_MS })).toString(
    "base64url",
  );
  return `${payload}.${signature(payload, secret)}`;
}

/** The signed-in account, or null if the token is missing, tampered with or expired. */
export function readSession(token: string | undefined, secret: string, now = Date.now()): SessionUser | null {
  if (!token) return null;
  const [payload, given, extra] = token.split(".");
  if (!payload || !given || extra !== undefined) return null;

  const expected = Buffer.from(signature(payload, secret));
  const actual = Buffer.from(given);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      u?: unknown;
      v?: unknown;
      exp?: unknown;
    };
    if (typeof data.u !== "string" || typeof data.exp !== "number" || data.exp <= now) return null;
    // Sessions signed before the flag existed have no `v`: not VIP until the next sign-in.
    return { username: data.u, vip: data.v === true };
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
