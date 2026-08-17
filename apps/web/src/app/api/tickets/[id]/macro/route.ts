// Apply a macro to a ticket.
//
// This endpoint DOES NOT SEND. It returns the rendered text for the agent's
// composer, and the agent presses send themselves. That is a deliberate line:
// a one-click button that both writes and delivers a message under the
// organization's name means the first time anyone reads the sentence is after
// the customer has. Zendesk draws it the same way, and here it also gives the
// agent the chance to see the language-fallback warning before sending.
//
// The rendering language is the TICKET's, never the agent's console language.
import { prisma, UserRole } from "@olink-desk/database";
import { parseBodies, recordMacroUse, renderMacro } from "@olink-desk/macros";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const principal = await requireUser(request, [
    UserRole.AGENT,
    UserRole.SUPERVISOR,
    UserRole.ADMIN,
  ]);
  if (isDenied(principal)) return principal;

  let macroId = "";
  try {
    const payload = (await request.json()) as { macroId?: unknown };
    if (typeof payload.macroId === "string") macroId = payload.macroId;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!macroId) {
    return NextResponse.json({ error: "macroId is required" }, { status: 400 });
  }

  // Both reads are scoped to the session's organization. A macro id from one
  // tenant and a ticket id from another must not meet.
  const [ticket, macro] = await Promise.all([
    prisma.ticket.findFirst({
      where: { id: params.id, organizationId: principal.organization.id },
      select: {
        id: true,
        number: true,
        language: true,
        contact: { select: { name: true } },
        conversation: { select: { language: true } },
      },
    }),
    prisma.macro.findFirst({
      where: {
        id: macroId,
        organizationId: principal.organization.id,
        isActive: true,
      },
    }),
  ]);
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  if (!macro) return NextResponse.json({ error: "Macro not found" }, { status: 404 });

  // The conversation's sticky language is the fresher signal — it follows the
  // customer if they switch mid-thread — with the ticket's own language as
  // the fallback for tickets that never had a conversation row (a walk-in or
  // a phone call logged by an agent).
  const language = ticket.conversation?.language || ticket.language;

  const rendered = renderMacro(
    parseBodies(macro.bodies),
    language,
    {
      customerName: ticket.contact?.name ?? null,
      ticketNumber: ticket.number,
      agentName: principal.user.name,
      organizationName: principal.organization.name,
    },
    principal.organization.defaultLanguage,
  );
  if (!rendered) {
    return NextResponse.json(
      { error: "That macro has no body to send" },
      { status: 409 },
    );
  }

  // Fire-and-forget: a failed counter must never cost the agent their draft.
  void recordMacroUse(prisma, principal.organization.id, macro.id).catch(() => {});

  return NextResponse.json(
    {
      text: rendered.text,
      language: rendered.language,
      fellBack: rendered.fellBack,
      requestedLanguage: language,
      // Every action the macro carries, returned together and applied by the
      // caller only once the reply is actually delivered. Splitting them —
      // status here, tags at insert — is how a ticket ends up tagged for a
      // reply nobody sent.
      setStatus: macro.setStatus,
      setPriority: macro.setPriority,
      addTags: macro.addTags,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
