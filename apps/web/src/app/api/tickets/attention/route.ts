// The dashboard's needs-attention queue: breached, at-risk and unowned
// tickets, ranked worst-first, over the WHOLE open set.
//
// A separate endpoint rather than client-side maths over /api/tickets on
// purpose: that list is a 100-row page, and a breached ticket nobody has
// touched in days is exactly the row that falls off a recency-ordered page.
// A queue computed from it would go quiet about the oldest failure it exists
// to surface — a wrong answer that looks right, same shape as the truncated
// counts bug the /counts endpoint exists to prevent.
import { prisma, TicketStatus } from "@olink-desk/database";
import { attentionQueue } from "@olink-desk/sla";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../../lib/session";

export const dynamic = "force-dynamic";

const OPEN: TicketStatus[] = [
  TicketStatus.NEW,
  TicketStatus.OPEN,
  TicketStatus.PENDING,
];

/** Rows the rail shows; the header count comes from totals, never this. */
const LIMIT = 6;

export async function GET(request: NextRequest) {
  // Every role, agents included: the queue is the work itself, not
  // supervision of it. (The wallboard stays supervisor-gated because it is
  // about the TEAM; this is about the tickets.)
  const principal = await requireUser(request);
  if (isDenied(principal)) return principal;

  const open = await prisma.ticket.findMany({
    where: { organizationId: principal.organization.id, status: { in: OPEN } },
    select: {
      id: true,
      number: true,
      subject: true,
      createdAt: true,
      firstRespondedAt: true,
      firstResponseDueAt: true,
      resolveDueAt: true,
      assigneeId: true,
    },
  });

  const queue = attentionQueue(open, new Date(), LIMIT);
  const byId = new Map(open.map((t) => [t.id, t]));

  return NextResponse.json({
    items: queue.entries.flatMap((e) => {
      const t = byId.get(e.ticketId);
      return t
        ? [
            {
              id: t.id,
              number: t.number,
              subject: t.subject,
              kind: e.kind,
              minutes: e.minutes,
            },
          ]
        : [];
    }),
    totals: queue.totals,
  });
}
