import sql from "mssql";
import { DEFAULT_ACCOUNT, type UserRecord, type UserStore } from "./users";

// Separate batches: SQL Server compiles a whole batch first, so a table can't be used in the
// batch that creates its schema.
const SETUP = [
  "IF SCHEMA_ID(N'chessbuddy') IS NULL EXEC(N'CREATE SCHEMA chessbuddy')",
  `IF OBJECT_ID(N'chessbuddy.Users', N'U') IS NULL
  CREATE TABLE chessbuddy.Users (
    Id INT IDENTITY(1, 1) PRIMARY KEY,
    Username NVARCHAR(64) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  )`,
];
const SEED = `IF NOT EXISTS (SELECT 1 FROM chessbuddy.Users)
  INSERT INTO chessbuddy.Users (Username, PasswordHash) VALUES (@username, @passwordHash)`;
const FIND = `SELECT TOP (1) Username AS username, PasswordHash AS passwordHash
  FROM chessbuddy.Users WHERE Username = @username`;

/**
 * Error numbers Azure SQL returns while a database is resuming, failing over or throttling.
 * A paused free-tier database answers 40613 until it's back, which can take up to a minute.
 */
const TRANSIENT_ERRORS = new Set([40613, 40197, 40501, 49918, 49919, 49920, 4221, 10928, 10929]);

/** 18456: the connection string's user or password is wrong, so waiting won't help. */
const LOGIN_FAILED = 18456;

export function isTransient(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const original = (err as { originalError?: { number?: unknown } }).originalError;
  const number = (err as { number?: unknown }).number ?? original?.number;
  if (number === LOGIN_FAILED || /login failed for user/i.test(err.message)) return false;
  if (err.name === "ConnectionError") return true;
  return typeof number === "number" && TRANSIENT_ERRORS.has(number);
}

export interface RetryOptions {
  attempts: number;
  delayMs: number;
}

/** Runs `task` again after transient errors, up to `attempts` times in all. */
export async function withRetry<T>(
  task: () => Promise<T>,
  { attempts, delayMs }: RetryOptions,
  onRetry?: (err: unknown) => void,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await task();
    } catch (err) {
      if (attempt >= attempts || !isTransient(err)) throw err;
      onRetry?.(err);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Accounts in Azure SQL (table `chessbuddy.Users`, created on first sign-in together with the
 * built-in account). The database is only touched when someone signs in: the pool keeps no idle
 * connections, so the serverless free tier can pause.
 */
export class SqlUserStore implements UserStore {
  private pool: Promise<sql.ConnectionPool> | null = null;

  constructor(
    private readonly connectionString: string,
    private readonly retry: RetryOptions = { attempts: 8, delayMs: 5000 },
  ) {}

  find(username: string): Promise<UserRecord | null> {
    return withRetry(
      async () => {
        const pool = await this.connect();
        const result = await pool.request().input("username", sql.NVarChar(64), username).query<UserRecord>(FIND);
        return result.recordset[0] ?? null;
      },
      this.retry,
      (err) => {
        console.warn(`Database not ready, retrying: ${err instanceof Error ? err.message : err}`);
        this.reset();
      },
    );
  }

  async close(): Promise<void> {
    const pool = this.pool;
    this.pool = null;
    await pool?.then((p) => p.close()).catch(() => {});
  }

  private connect(): Promise<sql.ConnectionPool> {
    this.pool ??= this.open().catch((err) => {
      this.pool = null;
      throw err;
    });
    return this.pool;
  }

  /** Drops the pool so the next attempt opens fresh connections. */
  private reset(): void {
    void this.close();
  }

  private async open(): Promise<sql.ConnectionPool> {
    const config = sql.ConnectionPool.parseConnectionString(this.connectionString);
    const pool = new sql.ConnectionPool({
      ...config,
      connectionTimeout: 30_000,
      pool: { ...config.pool, min: 0, max: 2, idleTimeoutMillis: 30_000 },
    });
    await pool.connect();
    try {
      for (const statement of SETUP) await pool.request().batch(statement);
      await pool
        .request()
        .input("username", sql.NVarChar(64), DEFAULT_ACCOUNT.username)
        .input("passwordHash", sql.NVarChar(255), DEFAULT_ACCOUNT.passwordHash)
        .query(SEED);
    } catch (err) {
      await pool.close().catch(() => {});
      throw err;
    }
    return pool;
  }
}
