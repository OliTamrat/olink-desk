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
  try {
    ({ body } = (await request.json()) as { body?: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body !== "string") {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
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
