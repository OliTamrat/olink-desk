// Public, minimal org identity for the widget header: name and default
// language only. Nothing else about the tenant is exposed here.
import { prisma } from "@olink-desk/database";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { org: string } },
) {
  const organization = await prisma.organization.findUnique({
    where: { slug: params.org },
    select: { name: true, defaultLanguage: true },
  });
  if (!organization) {
    return NextResponse.json({ error: "Unknown organization" }, { status: 404 });
  }
  return NextResponse.json(organization, {
    headers: { "Cache-Control": "no-store" },
  });
}
