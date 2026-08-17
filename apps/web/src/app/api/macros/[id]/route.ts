// Edit or retire one macro. Retiring (isActive=false) rather than deleting is
// the default the console offers: a macro that has been sent to four hundred
// customers is part of the record of what this desk told people.
import { prisma, UserRole, TicketStatus } from "@olink-desk/database";
import { cleanActions, macroBodiesError, parseBodies } from "@olink-desk/macros";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../../lib/session";

export const dynamic = "force-dynamic";

const WRITERS: UserRole[] = [UserRole.ADMIN, UserRole.SUPERVISOR];
const SETTABLE_STATUS: TicketStatus[] = [
  TicketStatus.OPEN,
  TicketStatus.PENDING,
  TicketStatus.RESOLVED,
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const principal = await requireUser(request, WRITERS);
  if (isDenied(principal)) return principal;

  // Scoped to the session's organization before anything is written — the URL
  // names an id, never a tenant.
  const existing = await prisma.macro.findFirst({
    where: { id: params.id, organizationId: principal.organization.id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof payload.title === "string" && payload.title.trim()) {
    data.title = payload.title.trim().slice(0, 120);
  }
  if (typeof payload.category === "string") {
    data.category = payload.category.trim() ? payload.category.trim().slice(0, 60) : null;
  }
  if (payload.bodies !== undefined) {
    const bodies = parseBodies(payload.bodies);
    const bodiesError = macroBodiesError(bodies);
    if (bodiesError) return NextResponse.json({ error: bodiesError }, { status: 400 });
    data.bodies = bodies as object;
  }
  // The three actions are cleaned together by the shared validator, but each
  // is only WRITTEN when the caller mentioned it — a PATCH that says nothing
  // about tags must not silently clear them.
  const actions = cleanActions(payload);
  if (payload.setStatus !== undefined) data.setStatus = actions.setStatus;
  if (payload.setPriority !== undefined) data.setPriority = actions.setPriority;
  if (payload.addTags !== undefined) data.addTags = actions.addTags;
  if (typeof payload.isActive === "boolean") data.isActive = payload.isActive;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }

  try {
    const macro = await prisma.macro.update({ where: { id: existing.id }, data });
    await prisma.auditLog.create({
      data: {
        organizationId: principal.organization.id,
        actorUserId: principal.user.id,
        action: "macro.updated",
        entityType: "macro",
        entityId: String(macro.id),
        metadata: { changed: Object.keys(data) },
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "A macro with that title already exists" },
      { status: 409 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const principal = await requireUser(request, WRITERS);
  if (isDenied(principal)) return principal;

  const deleted = await prisma.macro.deleteMany({
    where: { id: params.id, organizationId: principal.organization.id },
  });
  if (deleted.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.auditLog.create({
    data: {
      organizationId: principal.organization.id,
      actorUserId: principal.user.id,
      action: "macro.deleted",
      entityType: "macro",
      entityId: String(params.id),
      metadata: {},
    },
  });
  return NextResponse.json({ ok: true });
}
