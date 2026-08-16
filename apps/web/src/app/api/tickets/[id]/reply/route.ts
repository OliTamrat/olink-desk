// An agent's reply, delivered on the ticket's own channel. AUDITOR is
// read-only by definition and cannot reply.
import { sendAgentReply } from "@olink-desk/channels";
import { prisma, UserRole } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

const REASON_STATUS: Record<string, number> = {
  ticket_not_found: 404,
  no_conversation: 409,
  channel_not_connected: 409,
  no_outbound_transport: 409,
  delivery_failed: 502,
  empty_body: 400,
};

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const principal = await requireUser(request, [
    UserRole.AGENT,
    UserRole.SUPERVISOR,
    UserRole.ADMIN,
  ]);
  if (isDenied(principal)) return principal;

  let body: unknown;
  let internal = false;
  try {
    const payload = (await request.json()) as { body?: unknown; internal?: unknown };
    body = payload.body;
    internal = payload.internal === true;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body !== "string") {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  // An internal note is a NOTE row and nothing else: no channel send, no
  // first-response stamp, no status change. It is the team talking to
  // itself, and the customer must never be able to receive it — which is
  // why it never touches sendAgentReply.
  if (internal) {
    const trimmed = body.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "empty_body" }, { status: 400 });
    }
    const ticket = await prisma.ticket.findFirst({
      where: { id: params.id, organizationId: principal.organization.id },
      select: { id: true, channel: true },
    });
    if (!ticket) {
      return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });
    }
    const note = await prisma.ticketMessage.create({
      data: {
        organizationId: principal.organization.id,
        ticketId: ticket.id,
        direction: "NOTE",
        channel: ticket.channel,
        body: trimmed,
        authorUserId: principal.user.id,
      },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: principal.organization.id,
        actorUserId: principal.user.id,
        action: "ticket.note_added",
        entityType: "ticket",
        entityId: String(ticket.id),
        metadata: {},
      },
    });
    return NextResponse.json({ ok: true, messageId: note.id, internal: true });
  }

  const result = await sendAgentReply({
    db: prisma,
    organizationId: principal.organization.id,
    ticketId: params.id,
    body,
    authorUserId: principal.user.id,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: REASON_STATUS[result.reason] ?? 500 },
    );
  }
  return NextResponse.json({ ok: true, messageId: result.messageId });
}
