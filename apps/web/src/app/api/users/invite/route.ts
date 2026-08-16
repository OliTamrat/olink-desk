// Add a teammate. Email delivery is not wired in Desk yet, so a temporary
// password is generated and returned EXACTLY ONCE for the admin to hand
// over — an honest mechanism beats an invite link that silently goes
// nowhere. It is never written to the audit trail.
import { hashPassword, passwordPolicyError } from "@olink-desk/auth";
import { prisma, UserRole, UserStatus } from "@olink-desk/database";
import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../../lib/session";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ROLES: UserRole[] = [
  UserRole.AGENT,
  UserRole.SUPERVISOR,
  UserRole.ADMIN,
  UserRole.AUDITOR,
];

export async function POST(request: NextRequest) {
  const principal = await requireUser(request, [UserRole.ADMIN]);
  if (isDenied(principal)) return principal;

  let payload: { name?: unknown; email?: unknown; role?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const email =
    typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const role = ROLES.includes(payload.role as UserRole)
    ? (payload.role as UserRole)
    : UserRole.AGENT;
  if (!name) return NextResponse.json({ error: "A name is required" }, { status: 400 });
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  // 18 random bytes → 24 base64url characters, comfortably past the
  // MIN_PASSWORD_LENGTH floor. Deliberately built from randomness ALONE:
  // an earlier version wrapped the random part in fixed affixes and read
  // as a hardcoded credential to secret scanners, which cannot tell a
  // generator from a real password (the fleet's no-key-shaped-literals
  // rule). The policy is asserted rather than assumed, so tightening it
  // later cannot silently start minting passwords nobody can use.
  const temporaryPassword = randomBytes(18).toString("base64url");
  const policyError = passwordPolicyError(temporaryPassword);
  if (policyError) {
    return NextResponse.json(
      { error: "Could not generate a compliant temporary password" },
      { status: 500 },
    );
  }

  try {
    const user = await prisma.user.create({
      data: {
        organizationId: principal.organization.id,
        name,
        email,
        role,
        status: UserStatus.ACTIVE,
        passwordHash: hashPassword(temporaryPassword),
      },
      select: { id: true, name: true, email: true, role: true },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: principal.organization.id,
        actorUserId: principal.user.id,
        action: "user.invited",
        entityType: "user",
        entityId: String(user.id),
        metadata: { role },
      },
    });
    return NextResponse.json({ user, temporaryPassword });
  } catch {
    return NextResponse.json(
      { error: "Someone with that email is already on this team" },
      { status: 409 },
    );
  }
}
