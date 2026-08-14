// Meta webhook — WhatsApp, Messenger and Instagram on one callback.
// GET is the subscription handshake and must echo the challenge as BARE
// text; POST deliveries are signature-checked over the raw body.
import { handleMetaVerify, handleMetaWebhook } from "@olink-desk/channels";
import { prisma } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { org: string } },
) {
  const query = request.nextUrl.searchParams;
  const result = await handleMetaVerify({
    db: prisma,
    orgSlug: params.org,
    mode: query.get("hub.mode") ?? "",
    token: query.get("hub.verify_token") ?? "",
    challenge: query.get("hub.challenge") ?? "",
  });
  if (typeof result.body === "string") {
    return new NextResponse(result.body, {
      status: result.status,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { org: string } },
) {
  const rawBody = await request.text();
  const result = await handleMetaWebhook({
    db: prisma,
    orgSlug: params.org,
    rawBody,
    signatureHeader: request.headers.get("x-hub-signature-256"),
  });
  return NextResponse.json(result.body, { status: result.status });
}
