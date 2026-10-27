import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";
import { ownerAccount } from "./users";

describe("hashPassword / verifyPassword", () => {
  it("accepts the right password and rejects others", async () => {
    const hash = await hashPassword("s3cret!");
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(await verifyPassword("s3cret!", hash)).toBe(true);
    expect(await verifyPassword("s3cret", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("rejects malformed hashes instead of throwing", async () => {
    for (const stored of ["", "plain-text", "bcrypt$1$2$3$a$b", "scrypt$0$8$1$a$b", "scrypt$16384$8$1$a$b$c"]) {
      expect(await verifyPassword("anything", stored)).toBe(false);
    }
  });

  it("keeps the owner's default password as a valid scrypt hash", async () => {
    const { passwordHash } = ownerAccount();
    expect(passwordHash).toMatch(/^scrypt\$16384\$8\$1\$[\w-]{22}\$[\w-]{43}$/);
    expect(await verifyPassword("not the password", passwordHash)).toBe(false);
  });
});
