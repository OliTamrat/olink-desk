// Password hashing — bcrypt, the Onekof pattern. bcryptjs (pure JS) rather
// than the native binding so the same code runs unchanged in CI, Cloud Run,
// ECS and an on-prem box without a compile step.
import bcrypt from "bcryptjs";

const ROUNDS = 12;

export const MIN_PASSWORD_LENGTH = 10;

export function passwordPolicyError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, ROUNDS);
}

export function verifyPassword(password: string, hash: string | null): boolean {
  // A user row with no hash (e.g. invited, never activated) can never log
  // in — but we still burn a comparison so the response time does not reveal
  // whether the account exists.
  if (!hash) {
    bcrypt.compareSync(password, "$2a$12$invalidinvalidinvalidinvalidinvalid");
    return false;
  }
  return bcrypt.compareSync(password, hash);
}
