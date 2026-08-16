// One inbound message on any channel, threaded onto a ticket — the shared
// spine ported from Bank Assist's `_channel_reply()`.
//
// Every messaging channel repeats the same steps — find or open this person's
// conversation, thread the message onto a ticket, acknowledge if the ticket is
// new — and only the transport differs. With seven channels that is six
// chances to drop the acknowledgement on the newest adapter and nowhere for a
// test to notice. So an adapter is transport only: it verifies its webhook,
// extracts (externalUserId, text), and supplies `send`.
//
// The auto-ack is tied to the TICKET row being new, not to any channel's
// "chat opened" event, because those events are unreliable across channels:
// Viber fires one only on a fresh chat, WhatsApp has none at all.
import type { Channel, Organization, PrismaClient, Ticket } from "@olink-desk/database";
import { Prisma, TicketStatus } from "@olink-desk/database";
import { awaitingRating, parseRating } from "@olink-desk/csat";
import { detectLanguage, t } from "@olink-desk/i18n";
import { slaDatesFor } from "@olink-desk/sla";

export interface ChannelReplyInput {
  db: PrismaClient;
  organization: Organization;
  channel: Channel;
  /** The identity the channel can see: Telegram chat id, widget session id. */
  externalUserId: string;
  text: string;
  /**
   * Channel-side message id for idempotency, prefixed per channel (e.g.
   * `tg:<chat>:<msg>`). Webhook redeliveries carry the same id and must not
   * produce a second TicketMessage or a second ticket.
   */
  externalMessageId?: string;
  /** Explicit language from the channel payload; pins the conversation. */
  languageHint?: string;
  /**
   * Deliver one outbound body on this channel. Returns true when the channel
   * API accepted it. Must not throw for ordinary delivery failure — a channel
   * outage must never 500 the webhook (the channel would retry the update).
   */
  send: (body: string) => Promise<boolean>;
}

export interface ChannelReplyResult {
  duplicate: boolean;
  conversationId: string;
  ticketId: string;
  ticketNumber: number;
  ticketCreated: boolean;
  /** Present only when the inbound message was read as a satisfaction score
   *  rather than a new message — the caller can then skip its own ack. */
  csatScore?: number;
}

// Statuses an inbound message may thread onto. RESOLVED is deliberately not
// here: a customer replying after resolution is a new matter (or a reopen
// decision for a person), not a silent append to a closed timeline.
const OPEN_STATUSES: TicketStatus[] = [
  TicketStatus.NEW,
  TicketStatus.OPEN,
  TicketStatus.PENDING,
];

export async function channelReply(
  input: ChannelReplyInput,
): Promise<ChannelReplyResult | { duplicate: true }> {
  const { db, organization, channel, externalUserId, text, send } = input;

  // Idempotency first: a redelivered update must do nothing at all — no
  // second message, no second ticket, no second ack.
  if (input.externalMessageId) {
    const seen = await db.ticketMessage.findFirst({
      where: {
        organizationId: organization.id,
        externalId: input.externalMessageId,
      },
      select: { id: true },
    });
    if (seen) return { duplicate: true };
  }

  // The conversation row is the channel-side identity. Sticky language:
  // an explicit hint pins it; otherwise detection updates it only when the
  // message carries a real signal (a bare "OK" must not flip it).
  const detected = input.languageHint ?? detectLanguage(text);
  let conversation = await db.conversation.findUnique({
    where: {
      organizationId_channel_externalUserId: {
        organizationId: organization.id,
        channel,
        externalUserId,
      },
    },
  });
  if (conversation === null) {
    conversation = await db.conversation.create({
      data: {
        organizationId: organization.id,
        channel,
        externalUserId,
        language: detected ?? organization.defaultLanguage,
      },
    });
  } else if (detected && detected !== conversation.language) {
    conversation = await db.conversation.update({
      where: { id: conversation.id },
      data: { language: detected },
    });
  }

  // ---- Is this a satisfaction score rather than a new message?
  //
  // After a survey goes out, the next thing the customer sends is either a
  // rating or a brand new problem, and nothing about the transport tells them
  // apart. The rule is deliberately narrow — a rating is a message that is
  // essentially just a number, checked against a survey that is actually open
  // on this conversation's most recent RESOLVED ticket.
  //
  // The asymmetry is on purpose: losing a rating costs a data point, losing a
  // question costs a customer. So anything with words in it falls straight
  // through to the ordinary path below and opens a ticket as normal.
  const surveyed = await db.ticket.findFirst({
    where: {
      organizationId: organization.id,
      conversationId: conversation.id,
      csatSentAt: { not: null },
      csatScore: null,
    },
    orderBy: { csatSentAt: "desc" },
  });
  if (surveyed && awaitingRating(surveyed, new Date())) {
    const score = parseRating(text);
    if (score !== null) {
      await db.ticket.update({
        where: { id: surveyed.id },
        data: { csatScore: score },
      });
      // The score is recorded on the ticket; the audit row says a rating
      // happened and what it was, never the customer's words.
      await db.auditLog.create({
        data: {
          organizationId: organization.id,
          action: "ticket.csat_received",
          entityType: "ticket",
          entityId: String(surveyed.id),
          metadata: { score, channel },
        },
      });
      // Both halves of the exchange are recorded on the ticket that was
      // surveyed. The customer really did send something and we really did
      // answer, so a timeline that showed neither — or showed a thank-you
      // with nothing before it — would be a lie of omission. What is NOT
      // created is a new ticket, which was the actual point.
      await db.ticketMessage.create({
        data: {
          organizationId: organization.id,
          ticketId: surveyed.id,
          direction: "INBOUND",
          channel,
          body: text,
          contactId: conversation.contactId,
          externalId: input.externalMessageId ?? null,
        },
      });

      // Acknowledge in the customer's own language, with no promise of
      // follow-up: the ticket is closed and nobody is coming back to them.
      const thanks = t(conversation.language, "csat_thanks");
      let delivered = false;
      try {
        delivered = await send(thanks);
      } catch {
        delivered = false;
      }
      // Recorded only on real delivery — and on WEB, recording IS delivery
      // for the widget, which is exactly what an earlier version missed:
      // it sent without recording, so the customer saw nothing at all.
      if (delivered) {
        await db.ticketMessage.create({
          data: {
            organizationId: organization.id,
            ticketId: surveyed.id,
            direction: "OUTBOUND",
            channel,
            body: thanks,
          },
        });
      }
      return {
        duplicate: false,
        conversationId: conversation.id,
        ticketId: surveyed.id,
        ticketNumber: surveyed.number,
        ticketCreated: false,
        csatScore: score,
      };
    }
  }

  let ticket = await db.ticket.findFirst({
    where: {
      organizationId: organization.id,
      conversationId: conversation.id,
      status: { in: OPEN_STATUSES },
    },
    orderBy: { createdAt: "desc" },
  });
  const ticketCreated = ticket === null;
  if (ticket === null) {
    ticket = await createTicketWithNumber(db, {
      // The customer's own first words are the ticket's identity in every
      // list — without this every row previews the auto-ack and they all
      // look identical.
      subject: text.slice(0, 120),
      organizationId: organization.id,
      conversationId: conversation.id,
      contactId: conversation.contactId,
      channel,
      language: conversation.language,
    });
    // Audit the event, never the words: metadata carries no message text
    // (ported rule — chat content stays out of logs).
    await db.auditLog.create({
      data: {
        organizationId: organization.id,
        action: "ticket.opened_from_channel",
        entityType: "ticket",
        entityId: String(ticket.id),
        metadata: { channel, conversationId: conversation.id },
      },
    });
  }

  await db.ticketMessage.create({
    data: {
      organizationId: organization.id,
      ticketId: ticket.id,
      direction: "INBOUND",
      channel,
      body: text,
      contactId: conversation.contactId,
      externalId: input.externalMessageId ?? null,
    },
  });

  if (ticketCreated) {
    const ack = t(conversation.language, "ticket_opened", {
      org: organization.name,
      number: ticket.number,
    });
    let delivered = false;
    try {
      delivered = await send(ack);
    } catch {
      // The transport contract is "log, never raise" — but hold the line here
      // too so a misbehaving adapter cannot 500 the webhook.
      delivered = false;
    }
    // Record the ack only if the channel accepted it: an outbound row the
    // customer never received would mislead the agent reading the timeline.
    if (delivered) {
      await db.ticketMessage.create({
        data: {
          organizationId: organization.id,
          ticketId: ticket.id,
          direction: "OUTBOUND",
          channel,
          body: ack,
        },
      });
    }
  }

  return {
    duplicate: false,
    conversationId: conversation.id,
    ticketId: ticket.id,
    ticketNumber: ticket.number,
    ticketCreated,
  };
}

/**
 * Per-organization human-facing ticket numbers. Concurrency-safe via the
 * [organizationId, number] unique constraint: compute max+1, retry on the
 * unique violation rather than locking.
 */
async function createTicketWithNumber(
  db: PrismaClient,
  data: {
    organizationId: string;
    conversationId: string;
    contactId: string | null;
    channel: Channel;
    language: string;
    subject: string;
  },
): Promise<Ticket> {
  // SLA clocks start at creation, on the org's policy for the default
  // priority (NORMAL — a channel message carries no priority of its own;
  // re-prioritizing recomputes the clocks in the ticket PATCH).
  const sla = await slaDatesFor(db, data.organizationId, "NORMAL", new Date());
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const latest = await db.ticket.findFirst({
      where: { organizationId: data.organizationId },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    try {
      return await db.ticket.create({
        data: { ...data, ...sla, number: (latest?.number ?? 0) + 1 },
      });
    } catch (err) {
      const isNumberCollision =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002";
      if (!isNumberCollision) throw err;
    }
  }
  throw new Error("Could not allocate a ticket number after 5 attempts");
}
