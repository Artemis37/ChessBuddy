import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIND, isTransient, SETUP, withRetry } from "./sqlUsers";
import { OWNER_USERNAME } from "./users";

describe("accounts table setup", () => {
  it("creates the schema and table only when missing, with a VIP flag that defaults to off", () => {
    expect(SETUP[0]).toBe("IF SCHEMA_ID(N'chessbuddy') IS NULL EXEC(N'CREATE SCHEMA chessbuddy');");
    expect(SETUP[1]).toMatch(/^IF OBJECT_ID\(N'chessbuddy\.Users', N'U'\) IS NULL EXEC\(N'CREATE TABLE chessbuddy\.Users \(/);
    expect(SETUP[1]).toContain("IsVip BIT NOT NULL DEFAULT 0,");
  });

  it("adds the IsVip column to a table created before it existed", () => {
    expect(SETUP[2]).toBe(
      "IF COL_LENGTH(N'chessbuddy.Users', N'IsVip') IS NULL EXEC(N'ALTER TABLE chessbuddy.Users ADD IsVip BIT NOT NULL DEFAULT 0');",
    );
  });

  it("no longer seeds the owner, and reads the VIP flag", () => {
    for (const statement of SETUP) {
      expect(statement).not.toMatch(/INSERT/i);
      expect(statement).not.toContain(OWNER_USERNAME);
    }
    expect(FIND).toMatch(/IsVip AS isVip/);
  });
});

describe("scripts/add-user.sql", () => {
  const script = readFileSync(new URL("../../scripts/add-user.sql", import.meta.url), "utf8");
  const statements = script
    .split("\n")
    .filter((line) => !line.startsWith("--"))
    .join("\n");

  it("runs the server's setup first, so it works on an empty database and an old table", () => {
    for (const statement of SETUP) expect(statements).toContain(statement);
    expect(statements.indexOf(SETUP[2])).toBeLessThan(statements.indexOf("INSERT"));
  });

  it("inserts one account that isn't VIP, with the hash as a parameter", () => {
    expect(statements).toMatch(
      /EXEC sp_executesql\s+N'INSERT INTO chessbuddy\.Users \(Username, PasswordHash, IsVip\) VALUES \(@username, @passwordHash, 0\)'/,
    );
    expect(statements).toContain("@username = N'<username>'");
    expect(statements).toContain("@passwordHash = N'<hash from npm run password:hash>'");
    expect(statements).not.toContain(OWNER_USERNAME);
    // One batch: the portal's Query editor doesn't split on GO.
    expect(statements).not.toMatch(/^\s*GO\s*$/m);
  });

  it("is the script the deployment guide shows", () => {
    const guide = readFileSync(new URL("../../docs/deploy-aca.html", import.meta.url), "utf8");
    const shown = /<pre><code>(IF SCHEMA_ID[\s\S]*?)<\/code><\/pre>/.exec(guide)?.[1] ?? "";
    const text = shown.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    expect(text.replace(/\s+/g, " ").trim()).toBe(
      statements
        .split("\n")
        .filter((line) => !line.startsWith("-- Through"))
        .join("\n")
        .replace(/\s+/g, " ")
        .trim(),
    );
  });
});

function sqlError(name: string, message: string, number?: number): Error {
  const err = new Error(message);
  err.name = name;
  if (number !== undefined) Object.assign(err, { originalError: { number } });
  return err;
}

describe("isTransient", () => {
  it("treats a resuming or unreachable database as transient", () => {
    expect(isTransient(sqlError("RequestError", "Database is not currently available.", 40613))).toBe(true);
    expect(isTransient(sqlError("ConnectionError", "Failed to connect to server in 30000ms"))).toBe(true);
  });

  it("doesn't retry wrong credentials or bad queries", () => {
    expect(isTransient(sqlError("ConnectionError", "Login failed for user 'chess'."))).toBe(false);
    expect(isTransient(sqlError("ConnectionError", "Login failed", 18456))).toBe(false);
    expect(isTransient(sqlError("RequestError", "Invalid column name 'Nope'.", 207))).toBe(false);
    expect(isTransient("not an error")).toBe(false);
  });
});

describe("withRetry", () => {
  it("retries transient errors until the task succeeds", async () => {
    let calls = 0;
    const retried: unknown[] = [];
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw sqlError("ConnectionError", "resuming");
        return "ok";
      },
      { attempts: 5, delayMs: 0 },
      (err) => retried.push(err),
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(retried).toHaveLength(2);
  });

  it("gives up after the last attempt and on other errors", async () => {
    let calls = 0;
    const failing = () =>
      withRetry(
        async () => {
          calls++;
          throw sqlError("ConnectionError", "still paused");
        },
        { attempts: 3, delayMs: 0 },
      );
    await expect(failing()).rejects.toThrow("still paused");
    expect(calls).toBe(3);

    calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("syntax error");
        },
        { attempts: 3, delayMs: 0 },
      ),
    ).rejects.toThrow("syntax error");
    expect(calls).toBe(1);
  });
});
