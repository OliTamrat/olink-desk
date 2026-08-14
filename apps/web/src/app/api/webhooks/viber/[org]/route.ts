// Viber inbound webhook. The RAW body is handed through untouched — the
// signature covers the exact bytes Viber sent.
import { handleViberWebhook } from "@olink-desk/channels";
import { prisma } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { org: string } },
) {
  const rawBody = await request.text();
  const result = await handleViberWebhook({
    db: prisma,
    orgSlug: params.org,
    rawBody,
    signatureHeader: request.headers.get("x-viber-content-signature"),
  });
  return NextResponse.json(result.body, { status: result.status });
}
