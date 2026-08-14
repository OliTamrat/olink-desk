// Connect a BotFather token for a tenant. The store-then-register order and
// the rollback on rejection live in @olink-desk/channels (connectTelegram).
import { connectTelegram } from "@olink-desk/channels";
import { prisma } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { requireAdminSecret } from "../../../../../../../lib/admin-guard";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { org: string } },
) {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  const organization = await prisma.organization.findUnique({
    where: { slug: params.org },
  });
  if (!organization) {
    return NextResponse.json({ error: "Unknown organization" }, { status: 404 });
  }

  let botToken: unknown;
  try {
    ({ botToken } = (await request.json()) as { botToken?: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof botToken !== "string" || botToken.length < 10) {
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
      botToken,
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
