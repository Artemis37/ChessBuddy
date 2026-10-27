// Prints the scrypt hash for a new password: for scripts/add-user.sql (chessbuddy.Users.PasswordHash),
// or for the owner's OWNER_PASSWORD_HASH.
// Usage: npm run password:hash -- "<new password>"
import { hashPassword } from "../server/auth/password";

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run password:hash -- "<new password>"');
  process.exit(1);
}
console.log(await hashPassword(password));
