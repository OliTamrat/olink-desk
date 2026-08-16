// Queues: named buckets tickets are routed into. List is any staff;
// creation is SUPERVISOR/ADMIN.
import { prisma, UserRole } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const principal = await requireUser(request);
  if (isDenied(principal)) return principal;
  const queues = await prisma.queue.findMany({
    where: { organizationId: principal.organization.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return NextResponse.json({ queues });
}

export async function POST(request: NextRequest) {
  const principal = await requireUser(request, [
    UserRole.SUPERVISOR,
    UserRole.ADMIN,
  ]);
  if (isDenied(principal)) return principal;

  let name: unknown;
  try {
    ({ name } = (await request.json()) as { name?: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof name !== "string" || !name.trim() || name.trim().length > 60) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  try {
    const queue = await prisma.queue.create({
      data: { organizationId: principal.organization.id, name: name.trim() },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: principal.organization.id,
        actorUserId: principal.user.id,
        action: "queue.created",
        entityType: "queue",
        entityId: String(queue.id),
        metadata: {},
      },
    });
    return NextResponse.json({ queue: { id: queue.id, name: queue.name } });
  } catch {
    return NextResponse.json({ error: "That queue name is taken" }, { status: 409 });
  }
}
