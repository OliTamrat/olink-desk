// The supervisor wallboard's data: per-queue live state and today's
// medians, aggregated server-side so the screen polls one small payload.
// Breach is DERIVED from the stored due dates at read time — no cron in the
// truth path, so the wallboard can never show stale breach state.
import { prisma, TicketStatus, UserRole } from "@olink-desk/database";
import { median } from "@olink-desk/reports";
import { slaState } from "@olink-desk/sla";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../lib/session";

export const dynamic = "force-dynamic";

const OPEN: TicketStatus[] = [
  TicketStatus.NEW,
  TicketStatus.OPEN,
  TicketStatus.PENDING,
];


export async function GET(request: NextRequest) {
  const principal = await requireUser(request, [
    UserRole.SUPERVISOR,
    UserRole.ADMIN,
    UserRole.AUDITOR,
  ]);
  if (isDenied(principal)) return principal;
  const orgId = principal.organization.id;
  const now = Date.now();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [openTickets, queues, agents, todayTickets] = await Promise.all([
    prisma.ticket.findMany({
      where: { organizationId: orgId, status: { in: OPEN } },
      select: {
        id: true,
        queueId: true,
        status: true,
        priority: true,
        channel: true,
        createdAt: true,
        firstRespondedAt: true,
        firstResponseDueAt: true,
        resolveDueAt: true,
        assigneeId: true,
      },
    }),
    prisma.queue.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { organizationId: orgId, status: "ACTIVE" },
      select: { id: true, name: true, role: true },
    }),
    prisma.ticket.findMany({
      where: { organizationId: orgId, createdAt: { gte: todayStart } },
      select: {
        createdAt: true,
        firstRespondedAt: true,
        resolvedAt: true,
        csatScore: true,
      },
    }),
  ]);

  // A ticket's SLA state, derived live — from packages/sla, which is the one
  // place that decides what "breached" means. This logic used to live inline
  // here, which made this screen the ONLY thing in the product that knew a
  // promise had been missed; the escalation cron now reads the same function.
  const nowDate = new Date(now);
  const state = (t: (typeof openTickets)[number]) => {
    const health = slaState(t, nowDate).health;
    return { breached: health === "breached", atRisk: health === "at_risk" };
  };

  const buckets = [
    ...queues.map((q) => ({ id: q.id as string | null, name: q.name })),
    { id: null, name: null }, // unrouted tickets
  ];
  const perQueue = buckets.map((b) => {
    const rows = openTickets.filter((t) => t.queueId === b.id);
    const states = rows.map(state);
    return {
      queueId: b.id,
      name: b.name,
      open: rows.length,
      unassigned: rows.filter((t) => !t.assigneeId).length,
      atRisk: states.filter((s) => s.atRisk).length,
      breached: states.filter((s) => s.breached).length,
      oldestWaitMinutes: rows.length
        ? Math.max(
            ...rows.map((t) => Math.floor((now - t.createdAt.getTime()) / 60000)),
          )
        : null,
    };
  });

  const openAssignments = new Map<string, number>();
  for (const t of openTickets) {
    if (t.assigneeId) {
      openAssignments.set(t.assigneeId, (openAssignments.get(t.assigneeId) ?? 0) + 1);
    }
  }

  return NextResponse.json(
    {
      totals: {
        open: openTickets.length,
        atRisk: openTickets.map(state).filter((s) => s.atRisk).length,
        breached: openTickets.map(state).filter((s) => s.breached).length,
        newToday: todayTickets.length,
      },
      perQueue,
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        openAssigned: openAssignments.get(a.id) ?? 0,
      })),
      today: {
        firstResponseMedianMinutes: median(
          todayTickets
            .filter((t) => t.firstRespondedAt)
            .map((t) =>
              Math.round(
                (t.firstRespondedAt!.getTime() - t.createdAt.getTime()) / 60000,
              ),
            ),
        ),
        resolveMedianMinutes: median(
          todayTickets
            .filter((t) => t.resolvedAt)
            .map((t) =>
              Math.round((t.resolvedAt!.getTime() - t.createdAt.getTime()) / 60000),
            ),
        ),
        // Satisfaction, reported as an average with its own denominator.
        // The count is not decoration: "4.0" from one reply and "4.0" from
        // ninety are different facts, and a rate with no denominator is the
        // easiest number in this product to be misled by (the Bank Assist
        // rule that a rate with no denominator is null, never zero).
        csatAverage: (() => {
          const scores = todayTickets
            .map((t) => t.csatScore)
            .filter((n): n is number => typeof n === "number");
          if (scores.length === 0) return null;
          return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
        })(),
        csatResponses: todayTickets.filter((t) => typeof t.csatScore === "number").length,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
