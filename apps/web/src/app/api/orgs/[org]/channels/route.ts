// The channel catalogue for one tenant, with live/available state folded in.
import { catalogue, telegramConnected } from "@olink-desk/channels";
import { prisma } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { requireAdminSecret } from "../../../../../lib/admin-guard";

export const dynamic = "force-dynamic";

export async function GET(
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
  const channels = catalogue({
    webConnected: true,
    telegramConnected: await telegramConnected(prisma, organization.id),
  });
  return NextResponse.json({ channels });
}
