// Per-view counts for the workspace's views rail. One request, one round
// trip: a rail that shows "Unassigned 7" is the difference between an agent
// knowing where the work is and having to click every view to find out.
import { prisma, TicketStatus } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../../lib/session";

export const dynamic = "force-dynamic";

const OPEN: TicketStatus[] = [
  TicketStatus.NEW,
  TicketStatus.OPEN,
  TicketStatus.PENDING,
];

export async function GET(request: NextRequest) {
  const principal = await requireUser(request);
  if (isDenied(principal)) return principal;
  const organizationId = principal.organization.id;

  // One grouped count for the whole lifecycle, alongside the view counts.
  // The dashboard's overview needs a number per STATUS, and five more
  // `count()` calls to get them would be five more round trips for data the
  // database can group in one.
  const [byStatus, mine, unassigned, open, solved, all] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: { _all: true },
    }),
    prisma.ticket.count({
      where: { organizationId, assigneeId: principal.user.id, status: { in: OPEN } },
    }),
    prisma.ticket.count({
      where: { organizationId, assigneeId: null, status: { in: OPEN } },
    }),
    prisma.ticket.count({ where: { organizationId, status: { in: OPEN } } }),
    prisma.ticket.count({
      where: {
        organizationId,
        status: { in: [TicketStatus.RESOLVED, TicketStatus.CLOSED] },
      },
    }),
    prisma.ticket.count({ where: { organizationId } }),
  ]);

  return NextResponse.json(
    {
      mine,
      unassigned,
      open,
      solved,
      all,
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
