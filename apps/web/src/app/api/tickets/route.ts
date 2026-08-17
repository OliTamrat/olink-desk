// The workspace's ticket query: saved views + filters + search, tenant-scoped
// from the SESSION (never the request). Views are the industry-standard
// navigation unit — "my work", "unassigned", "all open", "recently solved" —
// and they compose with the filters rather than replacing them.
import {
  Channel,
  prisma,
  TicketPriority,
  TicketStatus,
  UserRole,
  type Prisma,
} from "@olink-desk/database";
import { slaState } from "@olink-desk/sla";
import { cleanContact, ContactConflictError, findOrCreateContact, openTicket } from "@olink-desk/tickets";
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

  // Tag drill-down. Matched on the SLUG rather than the id, so a link is
  // readable and survives a tag being renamed — the slug is what identity
  // means for a tag (see packages/database/src/tags.ts).
  const tag = params.get("tag");
  if (tag) where.tags = { some: { tag: { slug: tag } } };

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
        tags: { select: { tag: { select: { id: true, name: true, slug: true } } } },
        contact: { select: { name: true, phone: true } },
        assignee: { select: { name: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, direction: true, redactedAt: true, createdAt: true },
        },
      },
    }),
  ]);

  // SLA health is DERIVED (ADR 0006), so it cannot be a WHERE clause without
  // duplicating the definition in SQL — and a second definition is how the
  // wallboard's count and this list would drift apart. Filtering in code
  // against the same slaState() the wallboard and the escalation cron use
  // keeps exactly one answer to "what does breached mean".
  // Flattened once here rather than in three screens: the join row is an
  // implementation detail of the schema, not something a list should carry.
  const rows = tickets.map((t) => ({ ...t, tags: t.tags.map((j) => j.tag) }));

  const slaParam = params.get("sla");
  if (slaParam === "at_risk" || slaParam === "breached") {
    const now = new Date();
    const matching = rows.filter((t) => slaState(t, now).health === slaParam);
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
    { tickets: rows, count, truncated: count > tickets.length },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// ---------------------------------------------------------------- creation
//
// A ticket that did not arrive on a channel: a phone call somebody took, a
// customer at the counter, a message relayed in person. Until now these could
// not be recorded at all, which meant the desk's own numbers described only
// the work that happened to arrive electronically.
//
// The load-bearing honesty here is that such a ticket has **no conversation**.
// There is no channel identity to reply on, so the console must say "call them
// back" rather than offer a composer that fails — the same `undeliverable`
// case bulk macros learned to name.
const MANUAL_CHANNELS: Channel[] = [Channel.PHONE, Channel.WALK_IN, Channel.EMAIL];
const CREATORS: UserRole[] = [UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN];
const PRIORITIES = new Set<string>(Object.values(TicketPriority));
const LANGUAGES = ["en", "am", "om", "ti", "so", "sw"];
const MAX_SUBJECT = 200;
const MAX_DESCRIPTION = 8000;

export async function POST(request: NextRequest) {
  const principal = await requireUser(request, CREATORS);
  if (isDenied(principal)) return principal;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const asString = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const subject = asString(payload.subject).slice(0, MAX_SUBJECT);
  const description = asString(payload.description).slice(0, MAX_DESCRIPTION);
  if (!subject) {
    return NextResponse.json({ error: "A subject is required" }, { status: 400 });
  }

  const channel = MANUAL_CHANNELS.includes(payload.channel as Channel)
    ? (payload.channel as Channel)
    : Channel.PHONE;

  // The customer: an existing id, or details to find-or-create from. Creating
  // the person and the ticket in one step is the whole point — an agent on a
  // call cannot be asked to go and fill in a directory first.
  let contactId: string | null = null;
  let contactLanguage: string | null = null;
  const contactRef = asString(payload.contactId);
  if (contactRef) {
    const existing = await prisma.contact.findFirst({
      where: { id: contactRef, organizationId: principal.organization.id },
      select: { id: true, language: true },
    });
    if (!existing) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    contactId = existing.id;
    contactLanguage = existing.language;
  } else if (asString(payload.phone)) {
    const clean = cleanContact(payload, principal.organization.defaultLanguage);
    if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });
    try {
      const { contact } = await findOrCreateContact(
        prisma,
        principal.organization.id,
        clean.value,
      );
      contactId = contact.id;
      contactLanguage = contact.language;
    } catch (err) {
      if (err instanceof ContactConflictError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      throw err;
    }
  }

  // Language, in order of who knows best: what the agent picked on the call,
  // then what we already recorded for this customer, then the workspace
  // default. Never a guess from the subject line — an agent who just spoke to
  // the person is a better source than a detector.
  const picked = asString(payload.language);
  const language = LANGUAGES.includes(picked)
    ? picked
    : (contactLanguage ?? principal.organization.defaultLanguage);

  const priority = PRIORITIES.has(asString(payload.priority))
    ? (payload.priority as TicketPriority)
    : TicketPriority.NORMAL;

  // A queue or assignee named by the request must belong to this workspace.
  const queueRef = asString(payload.queueId);
  const queueId = queueRef
    ? (
        await prisma.queue.findFirst({
          where: { id: queueRef, organizationId: principal.organization.id },
          select: { id: true },
        })
      )?.id ?? null
    : null;
  const assigneeRef = asString(payload.assigneeId);
  const assigneeId = assigneeRef
    ? (
        await prisma.user.findFirst({
          where: { id: assigneeRef, organizationId: principal.organization.id },
          select: { id: true },
        })
      )?.id ?? null
    : null;

  const ticket = await openTicket(prisma, {
    organizationId: principal.organization.id,
    // Deliberately null. See the note above this handler.
    conversationId: null,
    contactId,
    channel,
    language,
    subject,
    priority,
    queueId,
    assigneeId,
  });

  // What the customer said, in the agent's words, as the first timeline entry.
  // INBOUND because it came FROM the customer — recording an agent's summary
  // of a call as an outbound message would make the timeline claim we said it.
  if (description) {
    await prisma.ticketMessage.create({
      data: {
        organizationId: principal.organization.id,
        ticketId: ticket.id,
        direction: "INBOUND",
        channel,
        body: description,
        contactId,
        authorUserId: principal.user.id,
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      organizationId: principal.organization.id,
      actorUserId: principal.user.id,
      action: "ticket.created_manually",
      entityType: "ticket",
      entityId: String(ticket.id),
      // The event, never the words: no subject, no description.
      metadata: { channel, priority, hasContact: contactId !== null },
    },
  });

  return NextResponse.json({
    ticket: { id: ticket.id, number: ticket.number },
  });
}
