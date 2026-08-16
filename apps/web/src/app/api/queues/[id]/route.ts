// Remove a queue. Tickets sitting in it are not deleted — they fall back to
// no queue, because losing a customer's ticket to tidy up a list would be
// the worst possible trade.
import { prisma, UserRole } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../../lib/session";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const principal = await requireUser(request, [UserRole.SUPERVISOR, UserRole.ADMIN]);
  if (isDenied(principal)) return principal;

  const queue = await prisma.queue.findFirst({
    where: { id: params.id, organizationId: principal.organization.id },
  });
  if (!queue) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.ticket.updateMany({
    where: { organizationId: principal.organization.id, queueId: queue.id },
    data: { queueId: null },
  });
  await prisma.queue.delete({ where: { id: queue.id } });
  await prisma.auditLog.create({
    data: {
      organizationId: principal.organization.id,
      actorUserId: principal.user.id,
      action: "queue.deleted",
      entityType: "queue",
      entityId: String(queue.id),
      metadata: { name: queue.name },
    },
  });
  return NextResponse.json({ ok: true });
}
