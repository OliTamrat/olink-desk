// TOTP, proved against the standard rather than against itself.
//
// This is the entire justification for hand-writing it instead of taking a
// dependency: RFC 6238 Appendix B publishes the codes a correct implementation
// must produce for a known secret at known times. A test written from our own
// output would agree with any bug it happened to contain; these vectors were
// written by the people who defined the algorithm, before this code existed.
import { describe, expect, it } from "vitest";

import {
  codeForStep,
  DIGITS,
  explainRejection,
  generateRecoveryCodes,
  generateSecret,
  hashRecoveryCode,
  normaliseRecoveryCode,
  provisioningUri,
  RECOVERY_CODE_COUNT,
  stepAt,
  STEP_SECONDS,
  verifyCode,
} from "../src/totp";

// RFC 6238 Appendix B uses the ASCII seed "12345678901234567890" for SHA-1.
// Base32 of those twenty bytes, which is the form this module takes.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("RFC 6238 Appendix B test vectors", () => {
  // Time, expected 8-digit code. The RFC tabulates TOTP at 8 digits; this
  // module emits 6, which by construction is the last six of the same
  // truncation — so the vectors are compared on their final six characters.
  const VECTORS: Array<[number, string]> = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];

  for (const [seconds, expected] of VECTORS) {
    it(`matches the published code at T=${seconds}`, () => {
      const step = stepAt(seconds * 1000);
      expect(codeForStep(RFC_SECRET, step)).toBe(expected.slice(-DIGITS));
    });
  }

  it("steps every 30 seconds, on the boundary the RFC defines", () => {
    expect(stepAt(59_000)).toBe(1);
    expect(stepAt(60_000)).toBe(2);
    expect(STEP_SECONDS).toBe(30);
  });
});

describe("verifyCode", () => {
  const NOW = 1_700_000_000_000;
  const current = () => codeForStep(RFC_SECRET, stepAt(NOW));

  it("accepts the current code and returns its step, not a boolean", () => {
    // The step is the whole point: a boolean cannot be stored, and without
    // storing it a code stays replayable for its whole window.
    expect(verifyCode(RFC_SECRET, current(), { nowMs: NOW, lastUsedStep: null })).toBe(
      stepAt(NOW),
    );
  });

  it("accepts one step either side, for a phone clock that has drifted", () => {
    const before = codeForStep(RFC_SECRET, stepAt(NOW) - 1);
    const after = codeForStep(RFC_SECRET, stepAt(NOW) + 1);
    expect(verifyCode(RFC_SECRET, before, { nowMs: NOW, lastUsedStep: null })).not.toBeNull();
    expect(verifyCode(RFC_SECRET, after, { nowMs: NOW, lastUsedStep: null })).not.toBeNull();
  });

  it("refuses two steps away — the window is ±1, not 'roughly now'", () => {
    const far = codeForStep(RFC_SECRET, stepAt(NOW) - 2);
    expect(verifyCode(RFC_SECRET, far, { nowMs: NOW, lastUsedStep: null })).toBeNull();
  });

  // The property that makes it one-time. Without it, a code read over a
  // shoulder works for the rest of its window.
  it("REFUSES a code whose step has already been spent", () => {
    const step = stepAt(NOW);
    expect(verifyCode(RFC_SECRET, current(), { nowMs: NOW, lastUsedStep: step })).toBeNull();
  });

  it("spending the current code retires the previous step's too", () => {
    // Otherwise the drift window is a second life for an intercepted code:
    // sign in with this step's code, and last step's still works.
    const step = stepAt(NOW);
    const previous = codeForStep(RFC_SECRET, step - 1);
    expect(verifyCode(RFC_SECRET, previous, { nowMs: NOW, lastUsedStep: step })).toBeNull();
  });

  it("refuses anything that is not six digits", () => {
    for (const bad of ["", "12345", "1234567", "abcdef", "12 34 56 78", "12345a"]) {
      expect(verifyCode(RFC_SECRET, bad, { nowMs: NOW, lastUsedStep: null })).toBeNull();
    }
  });

  it("tolerates the spacing an authenticator app displays", () => {
    const spaced = `${current().slice(0, 3)} ${current().slice(3)}`;
    expect(verifyCode(RFC_SECRET, spaced, { nowMs: NOW, lastUsedStep: null })).not.toBeNull();
  });

  it("refuses a correct-looking code from a different secret", () => {
    const other = generateSecret();
    const code = codeForStep(other, stepAt(NOW));
    expect(verifyCode(RFC_SECRET, code, { nowMs: NOW, lastUsedStep: null })).toBeNull();
  });
});

describe("generateSecret", () => {
  it("is 32 base32 characters with no padding, which is what apps accept", () => {
    const secret = generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(secret).not.toContain("=");
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateSecret()));
    expect(seen.size).toBe(50);
  });

  it("round-trips through the code path it was made for", () => {
    const secret = generateSecret();
    expect(codeForStep(secret, 1)).toMatch(/^\d{6}$/);
  });
});

describe("provisioningUri", () => {
  it("names the issuer twice — the label prefix and the parameter", () => {
    const uri = provisioningUri(RFC_SECRET, {
      account: "oli@example.com",
      issuer: "Olink Desk",
    });
    expect(uri).toContain("otpauth://totp/Olink%20Desk%3Aoli%40example.com");
    expect(uri).toContain("issuer=Olink%20Desk");
  });

  it("states the algorithm, digits and period rather than relying on defaults", () => {
    const uri = provisioningUri(RFC_SECRET, { account: "a@b.c", issuer: "X" });
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain(`digits=${DIGITS}`);
    expect(uri).toContain(`period=${STEP_SECONDS}`);
  });
});

describe("recovery codes", () => {
  it("issues ten by default", () => {
    expect(generateRecoveryCodes()).toHaveLength(RECOVERY_CODE_COUNT);
  });

  // The alphabet is the point: somebody is typing these having just lost
  // their phone, off paper, probably in a hurry.
  it("contains no character that reads as another", () => {
    for (const code of generateRecoveryCodes(30)) {
      expect(code).toMatch(/^[a-hj-km-np-z2-9]{5}-[a-hj-km-np-z2-9]{5}$/);
      expect(code).not.toMatch(/[0o1li]/);
    }
  });

  it("does not repeat", () => {
    const codes = generateRecoveryCodes(50);
    expect(new Set(codes).size).toBe(50);
  });

  it("normalises the hyphen and the case away, so neither can refuse a correct code", () => {
    expect(normaliseRecoveryCode("ABCDE-FGHJK")).toBe("abcdefghjk");
    expect(normaliseRecoveryCode("  abcde fghjk ")).toBe("abcdefghjk");
    expect(hashRecoveryCode("ABCDE-FGHJK")).toBe(hashRecoveryCode("abcdefghjk"));
  });

  it("hashes, so the stored form is not the usable form", () => {
    const [code] = generateRecoveryCodes(1);
    const hash = hashRecoveryCode(code);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(normaliseRecoveryCode(code));
  });
});

describe("explainRejection", () => {
  const NOW = 1_700_000_000_000;

  it("names a malformed entry rather than guessing at a cause", () => {
    expect(explainRejection(RFC_SECRET, "12", NOW).kind).toBe("malformed");
  });

  // The two failures that look identical to the person typing, and have
  // completely different fixes.
  it("recognises a correct code from a device whose clock is behind", () => {
    const code = codeForStep(RFC_SECRET, stepAt(NOW) - 20); // 10 minutes back
    const why = explainRejection(RFC_SECRET, code, NOW);
    expect(why.kind).toBe("clock_drift");
    if (why.kind === "clock_drift") {
      expect(why.direction).toBe("behind");
      expect(why.minutes).toBe(10);
    }
  });

  it("recognises a correct code from a device whose clock is ahead", () => {
    const code = codeForStep(RFC_SECRET, stepAt(NOW) + 10); // 5 minutes on
    const why = explainRejection(RFC_SECRET, code, NOW);
    expect(why.kind).toBe("clock_drift");
    if (why.kind === "clock_drift") expect(why.direction).toBe("ahead");
  });

  it("recognises a code from a stale authenticator entry", () => {
    const stale = codeForStep(generateSecret(), stepAt(NOW));
    expect(explainRejection(RFC_SECRET, stale, NOW).kind).toBe("wrong_secret");
  });

  // A diagnostic that accepted anything would be a second, wider door.
  it("never accepts: it only explains", () => {
    const drifted = codeForStep(RFC_SECRET, stepAt(NOW) - 20);
    expect(explainRejection(RFC_SECRET, drifted, NOW).kind).toBe("clock_drift");
    expect(verifyCode(RFC_SECRET, drifted, { nowMs: NOW, lastUsedStep: null })).toBeNull();
  });
});
