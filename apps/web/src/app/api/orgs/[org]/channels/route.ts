// The channel catalogue for one tenant, with live/available state folded in.
import {
  catalogue,
  metaConnected,
  smsConnected,
  telegramConnected,
  ussdConnected,
  viberConnected,
} from "@olink-desk/channels";
import { prisma } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { isGuardDenied, requireOrgAdmin } from "../../../../../lib/org-guard";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { org: string } },
) {
  const guard = await requireOrgAdmin(request, params.org);
  if (isGuardDenied(guard)) return guard;
  const { organization } = guard;
  const [telegram, viber, meta, sms, ussd] = await Promise.all([
    telegramConnected(prisma, organization.id),
    viberConnected(prisma, organization.id),
    metaConnected(prisma, organization.id),
    smsConnected(prisma, organization.id),
    ussdConnected(prisma, organization.id),
  ]);
  const channels = catalogue({
    webConnected: true,
    telegramConnected: telegram,
    viberConnected: viber,
    whatsappConnected: meta.whatsapp,
    messengerConnected: meta.messenger,
    instagramConnected: meta.instagram,
    smsConnected: sms,
    ussdConnected: ussd,
  });
  return NextResponse.json({ channels });
}
