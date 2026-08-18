// The second factor against a real database: when enrolment counts, what
// makes a code one-time, and what an abandoned or disabled enrolment leaves
// behind.
import { prisma } from "@olink-desk/database";
import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";

import {
  beginEnrolment,
  completeChallenge,
  confirmEnrolment,
  disableMfa,
  mfaState,
  regenerateRecoveryCodes,
  requiresMfa,
} from "../src/mfa";
import { codeForStep, stepAt } from "../src/totp";

const NOW = 1_700_000_000_000;

async function makeUser() {
  const slug = `mfa-${randomBytes(6).toString("hex")}`;
  const org = await prisma.organization.create({
    data: { name: "MFA Test", slug, defaultLanguage: "en" },
  });
  return prisma.user.create({
    data: {
      organizationId: org.id,
      email: `${slug}@example.com`,
      name: "Test Person",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
}

/** Enrol properly and hand back the user row plus its secret. */
async function enrolled() {
  const user = await makeUser();
  const started = await beginEnrolment(prisma, user, { issuer: "Olink Desk" });
  if (!started.ok) throw new Error("enrolment refused");
  const withSecret = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const result = await confirmEnrolment(
    prisma,
    withSecret,
    codeForStep(started.secret, stepAt(NOW)),
    { nowMs: NOW },
  );
  if (!result.ok) throw new Error("confirm refused");
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  return { user: fresh, secret: started.secret, recoveryCodes: result.recoveryCodes };
}

describe("mfaState", () => {
  it("is off with nothing, pending with only a secret, on once proved", () => {
    expect(mfaState({ mfaSecret: null, mfaVerifiedAt: null })).toBe("off");
    expect(mfaState({ mfaSecret: "S", mfaVerifiedAt: null })).toBe("pending");
    expect(mfaState({ mfaSecret: "S", mfaVerifiedAt: new Date() })).toBe("on");
  });

  // The rule that stops an abandoned tab becoming a lockout.
  it("a started-but-unproved enrolment does NOT require a second factor", () => {
    expect(requiresMfa({ mfaSecret: "S", mfaVerifiedAt: null })).toBe(false);
    expect(requiresMfa({ mfaSecret: "S", mfaVerifiedAt: new Date() })).toBe(true);
  });
});

describe("beginEnrolment", () => {
  it("issues a secret without turning anything on", async () => {
    const user = await makeUser();
    const started = await beginEnrolment(prisma, user, { issuer: "Olink Desk" });
    expect(started.ok).toBe(true);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.mfaSecret).not.toBeNull();
    expect(after.mfaVerifiedAt).toBeNull();
    expect(requiresMfa(after)).toBe(false);
  });

  it("re-issues for somebody who lost the tab, since an unproved secret grants nothing", async () => {
    const user = await makeUser();
    const first = await beginEnrolment(prisma, user, { issuer: "X" });
    const mid = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const second = await beginEnrolment(prisma, mid, { issuer: "X" });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(second.secret).not.toBe(first.secret);
  });

  // Replacing a WORKING secret is a different and more dangerous operation.
  it("refuses once the factor is live", async () => {
    const { user } = await enrolled();
    const again = await beginEnrolment(prisma, user, { issuer: "X" });
    expect(!again.ok && again.error).toBe("already_on");
  });
});

describe("confirmEnrolment", () => {
  it("turns it on and returns ten recovery codes, once", async () => {
    const { user, recoveryCodes } = await enrolled();
    expect(recoveryCodes).toHaveLength(10);
    expect(requiresMfa(user)).toBe(true);

    const stored = await prisma.mfaRecoveryCode.findMany({ where: { userId: user.id } });
    expect(stored).toHaveLength(10);
    // Only hashes are kept: the readable form existed once, in that response.
    for (const row of stored) {
      expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(recoveryCodes).not.toContain(row.codeHash);
    }
  });

  it("refuses a wrong code and leaves the factor off", async () => {
    const user = await makeUser();
    await beginEnrolment(prisma, user, { issuer: "X" });
    const mid = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const result = await confirmEnrolment(prisma, mid, "000000", { nowMs: NOW });
    expect(!result.ok && result.error).toBe("bad_code");

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(requiresMfa(after)).toBe(false);
    expect(await prisma.mfaRecoveryCode.count({ where: { userId: user.id } })).toBe(0);
  });

  it("refuses when enrolment was never started", async () => {
    const user = await makeUser();
    const result = await confirmEnrolment(prisma, user, "123456", { nowMs: NOW });
    expect(!result.ok && result.error).toBe("not_started");
  });
});

describe("completeChallenge", () => {
  it("accepts the app's code and advances the spent step", async () => {
    const { user, secret } = await enrolled();
    // The enrolling code spent this step, so the challenge uses the next one.
    const next = stepAt(NOW) + 1;
    const later = (next + 1) * 30_000;
    const result = await completeChallenge(prisma, user, codeForStep(secret, next), {
      nowMs: later - 1000,
    });
    expect(result.ok).toBe(true);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.mfaLastUsedStep).toBe(next);
  });

  // The property that makes it one-time, end to end rather than in isolation.
  it("REFUSES the same code twice", async () => {
    const { user, secret } = await enrolled();
    const next = stepAt(NOW) + 1;
    const at = (next + 1) * 30_000 - 1000;
    const code = codeForStep(secret, next);

    expect((await completeChallenge(prisma, user, code, { nowMs: at })).ok).toBe(true);
    const reread = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const replay = await completeChallenge(prisma, reread, code, { nowMs: at });
    expect(!replay.ok && replay.error).toBe("bad_code");
  });

  it("accepts a recovery code and SPENDS it", async () => {
    const { user, recoveryCodes } = await enrolled();
    const result = await completeChallenge(prisma, user, recoveryCodes[0], { nowMs: NOW });
    expect(result.ok && result.usedRecoveryCode).toBe(true);
    expect(result.ok && result.recoveryCodesLeft).toBe(9);

    const left = await prisma.mfaRecoveryCode.count({ where: { userId: user.id } });
    expect(left).toBe(9);
  });

  it("refuses a recovery code that has already been spent", async () => {
    const { user, recoveryCodes } = await enrolled();
    await completeChallenge(prisma, user, recoveryCodes[0], { nowMs: NOW });
    const again = await completeChallenge(prisma, user, recoveryCodes[0], { nowMs: NOW });
    expect(!again.ok && again.error).toBe("bad_code");
  });

  it("takes a recovery code with its hyphen, its case or neither", async () => {
    const { user, recoveryCodes } = await enrolled();
    const shouted = recoveryCodes[0].toUpperCase();
    expect((await completeChallenge(prisma, user, shouted, { nowMs: NOW })).ok).toBe(true);

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const bare = recoveryCodes[1].replace("-", "");
    expect((await completeChallenge(prisma, fresh, bare, { nowMs: NOW })).ok).toBe(true);
  });

  it("refuses another account's recovery code", async () => {
    const mine = await enrolled();
    const theirs = await enrolled();
    const result = await completeChallenge(prisma, mine.user, theirs.recoveryCodes[0], {
      nowMs: NOW,
    });
    expect(!result.ok && result.error).toBe("bad_code");
    // And theirs is still unspent — a failed attempt must not consume it.
    expect(
      await prisma.mfaRecoveryCode.count({ where: { userId: theirs.user.id } }),
    ).toBe(10);
  });

  it("refuses when the account has no second factor at all", async () => {
    const user = await makeUser();
    const result = await completeChallenge(prisma, user, "123456", { nowMs: NOW });
    expect(!result.ok && result.error).toBe("not_enrolled");
  });
});

describe("disableMfa", () => {
  // Codes left behind would be ten live ways past a factor that is gone — and
  // would silently come back into force at the next enrolment.
  it("clears the secret AND every recovery code", async () => {
    const { user } = await enrolled();
    await disableMfa(prisma, user);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.mfaSecret).toBeNull();
    expect(after.mfaVerifiedAt).toBeNull();
    expect(after.mfaLastUsedStep).toBeNull();
    expect(requiresMfa(after)).toBe(false);
    expect(await prisma.mfaRecoveryCode.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe("regenerateRecoveryCodes", () => {
  it("replaces every previous code rather than adding to them", async () => {
    const { user, recoveryCodes } = await enrolled();
    const fresh = await regenerateRecoveryCodes(prisma, user);
    expect(fresh).toHaveLength(10);
    expect(await prisma.mfaRecoveryCode.count({ where: { userId: user.id } })).toBe(10);

    // An old code is now worthless — that is the point of regenerating.
    const stale = await completeChallenge(prisma, user, recoveryCodes[0], { nowMs: NOW });
    expect(!stale.ok && stale.error).toBe("bad_code");
  });
});

describe("tenancy", () => {
  let a: Awaited<ReturnType<typeof enrolled>>;
  let b: Awaited<ReturnType<typeof enrolled>>;
  beforeEach(async () => {
    a = await enrolled();
    b = await enrolled();
  });

  it("two accounts hold entirely separate secrets and codes", async () => {
    expect(a.secret).not.toBe(b.secret);
    // A code minted for one is not valid for the other, even at the same step.
    const step = stepAt(NOW) + 1;
    const at = (step + 1) * 30_000 - 1000;
    const result = await completeChallenge(prisma, a.user, codeForStep(b.secret, step), {
      nowMs: at,
    });
    expect(!result.ok && result.error).toBe("bad_code");
  });

  it("disabling one leaves the other untouched", async () => {
    await disableMfa(prisma, a.user);
    const other = await prisma.user.findUniqueOrThrow({ where: { id: b.user.id } });
    expect(requiresMfa(other)).toBe(true);
    expect(await prisma.mfaRecoveryCode.count({ where: { userId: b.user.id } })).toBe(10);
  });
});
