// The supervisor wallboard's data: per-queue live state and today's
// medians, aggregated server-side so the screen polls one small payload.
// Breach is DERIVED from the stored due dates at read time — no cron in the
// truth path, so the wallboard can never show stale breach state.
import { prisma, TicketStatus, UserRole } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../lib/session";

export const dynamic = "force-dynamic";

const OPEN: TicketStatus[] = [
  TicketStatus.NEW,
  TicketStatus.OPEN,
  TicketStatus.PENDING,
];

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

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
      },
    }),
  ]);

  // A ticket's SLA state, derived live. "At risk" = past 80% of the window.
  const state = (t: (typeof openTickets)[number]) => {
    const clock =
      !t.firstRespondedAt && t.firstResponseDueAt
        ? { due: t.firstResponseDueAt, kind: "first_response" as const }
        : t.resolveDueAt
          ? { due: t.resolveDueAt, kind: "resolve" as const }
          : null;
    if (!clock) return { breached: false, atRisk: false };
    const dueMs = clock.due.getTime();
    if (now >= dueMs) return { breached: true, atRisk: false };
    const created = t.createdAt.getTime();
    const progress = (now - created) / Math.max(1, dueMs - created);
    return { breached: false, atRisk: progress >= 0.8 };
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
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
