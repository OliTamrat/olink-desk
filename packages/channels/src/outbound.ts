// An agent's reply, delivered back on the channel the ticket arrived on.
// The inbound spine (reply.ts) made adapters transport-only; this is the
// mirror image for staff: one function owns the shared steps — resolve the
// conversation, pick the transport, deliver, record — so the console knows
// nothing about channels either.
//
// The recording rule is the same as inbound acks: an OUTBOUND row is written
// only when the channel accepted the message. A timeline row the customer
// never received would mislead the next agent reading it.
import type { PrismaClient } from "@olink-desk/database";
import { ChannelAccountKind, TicketStatus } from "@olink-desk/database";

import { openChannelConfig } from "./crypto";
import { sendMessaging, sendWhatsApp, type MetaConfig } from "./meta";
import { sendMessage as sendSms, SMS_KINDS, type SmsConfig } from "./sms";
import { sendMessage as sendTelegram, type TelegramConfig } from "./telegram";
import { sendMessage as sendViber, type ViberConfig } from "./viber";

export type ReplyOutcome =
  | { ok: true; messageId: string }
  | {
      ok: false;
      reason:
        | "ticket_not_found"
        | "no_conversation"
        | "channel_not_connected"
        | "no_outbound_transport"
        | "delivery_failed"
        | "empty_body";
    };

const MAX_BODY = 4000;

async function config<T>(
  db: PrismaClient,
  organizationId: string,
  kinds: ChannelAccountKind[],
): Promise<T | null> {
  const account = await db.channelAccount.findFirst({
    where: { organizationId, kind: { in: kinds }, active: true },
  });
  if (!account) return null;
  try {
    return openChannelConfig<T>(account.config);
  } catch {
    return null;
  }
}

/**
 * Deliver `body` to the ticket's customer and record it on the timeline.
 * organizationId comes from the caller's SESSION, never from the request —
 * a ticket outside that tenant is simply not found.
 *
 * WEB needs no transport: the widget polls the conversation, so recording IS
 * delivery. USSD has no outbound at all — a session cannot be re-entered —
 * and PHONE/EMAIL/WALK_IN tickets have no built transport yet; both refuse
 * so the console can tell the agent to reach the customer another way,
 * rather than recording a reply nobody will receive.
 */
export async function sendAgentReply(opts: {
  db: PrismaClient;
  organizationId: string;
  ticketId: string;
  body: string;
  authorUserId: string;
}): Promise<ReplyOutcome> {
  const { db, organizationId, ticketId, authorUserId } = opts;
  const body = opts.body.trim().slice(0, MAX_BODY);
  if (!body) return { ok: false, reason: "empty_body" };

  const ticket = await db.ticket.findFirst({
    where: { id: ticketId, organizationId },
    include: { conversation: true, organization: true },
  });
  if (!ticket) return { ok: false, reason: "ticket_not_found" };
  if (!ticket.conversation) return { ok: false, reason: "no_conversation" };
  const to = ticket.conversation.externalUserId;

  let delivered: boolean;
  switch (ticket.channel) {
    case "WEB": {
      delivered = true;
      break;
    }
    case "TELEGRAM": {
      const c = await config<TelegramConfig>(db, organizationId, [
        ChannelAccountKind.TELEGRAM_BOT,
      ]);
      if (!c?.botToken) return { ok: false, reason: "channel_not_connected" };
      delivered = await sendTelegram(c.botToken, to, body);
      break;
    }
    case "VIBER": {
      const c = await config<ViberConfig>(db, organizationId, [
        ChannelAccountKind.VIBER_BOT,
      ]);
      if (!c?.authToken) return { ok: false, reason: "channel_not_connected" };
      delivered = await sendViber(c.authToken, to, body, ticket.organization.name);
      break;
    }
    case "WHATSAPP": {
      const c = await config<MetaConfig>(db, organizationId, [
        ChannelAccountKind.META_WHATSAPP,
      ]);
      if (!c?.accessToken || !c.phoneNumberId) {
        return { ok: false, reason: "channel_not_connected" };
      }
      delivered = await sendWhatsApp(c.accessToken, c.phoneNumberId, to, body);
      break;
    }
    case "MESSENGER":
    case "INSTAGRAM": {
      const kind =
        ticket.channel === "MESSENGER"
          ? ChannelAccountKind.META_MESSENGER
          : ChannelAccountKind.META_INSTAGRAM;
      const c = await config<MetaConfig>(db, organizationId, [kind]);
      if (!c?.accessToken) return { ok: false, reason: "channel_not_connected" };
      delivered = await sendMessaging(c.accessToken, to, body, ticket.channel);
      break;
    }
    case "SMS": {
      const c = await config<SmsConfig>(db, organizationId, [...SMS_KINDS]);
      if (!c?.sendUrl) return { ok: false, reason: "channel_not_connected" };
      delivered = await sendSms({
        sendUrl: c.sendUrl,
        authHeader: c.authHeader,
        to,
        text: body,
        senderId: c.senderId,
      });
      break;
    }
    default:
      // USSD, PHONE, EMAIL, WALK_IN — nothing to deliver through.
      return { ok: false, reason: "no_outbound_transport" };
  }

  if (!delivered) return { ok: false, reason: "delivery_failed" };

  const message = await db.ticketMessage.create({
    data: {
      organizationId,
      ticketId: ticket.id,
      direction: "OUTBOUND",
      channel: ticket.channel,
      body,
      authorUserId,
      contactId: ticket.contactId,
    },
  });
  await db.ticket.update({
    where: { id: ticket.id },
    data: {
      status: ticket.status === TicketStatus.NEW ? TicketStatus.OPEN : ticket.status,
      firstRespondedAt: ticket.firstRespondedAt ?? new Date(),
    },
  });
  // The event, never the words.
  await db.auditLog.create({
    data: {
      organizationId,
      actorUserId: authorUserId,
      action: "ticket.replied",
      entityType: "ticket",
      entityId: String(ticket.id),
      metadata: { channel: ticket.channel },
    },
  });
  return { ok: true, messageId: message.id };
}
