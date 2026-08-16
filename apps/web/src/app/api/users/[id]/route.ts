// Change a teammate's role, or deactivate them. Admins only — and nobody
// can lock a workspace out of its own administration.
import { prisma, UserRole, UserStatus } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../../lib/session";

export const dynamic = "force-dynamic";

const ROLES: UserRole[] = [
  UserRole.AGENT,
  UserRole.SUPERVISOR,
  UserRole.ADMIN,
  UserRole.AUDITOR,
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const principal = await requireUser(request, [UserRole.ADMIN]);
  if (isDenied(principal)) return principal;

  const target = await prisma.user.findFirst({
    where: { id: params.id, organizationId: principal.organization.id },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let payload: { role?: unknown; status?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (ROLES.includes(payload.role as UserRole)) data.role = payload.role;
  if (payload.status === UserStatus.ACTIVE || payload.status === UserStatus.DISABLED) {
    data.status = payload.status;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }

  // Two lockout guards. You cannot change your own role or status — an
  // admin demoting themselves by mistake has no way back. And the last
  // active admin cannot be demoted or disabled: a workspace with no admin
  // is unrecoverable without database access.
  if (target.id === principal.user.id) {
    return NextResponse.json(
      { error: "You cannot change your own role or status" },
      { status: 400 },
    );
  }
  if (
    target.role === UserRole.ADMIN &&
    (data.role !== undefined || data.status === UserStatus.DISABLED)
  ) {
    const admins = await prisma.user.count({
      where: {
        organizationId: principal.organization.id,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    if (admins <= 1) {
      return NextResponse.json(
        { error: "A workspace must keep at least one active admin" },
        { status: 400 },
      );
    }
  }

  const user = await prisma.user.update({
    where: { id: target.id },
    data,
    select: { id: true, name: true, email: true, role: true, status: true },
  });
  await prisma.auditLog.create({
    data: {
      organizationId: principal.organization.id,
      actorUserId: principal.user.id,
      action: "user.updated",
      entityType: "user",
      entityId: String(user.id),
      metadata: { changed: Object.keys(data) },
    },
  });
  return NextResponse.json({ user });
}
