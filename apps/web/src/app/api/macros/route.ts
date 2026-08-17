// The workspace's saved replies. Every agent reads them (a macro they cannot
// see is a macro they cannot use); only ADMIN and SUPERVISOR write them,
// because a macro is prose sent verbatim to customers under the
// organization's name — the same reasoning that puts Bank Assist's curated
// answers behind a review step rather than in every agent's hands.
import { prisma, UserRole, TicketStatus } from "@olink-desk/database";
import {
  cleanActions,
  ensureStarterMacros,
  macroBodiesError,
  parseBodies,
} from "@olink-desk/macros";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../lib/session";

export const dynamic = "force-dynamic";

const WRITERS: UserRole[] = [UserRole.ADMIN, UserRole.SUPERVISOR];
const READERS: UserRole[] = [
  UserRole.AGENT,
  UserRole.SUPERVISOR,
  UserRole.ADMIN,
  UserRole.AUDITOR,
];

const SETTABLE_STATUS: TicketStatus[] = [
  TicketStatus.OPEN,
  TicketStatus.PENDING,
  TicketStatus.RESOLVED,
];

export async function GET(request: NextRequest) {
  const principal = await requireUser(request, READERS);
  if (isDenied(principal)) return principal;

  await ensureStarterMacros(prisma, principal.organization.id);
  const macros = await prisma.macro.findMany({
    where: { organizationId: principal.organization.id },
    orderBy: [{ isActive: "desc" }, { usageCount: "desc" }, { title: "asc" }],
  });
  return NextResponse.json(
    {
      macros: macros.map((m) => ({
        id: m.id,
        title: m.title,
        category: m.category,
        bodies: parseBodies(m.bodies),
        setStatus: m.setStatus,
        setPriority: m.setPriority,
        addTags: m.addTags,
        isActive: m.isActive,
        usageCount: m.usageCount,
      })),
      defaultLanguage: principal.organization.defaultLanguage,
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

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  if (!title) return NextResponse.json({ error: "A title is required" }, { status: 400 });
  if (title.length > 120) {
    return NextResponse.json({ error: "That title is too long" }, { status: 400 });
  }

  const bodies = parseBodies(payload.bodies);
  const bodiesError = macroBodiesError(bodies);
  if (bodiesError) return NextResponse.json({ error: bodiesError }, { status: 400 });

  // One validator for all three, shared with PATCH and unit-tested — the
  // status check used to live here as an inline `includes`, which is fine for
  // one field and becomes three chances to disagree for three.
  const actions = cleanActions(payload);
  const category =
    typeof payload.category === "string" && payload.category.trim()
      ? payload.category.trim().slice(0, 60)
      : null;

  try {
    const macro = await prisma.macro.create({
      data: {
        organizationId: principal.organization.id,
        title,
        category,
        bodies: bodies as object,
        setStatus: actions.setStatus,
        setPriority: actions.setPriority,
        addTags: actions.addTags,
        createdById: principal.user.id,
      },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: principal.organization.id,
        actorUserId: principal.user.id,
        action: "macro.created",
        entityType: "macro",
        entityId: String(macro.id),
        // Languages, not bodies: the audit trail says a macro was written and
        // in which languages, and the macro row itself holds the words.
        metadata: { languages: Object.keys(bodies) },
      },
    });
    return NextResponse.json({ macro: { id: macro.id, title: macro.title } });
  } catch {
    return NextResponse.json(
      { error: "A macro with that title already exists" },
      { status: 409 },
    );
  }
}
