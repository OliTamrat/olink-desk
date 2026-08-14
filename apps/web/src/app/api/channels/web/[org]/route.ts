// Web channel inbound: the widget / hosted form POSTs a message; replies
// (greeting, ticket-opened ack) come back in the same response.
import { handleWebMessage } from "@olink-desk/channels";
import { prisma } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { org: string } },
) {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const result = await handleWebMessage({
    db: prisma,
    orgSlug: params.org,
    sessionId: payload.sessionId,
    text: payload.message,
    language: payload.language,
    clientMessageId: payload.clientMessageId,
  });
  return NextResponse.json(result.body, { status: result.status });
}
