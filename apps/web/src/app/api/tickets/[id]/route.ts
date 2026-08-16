// One ticket with its full timeline, tenant-scoped through the session.
import { prisma } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const principal = await requireUser(request);
  if (isDenied(principal)) return principal;

  const ticket = await prisma.ticket.findFirst({
    where: { id: params.id, organizationId: principal.organization.id },
    include: {
      contact: { select: { name: true, phone: true, email: true, language: true } },
      conversation: { select: { channel: true, language: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          direction: true,
          channel: true,
          body: true,
          createdAt: true,
          authorUser: { select: { name: true } },
        },
      },
    },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ticket });
}

// Ticket lifecycle: status, priority, assignee, queue — the controls every
// industry-standard desk hangs off the ticket rail. AUDITOR is read-only.
// Every change writes an audit row; resolution stamps resolvedAt (cleared on
// reopen) and a priority change recomputes the SLA clocks from creation.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const { UserRole, TicketStatus, TicketPriority } = await import(
    "@olink-desk/database"
  );
  const { slaDatesFor } = await import("@olink-desk/sla");
  const principal = await requireUser(request, [
    UserRole.AGENT,
    UserRole.SUPERVISOR,
    UserRole.ADMIN,
  ]);
  if (isDenied(principal)) return principal;

  const ticket = await prisma.ticket.findFirst({
    where: { id: params.id, organizationId: principal.organization.id },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  const changed: string[] = [];

  if (typeof payload.status === "string") {
    if (!(payload.status in TicketStatus)) {
      return NextResponse.json({ error: "Unknown status" }, { status: 400 });
    }
    const status = payload.status as (typeof TicketStatus)[keyof typeof TicketStatus];
    data.status = status;
    // Resolution timestamps: stamped when entering, cleared when leaving —
    // a reopened ticket must not keep claiming it was resolved.
    if (status === TicketStatus.RESOLVED && !ticket.resolvedAt) {
      data.resolvedAt = new Date();
    }
    if (status === TicketStatus.CLOSED && !ticket.closedAt) {
      data.closedAt = new Date();
      data.resolvedAt = ticket.resolvedAt ?? new Date();
    }
    if (
      (status === TicketStatus.OPEN ||
        status === TicketStatus.NEW ||
        status === TicketStatus.PENDING) &&
      (ticket.resolvedAt || ticket.closedAt)
    ) {
      data.resolvedAt = null;
      data.closedAt = null;
    }
    changed.push("status");
  }

  if (typeof payload.priority === "string") {
    if (!(payload.priority in TicketPriority)) {
      return NextResponse.json({ error: "Unknown priority" }, { status: 400 });
    }
    const priority =
      payload.priority as (typeof TicketPriority)[keyof typeof TicketPriority];
    if (priority !== ticket.priority) {
      data.priority = priority;
      // The SLA promise follows the priority: recompute both clocks from
      // the ticket's creation on the new policy. A met first response is
      // already history and keeps its timestamp either way.
      const sla = await slaDatesFor(
        prisma,
        principal.organization.id,
        priority,
        ticket.createdAt,
      );
      data.slaPolicyId = sla.slaPolicyId;
      data.firstResponseDueAt = sla.firstResponseDueAt;
      data.resolveDueAt = sla.resolveDueAt;
      changed.push("priority");
    }
  }

  if ("assigneeId" in payload) {
    const assigneeId = payload.assigneeId;
    if (assigneeId === null) {
      data.assigneeId = null;
      changed.push("assignee");
    } else if (typeof assigneeId === "string") {
      // Tenant check: an assignee must be a user of THIS org.
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

  if ("queueId" in payload) {
    const queueId = payload.queueId;
    if (queueId === null) {
      data.queueId = null;
      changed.push("queue");
    } else if (typeof queueId === "string") {
      const queue = await prisma.queue.findFirst({
        where: { id: queueId, organizationId: principal.organization.id },
        select: { id: true },
      });
      if (!queue) {
        return NextResponse.json({ error: "Unknown queue" }, { status: 400 });
      }
      data.queueId = queueId;
      changed.push("queue");
    }
  }

  if (changed.length === 0) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }

  const updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data,
  });
  await prisma.auditLog.create({
    data: {
      organizationId: principal.organization.id,
      actorUserId: principal.user.id,
      action: "ticket.updated",
      entityType: "ticket",
      entityId: String(ticket.id),
      metadata: { changed },
    },
  });
  return NextResponse.json({ ok: true, ticket: updated });
}
