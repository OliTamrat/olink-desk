// Data portability, for one person, on request.
//
// The other half of the same right as erasure, and it is asked for first:
// before somebody asks you to forget them they ask what you hold. This
// returns everything the desk knows about one customer as a single JSON
// document — their record, every ticket, every message on it, and every file
// by name — so an administrator can hand it over.
//
// JSON rather than CSV, because the answer is nested. A ticket has messages;
// flattening that into rows either repeats the ticket on every line or loses
// the association. The audit export is CSV because an audit log genuinely is
// a table.
import { prisma, UserRole } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

/**
 * Admin and Supervisor. Not Agent: a subject-access response is a document
 * the organisation signs its name to, and it contains the internal notes
 * staff wrote about the customer — which the customer is entitled to see,
 * and which the agent who wrote them should not be the one to release.
 */
const EXPORTERS: UserRole[] = [UserRole.ADMIN, UserRole.SUPERVISOR];

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const principal = await requireUser(request, EXPORTERS);
  if (isDenied(principal)) return principal;
  const organizationId = principal.organization.id;

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, organizationId },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      telegramId: true,
      language: true,
      smsConsent: true,
      notes: true,
      erasedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tickets = await prisma.ticket.findMany({
    where: { organizationId, contactId: contact.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      number: true,
      subject: true,
      category: true,
      channel: true,
      language: true,
      status: true,
      priority: true,
      createdAt: true,
      firstRespondedAt: true,
      resolvedAt: true,
      closedAt: true,
      csatScore: true,
      csatComment: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          direction: true,
          channel: true,
          body: true,
          redactedAt: true,
          createdAt: true,
        },
      },
      attachments: {
        orderBy: { createdAt: "asc" },
        // `data` is deliberately absent. A subject-access response that
        // inlines every file base64-encoded is a download nobody can open;
        // the files are listed by name and size and handed over separately.
        select: {
          id: true,
          filename: true,
          contentType: true,
          byteSize: true,
          kind: true,
          durationSeconds: true,
          redactedAt: true,
          createdAt: true,
        },
      },
    },
  });

  const calls = await prisma.callLog.findMany({
    where: { organizationId, contactId: contact.id },
    orderBy: { createdAt: "asc" },
  });

  const conversations = await prisma.conversation.findMany({
    where: { organizationId, contactId: contact.id },
    select: {
      channel: true,
      externalUserId: true,
      language: true,
      createdAt: true,
    },
  });

  // The staff who handled the tickets are NOT in this document. The subject's
  // right is to their own data; an agent's name is that agent's, and a desk
  // that hands it out on request is one bad-faith request away from a list of
  // who to go after.
  const body = {
    exportedAt: new Date(),
    organization: { id: organizationId, name: principal.organization.name },
    contact,
    conversations,
    tickets,
    calls,
  };

  await prisma.auditLog.create({
    data: {
      organizationId,
      actorUserId: principal.user.id,
      action: "contact.export",
      entityType: "Contact",
      entityId: String(contact.id),
      metadata: { tickets: tickets.length, calls: calls.length },
    },
  });

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="contact-${contact.id}.json"`,
    },
  });
}
