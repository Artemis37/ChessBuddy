// Prints the scrypt hash for a new password, to store in chessbuddy.Users.PasswordHash.
// Usage: npm run password:hash -- "<new password>"
import { hashPassword } from "../server/auth/password";

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run password:hash -- "<new password>"');
  process.exit(1);
}
console.log(await hashPassword(password));
