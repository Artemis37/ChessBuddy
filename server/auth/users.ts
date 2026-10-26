export interface UserRecord {
  username: string;
  /** scrypt hash from `hashPassword`. */
  passwordHash: string;
}

export interface UserStore {
  /** Finds an account by username, ignoring case (like Azure SQL's default collation). */
  find(username: string): Promise<UserRecord | null>;
  close?(): Promise<void>;
}

/**
 * The built-in account. ChessBuddy is a private system without sign-up, so this account is
 * created in an empty database. Only the password's scrypt hash is kept in the code.
 */
export const DEFAULT_ACCOUNT: UserRecord = {
  username: "kviiilyn37_",
  passwordHash: "scrypt$16384$8$1$IMPF3rt3f9Osoj_bC5Ns_g$kWcKLfiEfq-VL9fXnEzIVglJeibZmeQ_ItWGhU_Hww0",
};

/** Accounts kept in memory: the built-in account when no database is configured, and tests. */
export class MemoryUserStore implements UserStore {
  constructor(private readonly users: UserRecord[] = [DEFAULT_ACCOUNT]) {}

  async find(username: string): Promise<UserRecord | null> {
    const key = username.toLowerCase();
    return this.users.find((u) => u.username.toLowerCase() === key) ?? null;
  }
}
