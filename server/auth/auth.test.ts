import { beforeAll, describe, expect, it } from "vitest";
import { Auth, AuthError, LoginLimiter } from "./auth";
import { hashPassword } from "./password";
import { readSession } from "./session";
import { MemoryUserStore, OWNER_USERNAME, ownerAccount, type UserRecord, type UserStore } from "./users";

describe("LoginLimiter", () => {
  it("blocks a client after too many failures until the window ends", () => {
    let now = 0;
    const limiter = new LoginLimiter(3, 1000, () => now);
    limiter.fail("a");
    limiter.fail("a");
    expect(limiter.blockedFor("a")).toBe(0);
    limiter.fail("a");
    expect(limiter.blockedFor("a")).toBe(1000);
    expect(limiter.blockedFor("b")).toBe(0);
    now = 999;
    expect(limiter.blockedFor("a")).toBe(1);
    now = 1000;
    expect(limiter.blockedFor("a")).toBe(0);
  });

  it("forgets a client's failures after a successful sign-in", () => {
    const limiter = new LoginLimiter(2, 1000, () => 0);
    limiter.fail("a");
    limiter.succeed("a");
    limiter.fail("a");
    expect(limiter.blockedFor("a")).toBe(0);
  });
});

/** A user store that fails the test if it is ever asked for an account. */
class UntouchableStore implements UserStore {
  calls = 0;
  async find(): Promise<UserRecord | null> {
    this.calls++;
    throw new Error("The user store must not be called");
  }
}

describe("Auth", () => {
  const OWNER_PASSWORD = "owner's strong password";
  let owner: UserRecord;
  let player: UserRecord;

  beforeAll(async () => {
    owner = ownerAccount(await hashPassword(OWNER_PASSWORD));
    player = { username: "player", passwordHash: await hashPassword("player password"), isVip: false };
  });

  it("signs the owner in against the owner's hash without touching the user store", async () => {
    const store = new UntouchableStore();
    const auth = new Auth(store, "secret", { owner });
    const session = await auth.signIn(OWNER_USERNAME, OWNER_PASSWORD, "client");
    expect(session).toMatchObject({ username: OWNER_USERNAME, vip: true });
    expect(readSession(session.token, "secret")).toEqual({ username: OWNER_USERNAME, vip: true });
    // Any capitalization is the owner too, and a wrong password is refused, still without the store.
    await expect(auth.signIn("KVIIILYN37_", OWNER_PASSWORD, "client")).resolves.toMatchObject({ vip: true });
    await expect(auth.signIn(OWNER_USERNAME, "wrong", "client")).rejects.toMatchObject({ status: 401 });
    expect(store.calls).toBe(0);
  });

  it("checks every other account against the user store, with its VIP flag", async () => {
    const vip = { ...player, username: "friend", isVip: true };
    const auth = new Auth(new MemoryUserStore([player, vip]), "secret", { owner });
    const plain = await auth.signIn("player", "player password", "client");
    expect(readSession(plain.token, "secret")).toEqual({ username: "player", vip: false });
    const friend = await auth.signIn("friend", "player password", "client");
    expect(readSession(friend.token, "secret")).toEqual({ username: "friend", vip: true });
  });

  it("ignores a database row with the owner's name", async () => {
    // A store that answers every lookup with an account named like the owner.
    const impostor = { username: OWNER_USERNAME.toUpperCase(), passwordHash: player.passwordHash, isVip: true };
    const store: UserStore = { find: async () => impostor };
    const auth = new Auth(store, "secret", { owner });
    await expect(auth.signIn("someone", "player password", "client")).rejects.toBeInstanceOf(AuthError);
    // The owner's own sign-in uses the owner's hash, not the row's password.
    await expect(auth.signIn(OWNER_USERNAME, "player password", "client")).rejects.toMatchObject({ status: 401 });
  });
});

describe("ownerAccount", () => {
  it("uses OWNER_PASSWORD_HASH when it's set, and the hash in the code otherwise", async () => {
    const hash = await hashPassword("a new password");
    expect(ownerAccount(` ${hash}\n`)).toEqual({ username: OWNER_USERNAME, passwordHash: hash, isVip: true });
    expect(ownerAccount(undefined).passwordHash).toMatch(/^scrypt\$/);
    expect(ownerAccount("").passwordHash).toBe(ownerAccount(undefined).passwordHash);
  });

  it("refuses an OWNER_PASSWORD_HASH that isn't a hash, rather than falling back to the default password", () => {
    expect(() => ownerAccount("my password")).toThrow(/npm run password:hash/);
  });
});
