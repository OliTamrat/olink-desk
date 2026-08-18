// Enrolling, proving and spending a second factor.
//
// Separated from the routes for the same reason `service.ts` is: the rules
// here — when enrolment counts, what makes a code one-time, what happens to
// live sessions when the factor changes — are the part worth testing against a
// real database, and none of them need a Next request to be true.
import type { PrismaClient, User } from "@olink-desk/database";

import {
  generateRecoveryCodes,
  generateSecret,
  hashRecoveryCode,
  provisioningUri,
  stepAt,
  verifyCode,
} from "./totp";

export type MfaState = "off" | "pending" | "on";

/**
 * A secret alone is NOT two-factor.
 *
 * Between showing the QR and the first correct code, nobody has demonstrated
 * they can produce one — so treating the secret as the switch would make
 * closing that tab a lockout by a credential no human holds. `pending` is a
 * started enrolment and behaves exactly like `off` everywhere it matters.
 */
export function mfaState(user: Pick<User, "mfaSecret" | "mfaVerifiedAt">): MfaState {
  if (user.mfaVerifiedAt) return "on";
  return user.mfaSecret ? "pending" : "off";
}

/** Whether a login must ask for a second factor. */
export function requiresMfa(user: Pick<User, "mfaSecret" | "mfaVerifiedAt">): boolean {
  return mfaState(user) === "on";
}

/**
 * Begin enrolment: a fresh secret and the URI an app scans.
 *
 * Re-callable on purpose. Somebody who scanned a code, lost the tab and came
 * back has an authenticator entry nobody can prove — issuing a NEW secret is
 * what makes that recoverable, and it is safe precisely because an unverified
 * secret grants nothing. Refuses once the factor is live, because replacing a
 * working secret is a different, more dangerous operation than starting one.
 */
export async function beginEnrolment(
  db: PrismaClient,
  user: User,
  opts: { issuer: string },
): Promise<{ ok: true; secret: string; uri: string } | { ok: false; error: "already_on" }> {
  if (mfaState(user) === "on") return { ok: false, error: "already_on" };
  const secret = generateSecret();
  await db.user.update({
    where: { id: user.id },
    // Any half-finished previous attempt is replaced wholesale, step included:
    // a step counter left over from another secret would refuse codes from
    // this one for as long as it took the clock to catch up.
    data: { mfaSecret: secret, mfaVerifiedAt: null, mfaLastUsedStep: null },
  });
  return {
    ok: true,
    secret,
    uri: provisioningUri(secret, { account: user.email, issuer: opts.issuer }),
  };
}

export type ConfirmResult =
  | { ok: true; recoveryCodes: string[] }
  | { ok: false; error: "not_started" | "already_on" | "bad_code" };

/**
 * Finish enrolment by proving a code, and hand back the recovery codes.
 *
 * The codes are returned ONCE and only their hashes are stored, so this is the
 * only moment they exist in readable form. That is why they are minted here
 * rather than at `beginEnrolment`: showing them beside a QR nobody has proved
 * yet would put ten live credentials on screen for an enrolment that may never
 * complete.
 */
export async function confirmEnrolment(
  db: PrismaClient,
  user: User,
  code: string,
  opts: { nowMs: number },
): Promise<ConfirmResult> {
  const state = mfaState(user);
  if (state === "on") return { ok: false, error: "already_on" };
  if (state === "off" || !user.mfaSecret) return { ok: false, error: "not_started" };

  const step = verifyCode(user.mfaSecret, code, {
    nowMs: opts.nowMs,
    lastUsedStep: user.mfaLastUsedStep,
  });
  if (step === null) return { ok: false, error: "bad_code" };

  const codes = generateRecoveryCodes();
  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: { mfaVerifiedAt: new Date(opts.nowMs), mfaLastUsedStep: step },
    }),
    // Any codes from an abandoned earlier enrolment are gone: they were minted
    // against a secret this account no longer holds.
    db.mfaRecoveryCode.deleteMany({ where: { userId: user.id } }),
    db.mfaRecoveryCode.createMany({
      data: codes.map((c) => ({
        organizationId: user.organizationId,
        userId: user.id,
        codeHash: hashRecoveryCode(c),
      })),
    }),
  ]);
  return { ok: true, recoveryCodes: codes };
}

export type ChallengeResult =
  | { ok: true; usedRecoveryCode: boolean; recoveryCodesLeft: number }
  | { ok: false; error: "not_enrolled" | "bad_code" };

/**
 * Spend a code at sign-in — either the app's six digits or one recovery code.
 *
 * Both live here rather than in two routes because they are one decision with
 * one answer, and splitting them is how a second, laxer door gets built. The
 * TOTP path advances `mfaLastUsedStep`; the recovery path DELETES its row.
 * Either way the credential just used cannot be used again.
 */
export async function completeChallenge(
  db: PrismaClient,
  user: User,
  code: string,
  opts: { nowMs: number },
): Promise<ChallengeResult> {
  if (!requiresMfa(user) || !user.mfaSecret) {
    return { ok: false, error: "not_enrolled" };
  }

  const step = verifyCode(user.mfaSecret, code, {
    nowMs: opts.nowMs,
    lastUsedStep: user.mfaLastUsedStep,
  });
  if (step !== null) {
    await db.user.update({
      where: { id: user.id },
      data: { mfaLastUsedStep: step },
    });
    const left = await db.mfaRecoveryCode.count({ where: { userId: user.id } });
    return { ok: true, usedRecoveryCode: false, recoveryCodesLeft: left };
  }

  // Looked up by hash, so the stored form is never the usable form and no
  // comparison walks a list of plaintext.
  const hash = hashRecoveryCode(code);
  const row = await db.mfaRecoveryCode.findUnique({
    where: { userId_codeHash: { userId: user.id, codeHash: hash } },
  });
  if (!row) return { ok: false, error: "bad_code" };
  // deleteMany rather than delete: two tabs racing the same code both find the
  // row, and the loser must not throw a 500 at somebody who is already locked
  // out of their phone. The winner spends it; the loser deletes nothing.
  const spent = await db.mfaRecoveryCode.deleteMany({ where: { id: row.id } });
  if (spent.count === 0) return { ok: false, error: "bad_code" };
  const left = await db.mfaRecoveryCode.count({ where: { userId: user.id } });
  return { ok: true, usedRecoveryCode: true, recoveryCodesLeft: left };
}

/**
 * Turn it off, and take the recovery codes with it.
 *
 * Leaving the codes behind would keep ten live ways past a factor the account
 * no longer has — and they would silently come back into force the next time
 * somebody enrolled, having been minted against a secret that is gone.
 */
export async function disableMfa(db: PrismaClient, user: User): Promise<void> {
  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: { mfaSecret: null, mfaVerifiedAt: null, mfaLastUsedStep: null },
    }),
    db.mfaRecoveryCode.deleteMany({ where: { userId: user.id } }),
  ]);
}

/** Fresh codes, invalidating every previous one. For "I have used most of
 *  mine" and for "I think that piece of paper was seen". */
export async function regenerateRecoveryCodes(
  db: PrismaClient,
  user: User,
): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await db.$transaction([
    db.mfaRecoveryCode.deleteMany({ where: { userId: user.id } }),
    db.mfaRecoveryCode.createMany({
      data: codes.map((c) => ({
        organizationId: user.organizationId,
        userId: user.id,
        codeHash: hashRecoveryCode(c),
      })),
    }),
  ]);
  return codes;
}

export { stepAt };
