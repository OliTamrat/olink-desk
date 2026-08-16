// Apply one macro to many tickets.
//
// This is the fast path for the case it exists for: an outage, a delayed
// shipment, a public holiday — forty people asking the same thing who all
// deserve an answer now rather than in the order somebody can type.
//
// It is also the most dangerous button in the product, and the danger is
// specific: **a single-ticket macro fills a composer an agent reads before
// sending. In bulk there is no composer.** Text goes to real people without
// anybody having looked at it.
//
// Three things make that safe enough to ship:
//
//   1. **PREVIEW IS A SEPARATE, NON-MUTATING CALL.** The console must show
//      what each customer will actually receive before anything is sent. It
//      is not advisory: the commit path is the only one that writes, so a
//      preview cannot deliver by accident.
//   2. **The preview is grouped BY LANGUAGE**, because that is the axis the
//      agent cannot predict. A macro renders in each ticket's own language
//      (ADR 0007), so the same button sends four different texts — and the
//      agent reads at most one of them fluently. Showing "31 in Amharic, 6
//      in English, 3 fall back to English" is the only honest summary.
//   3. **Undeliverable tickets are named, not skipped.** A walk-in or a
//      phone ticket has no transport; silently dropping them would report
//      "40 sent" when 37 were.
import { sendAgentReply } from "@olink-desk/channels";
import { prisma, UserRole } from "@olink-desk/database";
import { parseBodies, recordMacroUse, renderMacro } from "@olink-desk/macros";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

// Lower than the 100 of other bulk actions on purpose. Re-prioritising 100
// tickets is reversible; messaging 100 customers is not.
const MAX_IDS = 50;

const SENDERS: UserRole[] = [UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN];

interface Prepared {
  ticketId: string;
  number: number;
  // The language this ticket will actually be answered in.
  language: string;
  // The language the customer WROTE in. Equal to `language` unless the macro
  // has no text for it — and when they differ, the second one is the useful
  // half: it names what somebody would have to write to fix it.
  requested: string;
  fellBack: boolean;
  text: string;
}

export async function POST(request: NextRequest) {
  const principal = await requireUser(request, SENDERS);
  if (isDenied(principal)) return principal;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids = Array.isArray(payload.ids)
    ? payload.ids.filter((v): v is string => typeof v === "string").slice(0, MAX_IDS)
    : [];
  const macroId = typeof payload.macroId === "string" ? payload.macroId : "";
  // Commit is opt-IN. A caller that forgets the flag previews; one that
  // forgets it the other way round would message everybody.
  const commit = payload.commit === true;

  if (ids.length === 0) {
    return NextResponse.json({ error: "ids are required" }, { status: 400 });
  }
  if (!macroId) {
    return NextResponse.json({ error: "macroId is required" }, { status: 400 });
  }

  const [macro, tickets] = await Promise.all([
    prisma.macro.findFirst({
      where: { id: macroId, organizationId: principal.organization.id, isActive: true },
    }),
    // Tenant-scoped: ids that are not ours simply are not here.
    prisma.ticket.findMany({
      where: { id: { in: ids }, organizationId: principal.organization.id },
      select: {
        id: true,
        number: true,
        channel: true,
        language: true,
        contact: { select: { name: true } },
        conversation: { select: { language: true } },
      },
    }),
  ]);
  if (!macro) return NextResponse.json({ error: "Macro not found" }, { status: 404 });
  if (tickets.length === 0) {
    return NextResponse.json({ error: "No tickets found" }, { status: 404 });
  }

  const bodies = parseBodies(macro.bodies);
  const prepared: Prepared[] = [];
  const undeliverable: Array<{ number: number; reason: string }> = [];

  for (const t of tickets) {
    // No conversation means no channel identity to reply on — a walk-in or a
    // call somebody logged. Named here rather than dropped.
    if (!t.conversation) {
      undeliverable.push({ number: t.number, reason: "no_conversation" });
      continue;
    }
    const language = t.conversation.language || t.language;
    const rendered = renderMacro(
      bodies,
      language,
      {
        customerName: t.contact?.name ?? null,
        ticketNumber: t.number,
        agentName: principal.user.name,
        organizationName: principal.organization.name,
      },
      principal.organization.defaultLanguage,
    );
    if (!rendered) {
      undeliverable.push({ number: t.number, reason: "macro_has_no_body" });
      continue;
    }
    prepared.push({
      ticketId: t.id,
      number: t.number,
      language: rendered.language,
      requested: language,
      fellBack: rendered.fellBack,
      text: rendered.text,
    });
  }

  if (!commit) {
    // Grouped by the language actually used, with one real sample each. A
    // count alone would not let an agent notice that half the batch is about
    // to receive a language nobody proof-read.
    const groups = new Map<
      string,
      { count: number; fellBack: number; fallbackFrom: Set<string>; sample: string }
    >();
    for (const p of prepared) {
      const g =
        groups.get(p.language) ??
        { count: 0, fellBack: 0, fallbackFrom: new Set<string>(), sample: p.text };
      g.count += 1;
      // A fallback is reported by the language the customer WROTE IN, not the
      // one they are about to receive. The first version named the group's own
      // language — "1 of them have no English text" about the person being
      // GIVEN English — which is both false and useless, because the thing an
      // agent would act on is "write a Somali body".
      if (p.fellBack) {
        g.fellBack += 1;
        g.fallbackFrom.add(p.requested);
      }
      groups.set(p.language, g);
    }
    return NextResponse.json(
      {
        preview: [...groups.entries()].map(([language, g]) => ({
          language,
          count: g.count,
          fellBack: g.fellBack,
          fallbackFrom: [...g.fallbackFrom],
          sample: g.sample,
        })),
        total: prepared.length,
        undeliverable,
        setStatus: macro.setStatus,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // ---- Commit.
  const failed: Array<{ number: number; reason: string }> = [];
  let sent = 0;

  // Sequential, not Promise.all: each send hits a third-party channel API,
  // and forty simultaneous requests is how a rate limit turns a partial
  // success into an unpredictable one. Slower and reportable beats faster
  // and ambiguous.
  for (const p of prepared) {
    const result = await sendAgentReply({
      db: prisma,
      organizationId: principal.organization.id,
      ticketId: p.ticketId,
      body: p.text,
      authorUserId: principal.user.id,
    });
    if (result.ok) {
      sent += 1;
      if (macro.setStatus) {
        // Applied per ticket AFTER its own delivery, so a ticket that failed
        // to send is not marked resolved.
        await prisma.ticket.update({
          where: { id: p.ticketId },
          data: {
            status: macro.setStatus,
            ...(macro.setStatus === "RESOLVED" ? { resolvedAt: new Date() } : {}),
          },
        });
      }
    } else {
      failed.push({ number: p.number, reason: result.reason });
    }
  }

  void recordMacroUse(prisma, principal.organization.id, macro.id).catch(() => {});
  await prisma.auditLog.create({
    data: {
      organizationId: principal.organization.id,
      actorUserId: principal.user.id,
      action: "ticket.bulk_macro",
      entityType: "macro",
      entityId: String(macro.id),
      // The scope of a bulk send is exactly what an audit needs later.
      metadata: { attempted: prepared.length, sent, failed: failed.length },
    },
  });

  return NextResponse.json({
    sent,
    // Both lists travel back. "37 of 40 sent" with the three named is the
    // only report an agent can act on.
    failed,
    undeliverable,
  });
}
