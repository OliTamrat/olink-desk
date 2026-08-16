// The escalation pass.
//
// Runs on a schedule and turns the SLA engine's derivations into alarms
// somebody actually receives. Before this, breach was computed only inside
// the wallboard route — so a promise missed at 2am was missed silently.
//
// Deliberately NOT in the truth path: the wallboard and the ticket rail still
// derive health live at read time, so a cron that stops running degrades the
// product to "nobody is told", never to "the numbers are wrong".
import { prisma, type NotificationKind } from "@olink-desk/database";
import { escalationsFor, type EscalationTicket } from "@olink-desk/sla";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// How far back a pass looks. An escalation about a ticket that has been open
// for three months is archaeology, not an alarm, and on first deployment it
// would bury a real queue under everything that ever went wrong.
const LOOKBACK_DAYS = 7;

/**
 * Fail-closed shared-secret check (fleet pattern, ported from Bank Assist's
 * `_require_cron_secret`).
 *
 * An UNSET secret rejects everything. The tempting alternative — "no secret
 * configured, so allow it" — turns a deploy mistake into an open endpoint
 * that anybody can hammer, and it fails in the direction where nobody finds
 * out. Comparison is constant-time so a wrong header cannot be narrowed down
 * a byte at a time.
 */
function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET ?? "";
  const given = request.headers.get("x-cron-secret") ?? "";
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length, so the lengths are compared first and the result folded in.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86400000);

  // Every open ticket across every tenant. This is the one route in the
  // product that legitimately crosses tenants — it is machine-driven and
  // carries no user — so the escalations it writes are grouped back by the
  // ticket's own organizationId rather than by anything the caller said.
  const tickets = await prisma.ticket.findMany({
    where: {
      status: { in: ["NEW", "OPEN", "PENDING"] },
      createdAt: { gte: since },
    },
    select: {
      id: true,
      organizationId: true,
      assigneeId: true,
      createdAt: true,
      firstResponseDueAt: true,
      resolveDueAt: true,
      firstRespondedAt: true,
    },
  });

  const orgOf = new Map(tickets.map((t) => [t.id, t.organizationId]));
  const raised = escalationsFor(tickets as EscalationTicket[], now);

  // createMany + skipDuplicates against the unique (ticketId, kind): repeated
  // passes are no-ops, so the schedule can be as tight as the team wants
  // without anybody being told the same thing twice. Same reasoning as the
  // SLA policy seeder — an upsert still raises P2002 under real concurrency.
  const created = await prisma.notification.createMany({
    data: raised.map((r) => ({
      organizationId: orgOf.get(r.ticketId) as string,
      ticketId: r.ticketId,
      kind: r.kind as NotificationKind,
      userId: r.userId,
    })),
    skipDuplicates: true,
  });

  return NextResponse.json(
    {
      ok: true,
      scanned: tickets.length,
      raised: raised.length,
      created: created.count,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
