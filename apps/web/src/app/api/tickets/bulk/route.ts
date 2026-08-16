// Bulk actions from the list: assign, re-prioritize or move several tickets
// at once. Every id is checked against the tenant before anything is
// written, and one audit row records the whole operation with its scope.
import { prisma, TicketPriority, TicketStatus, UserRole } from "@olink-desk/database";
import { slaDatesFor } from "@olink-desk/sla";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../../lib/session";

export const dynamic = "force-dynamic";

const MAX_IDS = 100;

export async function PATCH(request: NextRequest) {
  const principal = await requireUser(request, [
    UserRole.AGENT,
    UserRole.SUPERVISOR,
    UserRole.ADMIN,
  ]);
  if (isDenied(principal)) return principal;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids = Array.isArray(payload.ids)
    ? payload.ids.filter((v): v is string => typeof v === "string").slice(0, MAX_IDS)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids are required" }, { status: 400 });
  }

  // Scope first: only ids that belong to this tenant survive, so a crafted
  // request can move nothing it does not own.
  const owned = await prisma.ticket.findMany({
    where: { id: { in: ids }, organizationId: principal.organization.id },
    select: { id: true, createdAt: true },
  });
  if (owned.length === 0) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  const changed: string[] = [];

  if (typeof payload.status === "string" && payload.status in TicketStatus) {
    const status = payload.status as TicketStatus;
    data.status = status;
    if (status === TicketStatus.RESOLVED || status === TicketStatus.CLOSED) {
      data.resolvedAt = new Date();
      if (status === TicketStatus.CLOSED) data.closedAt = new Date();
    } else {
      data.resolvedAt = null;
      data.closedAt = null;
    }
    changed.push("status");
  }

  if ("assigneeId" in payload) {
    const assigneeId = payload.assigneeId;
    if (assigneeId === null) {
      data.assigneeId = null;
      changed.push("assignee");
    } else if (typeof assigneeId === "string") {
      const user = await prisma.user.findFirst({
        where: { id: assigneeId, organizationId: principal.organization.id },
        select: { id: true },
      });
      if (!user) {
        return NextResponse.json({ error: "Unknown assignee" }, { status: 400 });
      }
      data.assigneeId = assigneeId;
      changed.push("assignee");
    }
  }

  if (changed.length === 0 && !(typeof payload.priority === "string")) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }

  if (typeof payload.priority === "string" && payload.priority in TicketPriority) {
    // Priority carries an SLA promise, and the promise is computed from each
    // ticket's own creation time — so this one cannot be a single updateMany.
    const priority = payload.priority as TicketPriority;
    for (const t of owned) {
      const sla = await slaDatesFor(
        prisma,
        principal.organization.id,
        priority,
        t.createdAt,
      );
      await prisma.ticket.update({
        where: { id: t.id },
        data: {
          ...data,
          priority,
          slaPolicyId: sla.slaPolicyId,
          firstResponseDueAt: sla.firstResponseDueAt,
          resolveDueAt: sla.resolveDueAt,
        },
      });
    }
    changed.push("priority");
  } else {
    await prisma.ticket.updateMany({
      where: { id: { in: owned.map((t) => t.id) } },
      data,
    });
  }

  await prisma.auditLog.create({
    data: {
      organizationId: principal.organization.id,
      actorUserId: principal.user.id,
      action: "ticket.bulk_updated",
      entityType: "ticket",
      entityId: String(owned[0].id),
      metadata: { changed, count: owned.length },
    },
  });

  return NextResponse.json({ ok: true, updated: owned.length, changed });
}
