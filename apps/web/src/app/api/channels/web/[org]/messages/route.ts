// The widget's poll: the conversation so far, agent replies included.
import { listWebMessages } from "@olink-desk/channels";
import { prisma } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { org: string } },
) {
  const result = await listWebMessages({
    db: prisma,
    orgSlug: params.org,
    sessionId: request.nextUrl.searchParams.get("sessionId"),
  });
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
