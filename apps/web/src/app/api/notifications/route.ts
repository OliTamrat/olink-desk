// What this person needs to be told about.
//
// Addressed notifications (an alarm on a ticket they own) plus workspace-wide
// ones (`userId` null — a ticket nobody owns is everyone's problem). An agent
// must not see an alarm addressed to a colleague: that is the difference
// between a queue and a group chat.
import { prisma, UserRole } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../lib/session";

export const dynamic = "force-dynamic";

const READERS: UserRole[] = [
  UserRole.AGENT,
  UserRole.SUPERVISOR,
  UserRole.ADMIN,
  UserRole.AUDITOR,
];

// Supervisors and admins run the desk, so they see every alarm in it. An
// agent sees their own plus the unowned ones.
function scopeFor(principal: { user: { id: string; role: UserRole } }) {
  const supervises =
    principal.user.role === UserRole.SUPERVISOR ||
    principal.user.role === UserRole.ADMIN ||
    principal.user.role === UserRole.AUDITOR;
  return supervises ? {} : { OR: [{ userId: principal.user.id }, { userId: null }] };
}

export async function GET(request: NextRequest) {
  const principal = await requireUser(request, READERS);
  if (isDenied(principal)) return principal;

  const where = {
    organizationId: principal.organization.id,
    ...scopeFor(principal),
  };

  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        kind: true,
        readAt: true,
        createdAt: true,
        ticket: { select: { id: true, number: true, subject: true } },
      },
    }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
  ]);

  return NextResponse.json(
    {
      notifications: rows.map((n) => ({
        id: n.id,
        kind: n.kind,
        read: n.readAt !== null,
        createdAt: n.createdAt,
        ticketId: n.ticket.id,
        ticketNumber: n.ticket.number,
        subject: n.ticket.subject,
      })),
      unread,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Mark as read — one, or everything in view. */
export async function POST(request: NextRequest) {
  const principal = await requireUser(request, READERS);
  if (isDenied(principal)) return principal;

  let id: string | null = null;
  try {
    const payload = (await request.json()) as { id?: unknown };
    if (typeof payload.id === "string") id = payload.id;
  } catch {
    // An empty body means "all" — a bare "mark everything read" button should
    // not have to send JSON to say nothing.
  }

  // Scoped by BOTH the session's organization and the caller's visibility, so
  // an agent cannot clear an alarm they were never allowed to see by naming
  // its id.
  const where = {
    organizationId: principal.organization.id,
    ...scopeFor(principal),
    readAt: null,
    ...(id ? { id } : {}),
  };

  const { count } = await prisma.notification.updateMany({
    where,
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true, marked: count });
}
