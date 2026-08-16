// The workspace's tags, with how often each is used.
//
// The count is not decoration: it is the answer to "what are people
// contacting us about", which nothing in the product could answer before. It
// is also what makes a tag list prunable — a tag used once, two months ago,
// is a typo somebody never noticed.
import { prisma, tagError, tagSlug, tagDisplayName, UserRole } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../lib/session";

export const dynamic = "force-dynamic";

// Every agent may create a tag. A support desk labels new kinds of problem
// as they appear, and routing that through an admin means the labelling
// simply does not happen — which costs more than a few stray tags. The slug
// normalisation is what keeps that affordable.
const TAGGERS: UserRole[] = [UserRole.AGENT, UserRole.SUPERVISOR, UserRole.ADMIN];

export async function GET(request: NextRequest) {
  const principal = await requireUser(request);
  if (isDenied(principal)) return principal;

  const tags = await prisma.tag.findMany({
    where: { organizationId: principal.organization.id },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      _count: { select: { tickets: true } },
    },
  });
  return NextResponse.json(
    {
      tags: tags.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        ticketCount: t._count.tickets,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const principal = await requireUser(request, TAGGERS);
  if (isDenied(principal)) return principal;

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
  // Find-or-create on the SLUG, so typing "Refund" when "refund" exists
  // returns the existing tag rather than failing with a conflict the agent
  // cannot act on. That is the behaviour that keeps a tag list clean without
  // making anybody think about it.
  const existing = await prisma.tag.findUnique({
    where: { organizationId_slug: { organizationId: principal.organization.id, slug } },
    select: { id: true, name: true, slug: true },
  });
  if (existing) return NextResponse.json({ tag: existing, created: false });

  try {
    const tag = await prisma.tag.create({
      data: {
        organizationId: principal.organization.id,
        name: tagDisplayName(name),
        slug,
      },
      select: { id: true, name: true, slug: true },
    });
    return NextResponse.json({ tag, created: true });
  } catch {
    // Lost a race with a concurrent create of the same slug — which is a
    // success from the caller's point of view, so return the winner.
    const winner = await prisma.tag.findUnique({
      where: { organizationId_slug: { organizationId: principal.organization.id, slug } },
      select: { id: true, name: true, slug: true },
    });
    if (winner) return NextResponse.json({ tag: winner, created: false });
    return NextResponse.json({ error: "Could not create that tag" }, { status: 500 });
  }
}
