// The inbox: this tenant's tickets, newest activity first. Scope comes from
// the session's organizationId — never from the request.
import { prisma, TicketStatus } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../lib/session";

export const dynamic = "force-dynamic";

const STATUSES = new Set(Object.values(TicketStatus));

export async function GET(request: NextRequest) {
  const principal = await requireUser(request);
  if (isDenied(principal)) return principal;

  const statusParam = request.nextUrl.searchParams.get("status");
  const status =
    statusParam && STATUSES.has(statusParam as TicketStatus)
      ? (statusParam as TicketStatus)
      : undefined;

  const tickets = await prisma.ticket.findMany({
    where: {
      organizationId: principal.organization.id,
      ...(status ? { status } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      number: true,
      channel: true,
      status: true,
      priority: true,
      subject: true,
      language: true,
      createdAt: true,
      updatedAt: true,
      firstRespondedAt: true,
      contact: { select: { name: true, phone: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, direction: true, createdAt: true },
      },
    },
  });
  return NextResponse.json({ tickets });
}
