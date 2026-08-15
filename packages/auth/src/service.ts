// Registration and sign-in against the database. Routes stay thin shims so
// the whole flow is testable the way the channel spine is.
import type { Organization, PrismaClient, User } from "@olink-desk/database";
import { UserRole, UserStatus } from "@olink-desk/database";

import { isLocked, lockedUntil } from "./lockout";
import { hashPassword, passwordPolicyError, verifyPassword } from "./passwords";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RegisterResult =
  | { ok: true; organization: Organization; user: User }
  | { ok: false; error: string };

/** Create an organization and its first administrator. The first user is
 * ADMIN and ACTIVE by definition — everyone after arrives by invitation. */
export async function registerOrganization(
  db: PrismaClient,
  input: {
    organizationName: string;
    slug: string;
    name: string;
    email: string;
    password: string;
  },
): Promise<RegisterResult> {
  const organizationName = input.organizationName.trim();
  const slug = input.slug.trim().toLowerCase();
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!organizationName) return { ok: false, error: "Organization name is required" };
  if (!SLUG_RE.test(slug)) {
    return { ok: false, error: "Slug must be 2-40 chars: a-z, 0-9, hyphens" };
  }
  if (!name) return { ok: false, error: "Your name is required" };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "A valid email is required" };
  const policy = passwordPolicyError(input.password);
  if (policy) return { ok: false, error: policy };

  const existing = await db.organization.findUnique({ where: { slug } });
  if (existing) return { ok: false, error: "That workspace address is taken" };

  const organization = await db.organization.create({
    data: { name: organizationName, slug },
  });
  const user = await db.user.create({
    data: {
      organizationId: organization.id,
      email,
      name,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash: hashPassword(input.password),
    },
  });
  await db.auditLog.create({
    data: {
      organizationId: organization.id,
      actorUserId: user.id,
      action: "auth.organization_registered",
      entityType: "organization",
      entityId: String(organization.id),
      metadata: { slug },
    },
  });
  return { ok: true, organization, user };
}

export type AuthenticateResult =
  | { ok: true; user: User; organization: Organization }
  | { ok: false; reason: "bad_credentials" }
  | { ok: false; reason: "locked"; until: Date }
  | { ok: false; reason: "disabled" };

/**
 * Verify credentials with progressive lockout. Every failure path returns
 * `bad_credentials` indistinguishably (unknown org, unknown email, wrong
 * password) — except an active lock and a disabled account, which the user
 * must be told about or the lock reads as a wrong password forever.
 */
export async function authenticate(
  db: PrismaClient,
  input: { orgSlug: string; email: string; password: string },
  now: Date = new Date(),
): Promise<AuthenticateResult> {
  const organization = await db.organization.findUnique({
    where: { slug: input.orgSlug.trim().toLowerCase() },
  });
  if (!organization) {
    verifyPassword(input.password, null); // burn the comparison anyway
    return { ok: false, reason: "bad_credentials" };
  }
  const user = await db.user.findUnique({
    where: {
      organizationId_email: {
        organizationId: organization.id,
        email: input.email.trim().toLowerCase(),
      },
    },
  });
  if (!user) {
    verifyPassword(input.password, null);
    return { ok: false, reason: "bad_credentials" };
  }
  if (user.status === UserStatus.DISABLED) return { ok: false, reason: "disabled" };
  if (isLocked(user.lockedUntil, now)) {
    return { ok: false, reason: "locked", until: user.lockedUntil as Date };
  }

  if (!verifyPassword(input.password, user.passwordHash)) {
    const failed = user.failedLoginAttempts + 1;
    const until = lockedUntil(failed, now);
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: failed, lockedUntil: until },
    });
    // The count is audited, never the password.
    await db.auditLog.create({
      data: {
        organizationId: organization.id,
        action: "auth.login_failed",
        entityType: "user",
        entityId: String(user.id),
        metadata: { failedAttempts: failed, locked: until !== null },
      },
    });
    if (until) return { ok: false, reason: "locked", until };
    return { ok: false, reason: "bad_credentials" };
  }

  const fresh = await db.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now },
  });
  await db.auditLog.create({
    data: {
      organizationId: organization.id,
      actorUserId: user.id,
      action: "auth.login",
      entityType: "user",
      entityId: String(user.id),
    },
  });
  return { ok: true, user: fresh, organization };
}
