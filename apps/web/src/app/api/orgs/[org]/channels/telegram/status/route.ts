// Live health of the Telegram connection, asked of Telegram itself — the
// screen's answer to "the bot is silent, why?". Returns no secrets.
import { telegramStatus } from "@olink-desk/channels";
import { prisma } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { isGuardDenied, requireOrgAdmin } from "../../../../../../../lib/org-guard";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { org: string } },
) {
  const guard = await requireOrgAdmin(request, params.org);
  if (isGuardDenied(guard)) return guard;

  const appBaseUrl = process.env.APP_BASE_URL;
  if (!appBaseUrl) {
    return NextResponse.json(
      { error: "APP_BASE_URL is not configured" },
      { status: 503 },
    );
  }

  const status = await telegramStatus({
    db: prisma,
    organization: guard.organization,
    appBaseUrl,
  });
  return NextResponse.json(status, {
    headers: { "Cache-Control": "no-store" },
  });
}
