// The workspace's ticket query: saved views + filters + search, tenant-scoped
// from the SESSION (never the request). Views are the industry-standard
// navigation unit — "my work", "unassigned", "all open", "recently solved" —
// and they compose with the filters rather than replacing them.
import { Channel, prisma, TicketStatus, type Prisma } from "@olink-desk/database";
import { slaState } from "@olink-desk/sla";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../lib/session";

export const dynamic = "force-dynamic";

const STATUSES = new Set<string>(Object.values(TicketStatus));
const CHANNELS = new Set<string>(Object.values(Channel));
const OPEN_STATUSES: TicketStatus[] = [
  TicketStatus.NEW,
  TicketStatus.OPEN,
  TicketStatus.PENDING,
];

// Not exported: a Next route module may only export handlers and config.
const VIEWS = ["mine", "unassigned", "open", "solved", "all"] as const;
type TicketView = (typeof VIEWS)[number];

const PAGE_SIZE = 100;

// Sortable columns, allowlisted: a sort key from the query string must
// never reach Prisma unchecked.
const SORTS = {
  updated: "updatedAt",
  created: "createdAt",
  number: "number",
  status: "status",
  priority: "priority",
} as const;
type SortKey = keyof typeof SORTS;

export async function GET(request: NextRequest) {
  const principal = await requireUser(request);
  if (isDenied(principal)) return principal;
  const params = request.nextUrl.searchParams;

  const viewParam = params.get("view");
  const view: TicketView = VIEWS.includes(viewParam as TicketView)
    ? (viewParam as TicketView)
    : "open";

  const where: Prisma.TicketWhereInput = {
    organizationId: principal.organization.id,
  };

  // The view sets the baseline; explicit filters narrow it further. A
  // solved view ordered by recency is what "what did we finish" means.
  switch (view) {
    case "mine":
      where.assigneeId = principal.user.id;
      where.status = { in: OPEN_STATUSES };
      break;
    case "unassigned":
      where.assigneeId = null;
      where.status = { in: OPEN_STATUSES };
      break;
    case "open":
      where.status = { in: OPEN_STATUSES };
      break;
    case "solved":
      where.status = { in: [TicketStatus.RESOLVED, TicketStatus.CLOSED] };
      break;
    case "all":
      break;
  }

  const status = params.get("status");
  if (status && STATUSES.has(status)) where.status = status as TicketStatus;

  const channel = params.get("channel");
  if (channel && CHANNELS.has(channel)) where.channel = channel as Channel;

  const assignee = params.get("assignee");
  if (assignee === "none") where.assigneeId = null;
  else if (assignee) where.assigneeId = assignee;

  // Drill-down filters. Every number on the dashboard and the wallboard links
  // to the list that produced it, so each of those numbers needs a filter
  // here that means exactly the same thing — otherwise the count and the list
  // disagree and the drill-down becomes a way to distrust the tile.
  const queue = params.get("queue");
  if (queue === "none") where.queueId = null;
  else if (queue) where.queueId = queue;

  // "Awaiting first reply" — the dashboard tile of the same name.
  if (params.get("awaiting") === "1") where.firstRespondedAt = null;

  // Search covers what an agent actually remembers: the ticket number, the
  // subject, the customer, and the words in the conversation.
  const q = (params.get("q") ?? "").trim();
  if (q) {
    const asNumber = Number.parseInt(q.replace(/^#/, ""), 10);
    where.OR = [
      ...(Number.isSafeInteger(asNumber) ? [{ number: asNumber }] : []),
      { subject: { contains: q, mode: "insensitive" as const } },
      { contact: { name: { contains: q, mode: "insensitive" as const } } },
      { contact: { phone: { contains: q } } },
      { messages: { some: { body: { contains: q, mode: "insensitive" as const } } } },
    ];
  }

  const sortParam = params.get("sort");
  const sort: SortKey = sortParam && sortParam in SORTS ? (sortParam as SortKey) : "updated";
  const dir = params.get("dir") === "asc" ? "asc" : "desc";

  // The count is of the whole filtered set, not the page — "3 of 240" is
  // the number a supervisor is actually asking for.
  const [count, tickets] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      orderBy: { [SORTS[sort]]: dir },
      take: PAGE_SIZE,
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
        firstResponseDueAt: true,
        resolveDueAt: true,
        assigneeId: true,
        queueId: true,
        csatScore: true,
        csatSentAt: true,
        contact: { select: { name: true, phone: true } },
        assignee: { select: { name: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, direction: true, createdAt: true },
        },
      },
    }),
  ]);

  // SLA health is DERIVED (ADR 0006), so it cannot be a WHERE clause without
  // duplicating the definition in SQL — and a second definition is how the
  // wallboard's count and this list would drift apart. Filtering in code
  // against the same slaState() the wallboard and the escalation cron use
  // keeps exactly one answer to "what does breached mean".
  const slaParam = params.get("sla");
  if (slaParam === "at_risk" || slaParam === "breached") {
    const now = new Date();
    const matching = tickets.filter((t) => slaState(t, now).health === slaParam);
    return NextResponse.json(
      {
        tickets: matching,
        count: matching.length,
        // The page was filtered after the fact, so a full page means there
        // may be more beyond it. Saying so is more honest than reporting a
        // total this route cannot actually compute.
        truncated: tickets.length >= PAGE_SIZE,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { tickets, count, truncated: count > tickets.length },
    { headers: { "Cache-Control": "no-store" } },
  );
}
