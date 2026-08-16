// "That answered my question."
//
// The ONLY thing that increments `deflections`. A view is not a deflection:
// counting one would make the single number that justifies writing articles
// measure whether the search box was used, and every article would look
// successful the moment it was written.
//
// Public, like the search it follows — the customer saying it is not signed
// in. It can only ever increment a counter on a published article of the
// named organization, so the worst a bad actor achieves is flattering one
// tenant's own statistics.
import { prisma } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { org: string } },
) {
  const organization = await prisma.organization.findUnique({
    where: { slug: params.org },
    select: { id: true },
  });
  if (!organization) {
    return NextResponse.json({ error: "Unknown organization" }, { status: 404 });
  }

  let id = "";
  try {
    const payload = (await request.json()) as { id?: unknown };
    if (typeof payload.id === "string") id = payload.id;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { count } = await prisma.kbArticle.updateMany({
    where: { id, organizationId: organization.id, isPublished: true },
    data: { deflections: { increment: 1 } },
  });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
