// Connect a Viber bot token. Store-then-register with rollback lives in
// @olink-desk/channels (connectViber).
import { connectViber } from "@olink-desk/channels";
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

  let authToken: unknown;
  try {
    ({ authToken } = (await request.json()) as { authToken?: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof authToken !== "string" || authToken.length < 10) {
    return NextResponse.json({ error: "authToken is required" }, { status: 400 });
  }

  const appBaseUrl = process.env.APP_BASE_URL;
  if (!appBaseUrl) {
    return NextResponse.json(
      { error: "APP_BASE_URL is not configured" },
      { status: 503 },
    );
  }

  try {
    const { webhookUrl } = await connectViber({
      db: prisma,
      organization,
      authToken,
      appBaseUrl,
    });
    return NextResponse.json({ webhookUrl });
  } catch (err) {
    return NextResponse.json(
      { error: `Viber rejected the token: ${String(err)}` },
      { status: 400 },
    );
  }
}
