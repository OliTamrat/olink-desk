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
import { TicketStatus } from "@olink-desk/database";
import { awaitingRating, parseRating } from "@olink-desk/csat";
import { detectLanguage, t } from "@olink-desk/i18n";
import { cleanContact, findOrCreateContact, openTicket } from "@olink-desk/tickets";

import { publishedArticleLoader, tryAutoAnswer } from "./auto-answer";
import type { Doc } from "@olink-desk/retrieval";

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
   * A subject the channel actually carries. Email has one; a chat message
   * does not, which is why the default is the customer's own first words.
   */
  subjectHint?: string;
  /**
   * A ticket number the customer's own message pointed at — the `[#123]` in
   * an email subject. Used ONLY to reopen a ticket that has since been
   * resolved: replying to an answered email must continue that matter, not
   * quietly start a second one the agent has no reason to connect to it.
   */
  reopenTicketNumber?: number;
  /**
   * Who this is, when the channel knows. Email carries a real mailbox, so an
   * email ticket can belong to somebody from the first message — unlike a
   * widget session id, which identifies nobody.
   */
  contactHint?: { email?: string | null; phone?: string | null; name?: string | null };
  /**
   * Deliver one outbound body on this channel. Returns true when the channel
   * API accepted it. Must not throw for ordinary delivery failure — a channel
   * outage must never 500 the webhook (the channel would retry the update).
   */
  send: (body: string, ticket?: { number: number; subject: string | null }) => Promise<boolean>;
  /**
   * Published knowledge articles for this tenant in one language.
   *
   * OPTIONAL, and its absence is the off switch: an adapter that does not
   * supply it gets exactly the behaviour this spine had before deflection
   * existed. That is deliberate — a new channel is safe by default and opts
   * IN to answering, rather than shipping able to talk to customers because
   * somebody forgot a flag.
   *
   * Published only. A draft article is one nobody has approved, and this is
   * the one path where its words would reach a customer unread.
   */
  loadArticles?: (language: string) => Promise<Doc[]>;
}

export interface ChannelReplyResult {
  duplicate: boolean;
  conversationId: string;
  ticketId: string;
  ticketNumber: number;
  ticketCreated: boolean;
  /** True when the desk answered this message itself, with no agent. */
  autoAnswered?: boolean;
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
  const { db, organization, channel, externalUserId, text, send, loadArticles } = input;

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

  // A channel that knows who the customer is says so, and the conversation
  // remembers. Email is the first: a mailbox is a durable identity in a way a
  // widget session id is not. Find-or-create, so somebody already on file
  // from a phone call is recognised rather than duplicated.
  if (input.contactHint && !conversation.contactId) {
    const clean = cleanContact(
      {
        email: input.contactHint.email ?? null,
        phone: input.contactHint.phone ?? null,
        name: input.contactHint.name ?? null,
        language: conversation.language,
      },
      organization.defaultLanguage,
    );
    if (clean.ok) {
      try {
        const { contact } = await findOrCreateContact(db, organization.id, clean.value);
        conversation = await db.conversation.update({
          where: { id: conversation.id },
          data: { contactId: contact.id },
        });
      } catch {
        // The two identities already belong to two different people. That is
        // for staff to untangle — the customer's message still gets through,
        // as an unidentified one, rather than being rejected at the webhook.
      }
    }
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

  // The customer replied to a ticket that had been answered and closed. Their
  // reply belongs on THAT matter — opening a fresh ticket would hand an agent
  // a message with no visible history and the customer would have to explain
  // themselves again. Scoped to this conversation, so a number lifted from
  // somebody else's email reaches nothing.
  if (ticket === null && input.reopenTicketNumber !== undefined) {
    const resolved = await db.ticket.findFirst({
      where: {
        organizationId: organization.id,
        conversationId: conversation.id,
        number: input.reopenTicketNumber,
      },
    });
    if (resolved) {
      ticket = await db.ticket.update({
        where: { id: resolved.id },
        data: { status: TicketStatus.OPEN, resolvedAt: null, closedAt: null },
      });
    }
  }
  const ticketCreated = ticket === null;
  if (ticket === null) {
    ticket = await openTicket(db, {
      // The customer's own first words are the ticket's identity in every
      // list — without this every row previews the auto-ack and they all
      // look identical. A channel that carries a real subject (email) says
      // so; a chat message has none.
      subject: (input.subjectHint?.trim() || text).slice(0, 120),
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

  // ---- The deflection loop ----
  //
  // Attempted on EVERY inbound message, not only the first, because a
  // follow-up question is still a question — and answering only the opening
  // message would make the desk look like it stopped listening.
  //
  // Every gate inside can only refuse. If any does, `answer` stays null and
  // the code below is exactly what it was before this existed.
  const answer = await tryAutoAnswer(organization, text, conversation.language, {
    // Defaulted rather than required. `loadArticles` stays overridable so a
    // test can supply a fixture, but no adapter has to remember to pass it —
    // forgetting would mean that channel silently never answers.
    loadArticles: loadArticles ?? publishedArticleLoader(db, organization.id),
  });

  if (answer?.answered) {
    let sent = false;
    try {
      sent = await send(answer.text, { number: ticket.number, subject: ticket.subject });
    } catch {
      sent = false;
    }
    if (sent) {
      await db.ticketMessage.create({
        data: {
          organizationId: organization.id,
          ticketId: ticket.id,
          direction: "OUTBOUND",
          channel,
          body: answer.text,
          // The flag that makes deflection countable. Without it, an answer
          // the machine sent is indistinguishable from one an agent typed,
          // and the whole point of the feature becomes unmeasurable.
          autoAnswered: true,
        },
      });
      // The event, never the words — chat content stays out of logs. The
      // article ids are here because "which article deflected this" is the
      // question that tells a desk which content is earning its keep.
      await db.auditLog.create({
        data: {
          organizationId: organization.id,
          action: "ticket.auto_answered",
          entityType: "ticket",
          entityId: String(ticket.id),
          metadata: { channel, articleIds: answer.articleIds },
        },
      });
    }
  }

  // The acknowledgement is suppressed when an answer went out: telling a
  // customer "we have opened ticket #42 and will reply here" immediately
  // after replying is the tell that nobody joined the two halves up.
  if (ticketCreated && !answer?.answered) {
    const ack = t(conversation.language, "ticket_opened", {
      org: organization.name,
      number: ticket.number,
    });
    let delivered = false;
    try {
      // The ticket goes to the adapter, not just the text. Email needs the
      // number to put `[#n]` in the subject — without it the FIRST message a
      // customer ever receives from us is the one thing they cannot reply to
      // and have land correctly.
      delivered = await send(ack, { number: ticket.number, subject: ticket.subject });
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
    autoAnswered: answer?.answered === true,
  };
}

