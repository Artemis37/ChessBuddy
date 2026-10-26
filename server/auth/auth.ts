import { hashPassword, verifyPassword } from "./password";
import { readCookie, readSession, SESSION_COOKIE, signSession } from "./session";
import type { UserStore } from "./users";

export class AuthError extends Error {
  constructor(
    readonly status: 401 | 429 | 503,
    message: string,
  ) {
    super(message);
  }
}

/** Counts failed sign-ins per client and blocks a client after too many. */
export class LoginLimiter {
  private failures = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly maxFailures = 5,
    private readonly windowMs = 15 * 60 * 1000,
    private readonly now = () => Date.now(),
  ) {}

  /** Milliseconds until the client may try again, or 0 if it isn't blocked. */
  blockedFor(client: string): number {
    const entry = this.failures.get(client);
    if (!entry) return 0;
    const left = entry.resetAt - this.now();
    if (left <= 0) {
      this.failures.delete(client);
      return 0;
    }
    return entry.count >= this.maxFailures ? left : 0;
  }

  fail(client: string): void {
    const now = this.now();
    for (const [key, entry] of this.failures) if (entry.resetAt <= now) this.failures.delete(key);
    const entry = this.failures.get(client);
    if (entry) entry.count++;
    else this.failures.set(client, { count: 1, resetAt: now + this.windowMs });
  }

  succeed(client: string): void {
    this.failures.delete(client);
  }
}

const WRONG = "Wrong username or password";

export class Auth {
  /** Unknown usernames are checked against this hash so they take as long as wrong passwords. */
  private decoy: Promise<string> | null = null;

  constructor(
    private readonly users: UserStore,
    private readonly secret: string,
    private readonly limiter = new LoginLimiter(),
  ) {}

  /** Checks the credentials and returns the account's username and a session token. */
  async signIn(username: string, password: string, client: string): Promise<{ username: string; token: string }> {
    const wait = this.limiter.blockedFor(client);
    if (wait > 0) {
      throw new AuthError(429, `Too many failed sign-ins. Try again in ${Math.ceil(wait / 60_000)} minutes.`);
    }

    let user;
    try {
      user = await this.users.find(username);
    } catch (err) {
      console.error("Account lookup failed:", err);
      throw new AuthError(503, "Couldn't reach the account database. Try again in a minute.");
    }

    this.decoy ??= hashPassword("decoy password for unknown usernames");
    const ok = await verifyPassword(password, user?.passwordHash ?? (await this.decoy));
    if (!user || !ok) {
      this.limiter.fail(client);
      throw new AuthError(401, WRONG);
    }
    this.limiter.succeed(client);
    return { username: user.username, token: signSession(user.username, this.secret) };
  }

  /** The username behind a request's session cookie, or null. */
  sessionUser(cookieHeader: string | undefined): string | null {
    return readSession(readCookie(cookieHeader, SESSION_COOKIE), this.secret);
  }
}
