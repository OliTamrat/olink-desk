// Public article search — the deflection path.
//
// Unauthenticated by design: the customer asking is not signed in to anything.
// That makes this the second public surface in the product, so what it can
// return is deliberately narrow:
//
//   - PUBLISHED articles only. A draft is staff thinking out loud.
//   - Of ONE organization, named in the path, exactly like the widget's own
//     message route.
//   - In the customer's language only. Retrieval never crosses languages, so
//     there is no path by which an English article reaches a Tigrinya
//     customer.
//   - Title and body of matching articles, nothing else — no counts, no
//     authorship, no draft neighbours.
//
// It returns `[]` rather than a weak guess, and the widget treats that as
// "open a ticket". Deflecting the wrong customer to the wrong article is
// worse than not deflecting at all.
import { prisma } from "@olink-desk/database";
import { retrieve, type Doc } from "@olink-desk/retrieval";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const MAX_QUERY = 500;

export async function POST(
  request: NextRequest,
  { params }: { params: { org: string } },
) {
  const organization = await prisma.organization.findUnique({
    where: { slug: params.org },
    select: { id: true, defaultLanguage: true },
  });
  if (!organization) {
    return NextResponse.json({ error: "Unknown organization" }, { status: 404 });
  }

  let text = "";
  let language = organization.defaultLanguage;
  try {
    const payload = (await request.json()) as { text?: unknown; language?: unknown };
    if (typeof payload.text === "string") text = payload.text.slice(0, MAX_QUERY);
    if (typeof payload.language === "string") language = payload.language;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!text.trim()) return NextResponse.json({ articles: [] });

  const rows = await prisma.kbArticle.findMany({
    where: { organizationId: organization.id, isPublished: true },
    select: { id: true, titles: true, bodies: true },
  });

  // One Doc per (article, language) so retrieval's language filter is exact
  // rather than approximate.
  const docs: Doc[] = [];
  for (const row of rows) {
    const titles = (row.titles ?? {}) as Record<string, string>;
    const bodies = (row.bodies ?? {}) as Record<string, string>;
    for (const lang of Object.keys(titles)) {
      const title = titles[lang];
      const body = bodies[lang];
      if (typeof title === "string" && typeof body === "string" && title.trim() && body.trim()) {
        docs.push({ id: `${row.id}::${lang}`, title, body, language: lang });
      }
    }
  }

  const hits = retrieve(text, docs, { language, limit: 3 });

  // Viewing is counted here; DEFLECTION is counted only when the customer
  // says the article answered them (see ./helpful). Counting a view as a
  // deflection would make the one number that justifies writing articles
  // measure whether the search box was used.
  if (hits.length > 0) {
    const ids = [...new Set(hits.map((h) => h.id.split("::")[0]))];
    await prisma.kbArticle.updateMany({
      where: { id: { in: ids }, organizationId: organization.id },
      data: { views: { increment: 1 } },
    });
  }

  return NextResponse.json(
    {
      articles: hits.map((h) => ({
        id: h.id.split("::")[0],
        title: h.title,
        body: h.body,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
