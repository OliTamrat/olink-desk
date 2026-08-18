// Time-based one-time passwords (RFC 6238) and single-use recovery codes.
//
// **Written out rather than pulled in, and the reason is verification.** TOTP
// is HMAC-SHA1 over a counter — about twenty lines of `node:crypto` — and RFC
// 6238 ships published test vectors. A hand-written implementation can be
// proved correct against the standard itself, in this repo's own suite, with
// no network and no trust in a third party's release process. A dependency
// could only be trusted. Same trade the dependency-free BM25 retriever makes.
//
// Everything here is a pure function over its arguments — no database, no
// clock of its own. `now` is always passed in, so drift, replay and expiry are
// all testable without freezing time globally.
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";

// RFC 6238 §4: 30 seconds is the reference implementation's step and what
// every authenticator app assumes. Changing it silently breaks every
// already-enrolled device, so it is a constant rather than a setting.
export const STEP_SECONDS = 30;
export const DIGITS = 6;

// RFC 4226 §4 requires at least 128 bits of shared secret and recommends 160.
// Twenty bytes is 160 bits and encodes to exactly 32 base32 characters with no
// padding — which matters because some authenticator apps reject a secret
// containing "=".
const SECRET_BYTES = 20;

// How many steps either side of `now` are accepted. One step (±30s) covers a
// phone clock that has drifted and the seconds a person spends typing. Two
// would double the window an intercepted code stays usable for; zero would
// reject a correct code typed a moment too late, which is how a security
// feature becomes the reason somebody turns it off.
const DRIFT_STEPS = 1;

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/**
 * Base32 back to bytes, tolerant of how people retype a secret.
 *
 * Authenticator apps display the secret in spaced groups and users paste it
 * back with the spacing intact and the case flattened. Rejecting that is a
 * support ticket, not security.
 */
function base32Decode(secret: string): Buffer {
  const cleaned = secret.replace(/[\s-]/g, "").toUpperCase().replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("not base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh base32 secret, in the form an authenticator app expects. */
export function generateSecret(): string {
  const bytes = Buffer.alloc(SECRET_BYTES);
  for (let i = 0; i < SECRET_BYTES; i += 1) bytes[i] = randomInt(256);
  return base32Encode(bytes);
}

/** Which 30-second step a unix timestamp (in MILLIseconds) falls in. */
export function stepAt(nowMs: number): number {
  return Math.floor(nowMs / 1000 / STEP_SECONDS);
}

/**
 * The RFC 6238 code for one counter value.
 *
 * Straight from RFC 4226 §5.3: HMAC-SHA1 over the big-endian counter,
 * dynamically truncated at the offset held in the low nibble of the last byte,
 * masked to 31 bits so the result is never negative, modulo 10^digits.
 */
export function codeForStep(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  // A step is ~5.8e7 today and stays inside 32 bits until the year 6053, but
  // writing only the low word would be a silent correctness cliff. BigInt
  // costs nothing here and makes the counter exactly the 64 bits the RFC says.
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const truncated = digest.readUInt32BE(offset) & 0x7fff_ffff;
  return String(truncated % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** Constant-time over equal-length strings; false rather than a throw when the
 *  lengths differ, since length is not a secret here. */
function sameCode(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * The step a code is valid for, or null.
 *
 * Returns the step rather than a boolean so the caller can STORE it — which is
 * what makes replay impossible. Without that, a code read over a shoulder or
 * out of a phone notification stays usable for the rest of its window and for
 * the whole drift allowance either side of it.
 *
 * `lastUsedStep` is the highest step this credential has already spent.
 * Anything at or below it is refused even when the arithmetic says the code is
 * correct: a one-time password that works twice is not one.
 */
export function verifyCode(
  secret: string,
  code: string,
  opts: { nowMs: number; lastUsedStep: number | null },
): number | null {
  const candidate = code.trim().replace(/\s/g, "");
  if (!/^\d+$/.test(candidate) || candidate.length !== DIGITS) return null;
  const centre = stepAt(opts.nowMs);
  for (let offset = -DRIFT_STEPS; offset <= DRIFT_STEPS; offset += 1) {
    const step = centre + offset;
    if (opts.lastUsedStep !== null && step <= opts.lastUsedStep) continue;
    if (sameCode(codeForStep(secret, step), candidate)) return step;
  }
  return null;
}

/**
 * The `otpauth://` URI an authenticator app scans.
 *
 * The issuer appears twice on purpose — once in the label prefix and once as a
 * parameter. The parameter is the modern form; the prefix is what older apps
 * read, and an app that reads neither files the account under a blank heading,
 * which is how somebody ends up with three unlabelled entries and no idea
 * which workspace each belongs to.
 */
export function provisioningUri(
  secret: string,
  opts: { account: string; issuer: string },
): string {
  const label = encodeURIComponent(`${opts.issuer}:${opts.account}`);
  return (
    `otpauth://totp/${label}` +
    `?secret=${secret}` +
    `&issuer=${encodeURIComponent(opts.issuer)}` +
    `&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
  );
}

// ------------------------------------------------------------- recovery

// Ten is the industry norm and it is a usability number rather than a security
// one: enough that losing a couple to a bad transcription does not strand
// somebody, few enough to write on one line of a notebook.
export const RECOVERY_CODE_COUNT = 10;

/**
 * Codes in the form a person can copy off a screen onto paper.
 *
 * Deliberately not the same alphabet as the TOTP secret: base32 without the
 * characters that read as each other, so 0/O and 1/l cannot be confused by
 * somebody typing under pressure because they have lost their phone.
 */
export function generateRecoveryCodes(count: number = RECOVERY_CODE_COUNT): string[] {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    let body = "";
    for (let j = 0; j < 10; j += 1) body += alphabet[randomInt(alphabet.length)];
    codes.push(`${body.slice(0, 5)}-${body.slice(5)}`);
  }
  return codes;
}

/** One canonical form, so a hyphen or the case is never the reason a correct
 *  code is refused. */
export function normaliseRecoveryCode(code: string): string {
  return code.trim().toLowerCase().replace(/[\s-]/g, "");
}

/**
 * SHA-256, not Argon2, and that is a considered difference.
 *
 * A recovery code is 50 bits of machine-generated randomness, so it has no
 * guessable structure for an offline attacker to exploit — the slow hash a
 * human-chosen password needs buys nothing here. What it would cost is real:
 * ten Argon2 verifications per login attempt while looking for which code
 * matches, on the one endpoint that must not become a denial-of-service
 * amplifier.
 */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normaliseRecoveryCode(code), "utf8").digest("hex");
}

// How far either side of `now` a REJECTED code is searched when explaining why
// it was rejected. Nothing here ever accepts a code — this window is a
// diagnostic, not an allowance, and it is deliberately far wider than
// DRIFT_STEPS so a badly-set clock is recognisable rather than merely refused.
// Twenty minutes covers every real drift; beyond that a clock is not drifting,
// it is wrong.
const DIAGNOSTIC_STEPS = 40;

export type Rejection =
  | { kind: "malformed" }
  | { kind: "clock_drift"; minutes: number; direction: "ahead" | "behind" }
  | { kind: "wrong_secret" };

/**
 * WHY a code failed, in terms the person typing it can act on.
 *
 * "That code was not accepted" is true of two unrelated problems:
 *
 *  - the code is right and the CLOCK is wrong — the fix is to turn on
 *    automatic time on the device;
 *  - the code is right for a DIFFERENT secret — the app is reading an entry
 *    this account no longer holds, which is what happens when somebody keeps a
 *    stale entry from an earlier attempt or from another workspace.
 *
 * Telling them apart is a search over steps, and it is cheap. The offset comes
 * back in minutes rather than steps because nobody sets their clock in units
 * of thirty seconds.
 */
export function explainRejection(
  secret: string,
  code: string,
  nowMs: number,
): Rejection {
  const candidate = code.trim().replace(/\s/g, "");
  if (!/^\d+$/.test(candidate) || candidate.length !== DIGITS) {
    return { kind: "malformed" };
  }
  const centre = stepAt(nowMs);
  for (let offset = -DIAGNOSTIC_STEPS; offset <= DIAGNOSTIC_STEPS; offset += 1) {
    if (sameCode(codeForStep(secret, centre + offset), candidate)) {
      return {
        kind: "clock_drift",
        minutes: Math.abs(Math.round((offset * STEP_SECONDS) / 60)),
        direction: offset > 0 ? "ahead" : "behind",
      };
    }
  }
  return { kind: "wrong_secret" };
}
