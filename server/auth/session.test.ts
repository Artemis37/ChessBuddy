import { describe, expect, it } from "vitest";
import { readCookie, readSession, SESSION_TTL_MS, signSession } from "./session";

const NOW = 1_800_000_000_000;

describe("signSession / readSession", () => {
  it("round-trips the username until the session expires", () => {
    const token = signSession("player", "secret", NOW);
    expect(readSession(token, "secret", NOW)).toBe("player");
    expect(readSession(token, "secret", NOW + SESSION_TTL_MS - 1)).toBe("player");
    expect(readSession(token, "secret", NOW + SESSION_TTL_MS)).toBeNull();
  });

  it("rejects tokens signed with another secret or changed in any way", () => {
    const token = signSession("player", "secret", NOW);
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
