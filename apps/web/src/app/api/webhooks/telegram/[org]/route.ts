// Telegram inbound webhook — a thin transport shim; the whole contract lives
// in @olink-desk/channels where it is tested without a web server.
import { handleTelegramWebhook } from "@olink-desk/channels";
import { prisma } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { org: string } },
) {
  let update: unknown;
  try {
    update = await request.json();
  } catch {
    // Unparseable is not a 500 — a 5xx makes Telegram retry the same broken
    // body indefinitely.
    return NextResponse.json({ ok: true });
  }
  const result = await handleTelegramWebhook({
    db: prisma,
    orgSlug: params.org,
    secretHeader: request.headers.get("x-telegram-bot-api-secret-token"),
    update,
  });
  return NextResponse.json(result.body, { status: result.status });
}
