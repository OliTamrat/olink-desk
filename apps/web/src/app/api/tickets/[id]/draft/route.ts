// Draft a reply for the agent looking at this ticket.
//
// The draft is never sent. It lands in the composer, the agent edits it, and
// the agent presses send — which is what makes this safe to ship without the
// guardrail apparatus a customer-facing bot needs. The prompt still forbids
// inventing specifics, because a plausible wrong figure is harder to spot than
// an obvious gap.
import { draftReply, isConfigured, LlmUnavailable, vertexConfig } from "@olink-desk/ai";
import { prisma } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", am: "Amharic", om: "Afaan Oromoo",
  ti: "Tigrinya", so: "Somali", sw: "Swahili",
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const principal = await requireUser(req);
  if (isDenied(principal)) return principal;
  const orgId = principal.organization.id;

  const cfg = vertexConfig();
  if (!cfg || !isConfigured()) {
    // 501, not 500: nothing is broken, the feature is simply not turned on for
    // this deployment. The console reads this to hide the button rather than
    // offering one that always fails.
    return NextResponse.json({ error: "not_configured" }, { status: 501 });
  }

  const ticket = await prisma.ticket.findFirst({
    where: { id: params.id, organizationId: orgId },
    select: { id: true, subject: true, language: true },
  });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const payload = (await req.json().catch(() => ({}))) as { intent?: unknown };
  const intent = typeof payload.intent === "string" ? payload.intent : undefined;

  const messages = await prisma.ticketMessage.findMany({
    where: { organizationId: orgId, ticketId: ticket.id },
    orderBy: { createdAt: "asc" },
    take: 30,
    select: { direction: true, body: true },
  });
  if (messages.length === 0) {
    return NextResponse.json({ error: "nothing_to_draft_from" }, { status: 400 });
  }

  // The desk's own published articles, matched on the subject. Published only:
  // a draft article is one nobody has approved, and its words must not reach a
  // customer through a side door.
  const articles = await prisma.kbArticle.findMany({
    where: { organizationId: orgId, isPublished: true },
    select: { titles: true, bodies: true },
    take: 50,
  });
  const lang = ticket.language || "en";
  const needle = (ticket.subject ?? "").toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const refs = articles
    .map((a) => {
      const titles = a.titles as Record<string, string>;
      const bodies = a.bodies as Record<string, string>;
      const title = titles[lang] || titles.en || "";
      const body = bodies[lang] || bodies.en || "";
      const hay = `${title} ${body}`.toLowerCase();
      return { title, body, score: needle.filter((w) => hay.includes(w)).length };
    })
    .filter((a) => a.title && a.body && a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  try {
    const text = await draftReply(cfg, {
      messages: messages.map((m) => ({
        from: m.direction === "INBOUND" ? ("customer" as const) : ("agent" as const),
        body: m.body,
      })),
      language: LANGUAGE_NAMES[lang] ?? "English",
      subject: ticket.subject,
      articles: refs.map((r) => ({ title: r.title, body: r.body })),
      intent,
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId: principal.user.id,
        action: "ticket.draft_generated",
        entityType: "ticket",
        entityId: String(ticket.id),
        // The event, never the words. A draft is customer conversation.
        metadata: { model: cfg.model, articles: refs.length, hadIntent: Boolean(intent) },
      },
    });

    return NextResponse.json({ draft: text, sources: refs.map((r) => r.title) });
  } catch (e) {
    if (e instanceof LlmUnavailable) {
      // 503 and the real reason. A 403 from Vertex says the runtime service
      // account is missing a role — the agent cannot fix that, but whoever
      // reads the console error should be told what it actually is.
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    throw e;
  }
}
