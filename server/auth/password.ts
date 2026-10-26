import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Passwords are stored as `scrypt$N$r$p$salt$hash` (salt and hash in base64url), so the cost
 * settings travel with each hash and can be raised later without breaking old ones.
 */
const COST = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 32;

function derive(password: string, salt: Buffer, cost: typeof COST): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_LENGTH, { ...cost, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, COST);
  return ["scrypt", COST.N, COST.r, COST.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash, extra] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash || extra !== undefined) return false;
  const cost = { N: Number(n), r: Number(r), p: Number(p) };
  if (![cost.N, cost.r, cost.p].every((v) => Number.isInteger(v) && v > 0)) return false;

  const expected = Buffer.from(hash, "base64url");
  let key: Buffer;
  try {
    key = await derive(password, Buffer.from(salt, "base64url"), cost);
  } catch {
    return false;
  }
  return key.length === expected.length && timingSafeEqual(key, expected);
}
