import { describe, expect, it } from "vitest";
import { LoginLimiter } from "./auth";

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
