// Customers — the people behind the tickets.
//
// Until this route existed, no `Contact` row was ever written by anything in
// the product. The table was in the first migration, `Ticket.contactId` was in
// every query, and the inbox has a Requester column — which said "Customer"
// for every ticket ever received, because a widget session id and a Telegram
// chat id are channel identities, not people.
import { prisma, UserRole } from "@olink-desk/database";
import { cleanContact, displayPhone, findOrCreateContact, normalizePhone } from "@olink-desk/tickets";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../lib/session";

export const dynamic = "force-dynamic";

// An agent takes calls, so an agent records who called. Auditors read only.
const WRITERS: UserRole[] = [UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN];

const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  const principal = await requireUser(request);
  if (isDenied(principal)) return principal;

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();

  // Searching by phone has to survive however the agent types it. Somebody
  // looking for "0911 234 567" must find the row stored as +251911234567, or
  // they will conclude the customer is not on file and create them twice —
  // which is the exact failure the normalisation exists to prevent.
  const normalised = q ? normalizePhone(q) : null;

  const where = q
    ? {
        organizationId: principal.organization.id,
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: normalised ?? q.replace(/\D/g, "") } },
        ],
      }
    : { organizationId: principal.organization.id };

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        language: true,
        createdAt: true,
        _count: { select: { tickets: true } },
      },
    }),
    prisma.contact.count({ where }),
  ]);

  return NextResponse.json(
    {
      contacts: contacts.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        phoneDisplay: displayPhone(c.phone),
        email: c.email,
        language: c.language,
        createdAt: c.createdAt,
        ticketCount: c._count.tickets,
      })),
      total,
      truncated: total > contacts.length,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const principal = await requireUser(request, WRITERS);
  if (isDenied(principal)) return principal;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const clean = cleanContact(payload, principal.organization.defaultLanguage);
  if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });

  // Find-or-create, never create-and-hope: two agents taking calls from the
  // same customer must land on one record. `created: false` is reported back
  // so the console can say "you already know this person" rather than
  // pretending it made something new.
  const { contact, created } = await findOrCreateContact(
    prisma,
    principal.organization.id,
    clean.value,
  );

  if (created) {
    // The event, never the personal data: no name, no number in the log.
    await prisma.auditLog.create({
      data: {
        organizationId: principal.organization.id,
        actorUserId: principal.user.id,
        action: "contact.created",
        entityType: "contact",
        entityId: String(contact.id),
        metadata: { language: contact.language },
      },
    });
  }

  return NextResponse.json({
    contact: {
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      phoneDisplay: displayPhone(contact.phone),
      email: contact.email,
      language: contact.language,
    },
    created,
  });
}
