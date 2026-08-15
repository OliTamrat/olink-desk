// Auth: registration, sign-in, progressive lockout, tenant isolation.
// DB-backed like the channel suites; JWT_SECRET is set per-test-file.
import { randomBytes } from "node:crypto";

import { prisma } from "@olink-desk/database";
import { beforeAll, describe, expect, it } from "vitest";

import { lockMinutesAfter } from "../src/lockout";
import { hashPassword, verifyPassword } from "../src/passwords";
import { authenticate, registerOrganization } from "../src/service";
import { signSession, verifySession } from "../src/session";

const PASSWORD = "a-long-enough-password";

function fresh() {
  const suffix = randomBytes(4).toString("hex");
  return {
    organizationName: "Test Org",
    slug: `auth-${suffix}`,
    name: "Test Admin",
    email: `admin-${suffix}@example.com`,
    password: PASSWORD,
  };
}

beforeAll(() => {
  process.env.JWT_SECRET = randomBytes(32).toString("hex");
});

describe("passwords", () => {
  it("round-trips and rejects wrong input", () => {
    const hash = hashPassword(PASSWORD);
    expect(verifyPassword(PASSWORD, hash)).toBe(true);
    expect(verifyPassword("wrong-password-here", hash)).toBe(false);
  });

  it("a user with no hash can never verify", () => {
    expect(verifyPassword(PASSWORD, null)).toBe(false);
  });
});

describe("lockout policy", () => {
  it("gives free attempts then doubles, capped", () => {
    expect(lockMinutesAfter(4)).toBe(0);
    expect(lockMinutesAfter(5)).toBe(1);
    expect(lockMinutesAfter(6)).toBe(2);
    expect(lockMinutesAfter(8)).toBe(8);
    expect(lockMinutesAfter(30)).toBe(60);
  });
});

describe("sessions", () => {
  it("round-trips and rejects tampering", async () => {
    const token = await signSession({
      userId: "u1",
      organizationId: "o1",
      role: "AGENT",
    });
    const payload = await verifySession(token);
    expect(payload).toEqual({ userId: "u1", organizationId: "o1", role: "AGENT" });
    expect(await verifySession(token.slice(0, -2) + "xx")).toBeNull();
    expect(await verifySession("garbage")).toBeNull();
    expect(await verifySession(null)).toBeNull();
  });

  it("fails closed with no secret", async () => {
    const saved = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    await expect(
      signSession({ userId: "u", organizationId: "o", role: "AGENT" }),
    ).rejects.toThrow();
    expect(
      await verifySession("anything").catch(() => null),
    ).toBeNull();
    process.env.JWT_SECRET = saved;
  });
});

describe("registerOrganization", () => {
  it("creates the org and an ACTIVE ADMIN first user", async () => {
    const input = fresh();
    const result = await registerOrganization(prisma, input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user.role).toBe("ADMIN");
    expect(result.user.status).toBe("ACTIVE");
    expect(result.organization.slug).toBe(input.slug);
  });

  it("rejects a taken slug, a bad slug, and a weak password", async () => {
    const input = fresh();
    await registerOrganization(prisma, input);
    expect((await registerOrganization(prisma, input)).ok).toBe(false);
    expect(
      (await registerOrganization(prisma, { ...fresh(), slug: "Bad Slug!" })).ok,
    ).toBe(false);
    expect(
      (await registerOrganization(prisma, { ...fresh(), password: "short" })).ok,
    ).toBe(false);
  });
});

describe("authenticate", () => {
  it("signs a valid user in and resets the failure count", async () => {
    const input = fresh();
    await registerOrganization(prisma, input);
    await authenticate(prisma, {
      orgSlug: input.slug,
      email: input.email,
      password: "wrong-password-1",
    });
    const result = await authenticate(prisma, {
      orgSlug: input.slug,
      email: input.email,
      password: PASSWORD,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user.failedLoginAttempts).toBe(0);
    expect(result.user.lastLoginAt).not.toBeNull();
  });

  it("unknown org, unknown email and wrong password are indistinguishable", async () => {
    const input = fresh();
    await registerOrganization(prisma, input);
    const cases = [
      { orgSlug: "no-such-org", email: input.email, password: PASSWORD },
      { orgSlug: input.slug, email: "nobody@example.com", password: PASSWORD },
      { orgSlug: input.slug, email: input.email, password: "wrong-password-2" },
    ];
    for (const c of cases) {
      const result = await authenticate(prisma, c);
      expect(result).toEqual({ ok: false, reason: "bad_credentials" });
    }
  });

  it("locks after the free attempts and unlocks when the window passes", async () => {
    const input = fresh();
    await registerOrganization(prisma, input);
    const attempt = (password: string, now?: Date) =>
      authenticate(
        prisma,
        { orgSlug: input.slug, email: input.email, password },
        now,
      );
    let last: Awaited<ReturnType<typeof attempt>> | null = null;
    for (let i = 0; i < 5; i += 1) last = await attempt("wrong-password-3");
    expect(last && !last.ok && last.reason).toBe("locked");

    // Correct password while locked still refuses.
    const during = await attempt(PASSWORD);
    expect(!during.ok && during.reason).toBe("locked");

    // After the lock window, the right password gets in.
    const later = new Date(Date.now() + 5 * 60_000);
    const after = await attempt(PASSWORD, later);
    expect(after.ok).toBe(true);
  });

  it("isolates tenants: the same email in two orgs is two accounts", async () => {
    const a = fresh();
    const b = { ...fresh(), email: a.email };
    await registerOrganization(prisma, a);
    await registerOrganization(prisma, b);
    // Lock the account in org A…
    for (let i = 0; i < 5; i += 1) {
      await authenticate(prisma, {
        orgSlug: a.slug,
        email: a.email,
        password: "wrong-password-4",
      });
    }
    // …and org B's same-email account is untouched.
    const result = await authenticate(prisma, {
      orgSlug: b.slug,
      email: a.email,
      password: PASSWORD,
    });
    expect(result.ok).toBe(true);
  });

  it("a disabled account cannot sign in with the right password", async () => {
    const input = fresh();
    const reg = await registerOrganization(prisma, input);
    if (!reg.ok) throw new Error("setup failed");
    await prisma.user.update({
      where: { id: reg.user.id },
      data: { status: "DISABLED" },
    });
    const result = await authenticate(prisma, {
      orgSlug: input.slug,
      email: input.email,
      password: PASSWORD,
    });
    expect(!result.ok && result.reason).toBe("disabled");
  });
});
