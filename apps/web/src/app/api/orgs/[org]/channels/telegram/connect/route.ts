// Connect a BotFather token for a tenant. The store-then-register order and
// the rollback on rejection live in @olink-desk/channels (connectTelegram).
import { connectTelegram } from "@olink-desk/channels";
import { prisma } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { isGuardDenied, requireOrgAdmin } from "../../../../../../../lib/org-guard";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { org: string } },
) {
  const guard = await requireOrgAdmin(request, params.org);
  if (isGuardDenied(guard)) return guard;
  const { organization } = guard;

  let botToken: unknown;
  try {
    ({ botToken } = (await request.json()) as { botToken?: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof botToken !== "string" || botToken.trim().length < 10) {
    return NextResponse.json({ error: "botToken is required" }, { status: 400 });
  }

  const appBaseUrl = process.env.APP_BASE_URL;
  if (!appBaseUrl) {
    return NextResponse.json(
      { error: "APP_BASE_URL is not configured" },
      { status: 503 },
    );
  }

  try {
    const { webhookUrl } = await connectTelegram({
      db: prisma,
      organization,
      // Trimmed: a token pasted from a phone arrives wearing whitespace.
      botToken: botToken.trim(),
      appBaseUrl,
    });
    return NextResponse.json({ webhookUrl });
  } catch (err) {
    return NextResponse.json(
      { error: `Telegram rejected the token: ${String(err)}` },
      { status: 400 },
    );
  }
}
