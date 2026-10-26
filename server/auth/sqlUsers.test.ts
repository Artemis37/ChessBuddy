import { describe, expect, it } from "vitest";
import { isTransient, withRetry } from "./sqlUsers";

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
