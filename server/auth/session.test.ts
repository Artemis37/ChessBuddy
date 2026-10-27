import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readCookie, readSession, SESSION_TTL_MS, signSession } from "./session";

const NOW = 1_800_000_000_000;

describe("signSession / readSession", () => {
  const PLAYER = { username: "player", vip: false };

  it("round-trips the account until the session expires", () => {
    const token = signSession(PLAYER, "secret", NOW);
    expect(readSession(token, "secret", NOW)).toEqual(PLAYER);
    expect(readSession(token, "secret", NOW + SESSION_TTL_MS - 1)).toEqual(PLAYER);
    expect(readSession(token, "secret", NOW + SESSION_TTL_MS)).toBeNull();
  });

  it("carries the VIP flag in the signed session", () => {
    expect(readSession(signSession({ username: "owner", vip: true }, "secret", NOW), "secret", NOW)).toEqual({
      username: "owner",
      vip: true,
    });
    // A session signed before the flag existed has no `v`: not VIP until the next sign-in.
    const old = Buffer.from(JSON.stringify({ u: "owner", exp: NOW + 1000 })).toString("base64url");
    const oldSignature = createHmac("sha256", "secret").update(old).digest("base64url");
    expect(readSession(`${old}.${oldSignature}`, "secret", NOW)).toEqual({ username: "owner", vip: false });
  });

  it("can't be made VIP by changing the payload", () => {
    const [payload, signature] = signSession(PLAYER, "secret", NOW).split(".");
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const promoted = Buffer.from(JSON.stringify({ ...data, v: true })).toString("base64url");
    expect(readSession(`${promoted}.${signature}`, "secret", NOW)).toBeNull();
  });

  it("rejects tokens signed with another secret or changed in any way", () => {
    const token = signSession(PLAYER, "secret", NOW);
    const [payload, signature] = token.split(".");
    const other = Buffer.from(JSON.stringify({ u: "admin", exp: NOW + 1000 })).toString("base64url");
    expect(readSession(token, "other secret", NOW)).toBeNull();
    expect(readSession(`${other}.${signature}`, "secret", NOW)).toBeNull();
    expect(readSession(`${payload}.${signature.slice(1)}`, "secret", NOW)).toBeNull();
    expect(readSession(`${token}.extra`, "secret", NOW)).toBeNull();
    expect(readSession(payload, "secret", NOW)).toBeNull();
    expect(readSession("", "secret", NOW)).toBeNull();
    expect(readSession(undefined, "secret", NOW)).toBeNull();
  });
});

describe("readCookie", () => {
  it("finds one cookie among several", () => {
    expect(readCookie("a=1; chessbuddy_session=abc.def; b=2", "chessbuddy_session")).toBe("abc.def");
    expect(readCookie("a=1", "chessbuddy_session")).toBeUndefined();
    expect(readCookie(undefined, "chessbuddy_session")).toBeUndefined();
    expect(readCookie("x=%E0%A4%A", "x")).toBeUndefined();
  });
});
