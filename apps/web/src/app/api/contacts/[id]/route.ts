// One customer, with their history.
//
// The history is the reason the directory exists. A name and a number is a
// list; "this person has called four times this month, twice about the same
// thing" is what lets an agent open with something other than "how can I
// help".
import { prisma, TicketStatus, UserRole } from "@olink-desk/database";
import { cleanContact, displayPhone } from "@olink-desk/tickets";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../../lib/session";

export const dynamic = "force-dynamic";

const WRITERS: UserRole[] = [UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN];
const RECENT_TICKETS = 25;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const principal = await requireUser(request);
  if (isDenied(principal)) return principal;

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, organizationId: principal.organization.id },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      language: true,
      notes: true,
      createdAt: true,
      tickets: {
        orderBy: { createdAt: "desc" },
        take: RECENT_TICKETS,
        select: {
          id: true,
          number: true,
          subject: true,
          status: true,
          priority: true,
          channel: true,
          createdAt: true,
        },
      },
    },
  });
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Which channels this person has actually WRITTEN IN on — not which
  // contact details are on file. They are different questions, and only this
  // one answers "can the desk message them": a customer who exists solely
  // because staff logged calls has a phone number and no way to be reached.
  const conversations = await prisma.conversation.findMany({
    where: { organizationId: principal.organization.id, contactId: contact.id },
    select: { channel: true },
    distinct: ["channel"],
  });

  // Counted rather than derived from the 25 most recent tickets above: a
  // customer with 40 tickets would otherwise report a total of 25, which is
  // the kind of number that is wrong quietly and forever.
  const [openCount, totalCount] = await Promise.all([
    prisma.ticket.count({
      where: {
        organizationId: principal.organization.id,
        contactId: contact.id,
        status: { in: [TicketStatus.NEW, TicketStatus.OPEN, TicketStatus.PENDING] },
      },
    }),
    prisma.ticket.count({
      where: { organizationId: principal.organization.id, contactId: contact.id },
    }),
  ]);

  return NextResponse.json(
    {
      contact: {
        ...contact,
        phoneDisplay: displayPhone(contact.phone),
        openCount,
        totalCount,
        channels: conversations.map((c) => c.channel),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const principal = await requireUser(request, WRITERS);
  if (isDenied(principal)) return principal;

  const existing = await prisma.contact.findFirst({
    where: { id: params.id, organizationId: principal.organization.id },
    select: { id: true, phone: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Re-validated through the same function that guards creation, so an edit
  // cannot put a number into the table that a create would have refused.
  const clean = cleanContact(
    { ...payload, phone: (payload.phone as string) ?? existing.phone },
    principal.organization.defaultLanguage,
  );
  if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });

  // Changing a number onto one that already belongs to somebody else would
  // merge two people. Refuse and say so, rather than 500 on the constraint.
  if (clean.value.phone !== existing.phone) {
    const clash = await prisma.contact.findFirst({
      where: { organizationId: principal.organization.id, phone: clean.value.phone },
      select: { id: true },
    });
    if (clash && clash.id !== existing.id) {
      return NextResponse.json(
        { error: "Another customer already has that phone number" },
        { status: 409 },
      );
    }
  }

  const contact = await prisma.contact.update({
    where: { id: existing.id },
    data: clean.value,
  });
  await prisma.auditLog.create({
    data: {
      organizationId: principal.organization.id,
      actorUserId: principal.user.id,
      action: "contact.updated",
      entityType: "contact",
      entityId: String(contact.id),
      // No personal data in the log — which fields changed, never the values.
      metadata: { phoneChanged: clean.value.phone !== existing.phone },
    },
  });

  return NextResponse.json({
    contact: { ...contact, phoneDisplay: displayPhone(contact.phone) },
  });
}
