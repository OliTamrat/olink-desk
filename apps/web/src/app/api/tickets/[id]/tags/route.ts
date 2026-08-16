// Put a tag on a ticket, or take one off.
//
// POST takes a NAME rather than an id, so an agent can label a ticket with
// something that does not exist yet without a two-step dance. The tag is
// found-or-created on its normalised slug, which is what stops that
// convenience turning into four spellings of "refund".
import { prisma, tagError, tagSlug, tagDisplayName, UserRole } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

const TAGGERS: UserRole[] = [UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN];

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const principal = await requireUser(request, TAGGERS);
  if (isDenied(principal)) return principal;

  // Tenant-scoped before anything is written: the URL names an id, never a
  // tenant.
  const ticket = await prisma.ticket.findFirst({
    where: { id: params.id, organizationId: principal.organization.id },
    select: { id: true },
  });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let name = "";
  try {
    const payload = (await request.json()) as { name?: unknown };
    if (typeof payload.name === "string") name = payload.name;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const problem = tagError(name);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const slug = tagSlug(name);
  const tag = await prisma.tag.upsert({
    where: { organizationId_slug: { organizationId: principal.organization.id, slug } },
    update: {},
    create: {
      organizationId: principal.organization.id,
      name: tagDisplayName(name),
      slug,
    },
    select: { id: true, name: true, slug: true },
  });

  // Idempotent: tagging a ticket twice with the same label is a no-op rather
  // than an error, because from the agent's side the ticket is tagged either
  // way and an error would just be noise.
  await prisma.ticketTag.createMany({
    data: [
      {
        organizationId: principal.organization.id,
        ticketId: ticket.id,
        tagId: tag.id,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.auditLog.create({
    data: {
      organizationId: principal.organization.id,
      actorUserId: principal.user.id,
      action: "ticket.tagged",
      entityType: "ticket",
      entityId: String(ticket.id),
      metadata: { tag: tag.slug },
    },
  });
  return NextResponse.json({ tag });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const principal = await requireUser(request, TAGGERS);
  if (isDenied(principal)) return principal;

  const tagId = request.nextUrl.searchParams.get("tagId");
  if (!tagId) return NextResponse.json({ error: "tagId is required" }, { status: 400 });

  // deleteMany scoped by organizationId AND ticketId: a tag id from another
  // tenant cannot detach anything here, and no row is touched by naming an
  // id alone.
  const { count } = await prisma.ticketTag.deleteMany({
    where: {
      organizationId: principal.organization.id,
      ticketId: params.id,
      tagId,
    },
  });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.auditLog.create({
    data: {
      organizationId: principal.organization.id,
      actorUserId: principal.user.id,
      action: "ticket.untagged",
      entityType: "ticket",
      entityId: String(params.id),
      metadata: {},
    },
  });
  return NextResponse.json({ ok: true });
}
