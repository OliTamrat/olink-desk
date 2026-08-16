// Store credentials for channels with no provider-side registration call:
// the Meta trio (configured in Meta's dashboard), SMS aggregators and the
// USSD gateway (configured at the aggregator). Config is sealed before it
// touches the database. Telegram and Viber have their own connect routes
// because those providers require a registration call with rollback.
import { sealChannelConfig } from "@olink-desk/channels";
import { ChannelAccountKind, prisma } from "@olink-desk/database";
import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { isGuardDenied, requireOrgAdmin } from "../../../../../../lib/org-guard";

export const dynamic = "force-dynamic";

const STORABLE: Record<string, { kind: ChannelAccountKind; label: string; required: string[]; secretField?: string }> = {
  "meta-whatsapp": {
    kind: ChannelAccountKind.META_WHATSAPP,
    label: "WhatsApp (Meta)",
    required: ["appSecret", "verifyToken", "accessToken", "phoneNumberId"],
  },
  "meta-messenger": {
    kind: ChannelAccountKind.META_MESSENGER,
    label: "Facebook Messenger (Meta)",
    required: ["appSecret", "verifyToken", "accessToken"],
  },
  "meta-instagram": {
    kind: ChannelAccountKind.META_INSTAGRAM,
    label: "Instagram Direct (Meta)",
    required: ["appSecret", "verifyToken", "accessToken"],
  },
  "sms-afromessage": {
    kind: ChannelAccountKind.SMS_AFROMESSAGE,
    label: "SMS (AfroMessage)",
    required: ["sendUrl", "senderId"],
    secretField: "webhookSecret",
  },
  "sms-geezsms": {
    kind: ChannelAccountKind.SMS_GEEZSMS,
    label: "SMS (GeezSMS)",
    required: ["sendUrl", "senderId"],
    secretField: "webhookSecret",
  },
  "sms-falconvas": {
    kind: ChannelAccountKind.SMS_FALCONVAS,
    label: "SMS (FalconVAS)",
    required: ["sendUrl", "senderId"],
    secretField: "webhookSecret",
  },
  email: {
    kind: ChannelAccountKind.EMAIL_INBOUND,
    label: "Email (forwarded)",
    // fromAddress is required alongside sendUrl: receiving mail we cannot
    // answer is worse than not receiving it, because the customer is left
    // waiting on a desk that took their message and went quiet.
    required: ["sendUrl", "fromAddress"],
    secretField: "webhookSecret",
  },
  ussd: {
    kind: ChannelAccountKind.USSD_GATEWAY,
    label: "USSD gateway",
    required: [],
    secretField: "webhookSecret",
  },
};

export async function PUT(
  request: NextRequest,
  { params }: { params: { org: string; kind: string } },
) {
  const guard = await requireOrgAdmin(request, params.org);
  if (isGuardDenied(guard)) return guard;
  const { organization } = guard;

  const spec = STORABLE[params.kind];
  if (!spec) {
    return NextResponse.json({ error: "Unknown channel kind" }, { status: 404 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  for (const field of spec.required) {
    if (typeof payload[field] !== "string" || !payload[field]) {
      return NextResponse.json(
        { error: `${field} is required` },
        { status: 400 },
      );
    }
  }
  // Inbound webhook secret: generated here when the operator did not supply
  // one, and returned exactly once so it can be configured at the gateway.
  let generatedSecret: string | undefined;
  if (spec.secretField && typeof payload[spec.secretField] !== "string") {
    generatedSecret = randomBytes(24).toString("hex");
    payload[spec.secretField] = generatedSecret;
  }

  const sealed = sealChannelConfig(payload);
  const existing = await prisma.channelAccount.findFirst({
    where: { organizationId: organization.id, kind: spec.kind },
  });
  const account = existing
    ? await prisma.channelAccount.update({
        where: { id: existing.id },
        data: { config: sealed, active: true },
      })
    : await prisma.channelAccount.create({
        data: {
          organizationId: organization.id,
          kind: spec.kind,
          label: spec.label,
          config: sealed,
        },
      });

  await prisma.auditLog.create({
    data: {
      organizationId: organization.id,
      action: `channel.${params.kind}_configured`,
      entityType: "channel_account",
      entityId: String(account.id),
      metadata: { kind: spec.kind },
    },
  });

  return NextResponse.json({
    ok: true,
    ...(generatedSecret ? { webhookSecret: generatedSecret } : {}),
  });
}
