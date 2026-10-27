export interface UserRecord {
  username: string;
  /** scrypt hash from `hashPassword`. */
  passwordHash: string;
  /** VIP accounts may use every coach model, Opus included. */
  isVip: boolean;
}

export interface UserStore {
  /** Finds an account by username, ignoring case (like Azure SQL's default collation). */
  find(username: string): Promise<UserRecord | null>;
  close?(): Promise<void>;
}

/**
 * The owner's account. It never lives in the database: signing in as the owner checks the
 * password against this hash, so it doesn't use up the Azure SQL free tier. The repo is public,
 * so a strong password's hash goes in OWNER_PASSWORD_HASH instead of the code.
 */
export const OWNER_USERNAME = "kviiilyn37_";
const OWNER_DEFAULT_HASH = "scrypt$16384$8$1$IMPF3rt3f9Osoj_bC5Ns_g$kWcKLfiEfq-VL9fXnEzIVglJeibZmeQ_ItWGhU_Hww0";
const PASSWORD_HASH = /^scrypt\$\d+\$\d+\$\d+\$[\w-]+\$[\w-]+$/;

/** The owner's account, with the hash from OWNER_PASSWORD_HASH when it's set. Throws when that isn't a hash. */
export function ownerAccount(hashFromEnv?: string): UserRecord {
  const hash = hashFromEnv?.trim();
  if (hash && !PASSWORD_HASH.test(hash)) {
    throw new Error('OWNER_PASSWORD_HASH must be a hash from "npm run password:hash", such as scrypt$16384$8$1$...');
  }
  return { username: OWNER_USERNAME, passwordHash: hash || OWNER_DEFAULT_HASH, isVip: true };
}

/** Accounts kept in memory: none besides the owner when no database is configured, and tests. */
export class MemoryUserStore implements UserStore {
  constructor(private readonly users: UserRecord[] = []) {}

  async find(username: string): Promise<UserRecord | null> {
    const key = username.toLowerCase();
    return this.users.find((u) => u.username.toLowerCase() === key) ?? null;
  }
}
