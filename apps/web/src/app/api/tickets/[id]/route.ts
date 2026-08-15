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
