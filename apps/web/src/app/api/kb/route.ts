// The knowledge base: articles staff write once so customers do not have to
// wait for a person.
//
// Public search lives in the widget's own route. This one is the staff side —
// writing, publishing and seeing which articles actually deflect.
import { prisma, UserRole } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../lib/session";

export const dynamic = "force-dynamic";

const WRITERS: UserRole[] = [UserRole.ADMIN, UserRole.SUPERVISOR];
const LANGS = ["en", "am", "om", "ti", "so", "sw"] as const;

/** Keep only recognised language keys, and only strings. */
function parseMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && (LANGS as readonly string[]).includes(k)) out[k] = v;
  }
  return out;
}

export async function GET(request: NextRequest) {
  const principal = await requireUser(request);
  if (isDenied(principal)) return principal;

  const articles = await prisma.kbArticle.findMany({
    where: { organizationId: principal.organization.id },
    orderBy: [{ deflections: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      titles: true,
      bodies: true,
      isPublished: true,
      deflections: true,
      views: true,
    },
  });
  return NextResponse.json(
    {
      articles: articles.map((a) => ({
        ...a,
        titles: parseMap(a.titles),
        bodies: parseMap(a.bodies),
      })),
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

  const titles = parseMap(payload.titles);
  const bodies = parseMap(payload.bodies);

  // An article needs a title AND a body in the SAME language, or it is
  // unfindable in that language: retrieval scores title and body together and
  // the title is what a customer is offered. A title with no body would
  // promise an answer that does not exist.
  const usable = Object.keys(titles).filter((l) => titles[l]?.trim() && bodies[l]?.trim());
  if (usable.length === 0) {
    return NextResponse.json(
      { error: "An article needs a title and a body in at least one language" },
      { status: 400 },
    );
  }

  const article = await prisma.kbArticle.create({
    data: {
      organizationId: principal.organization.id,
      titles: titles as object,
      bodies: bodies as object,
      isPublished: payload.isPublished === true,
      createdById: principal.user.id,
    },
    select: { id: true },
  });
  await prisma.auditLog.create({
    data: {
      organizationId: principal.organization.id,
      actorUserId: principal.user.id,
      action: "kb.created",
      entityType: "kb_article",
      entityId: String(article.id),
      metadata: { languages: usable },
    },
  });
  return NextResponse.json({ article });
}

export async function PATCH(request: NextRequest) {
  const principal = await requireUser(request, WRITERS);
  if (isDenied(principal)) return principal;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof payload.id === "string" ? payload.id : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Scoped to the session's organization before any write.
  const existing = await prisma.kbArticle.findFirst({
    where: { id, organizationId: principal.organization.id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (payload.titles !== undefined) data.titles = parseMap(payload.titles) as object;
  if (payload.bodies !== undefined) data.bodies = parseMap(payload.bodies) as object;
  if (typeof payload.isPublished === "boolean") data.isPublished = payload.isPublished;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }

  await prisma.kbArticle.update({ where: { id: existing.id }, data });
  await prisma.auditLog.create({
    data: {
      organizationId: principal.organization.id,
      actorUserId: principal.user.id,
      action: "kb.updated",
      entityType: "kb_article",
      entityId: String(existing.id),
      metadata: { changed: Object.keys(data) },
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const principal = await requireUser(request, WRITERS);
  if (isDenied(principal)) return principal;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { count } = await prisma.kbArticle.deleteMany({
    where: { id, organizationId: principal.organization.id },
  });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
