// Email, through whichever inbound-parse service the tenant points at us.
//
// Deliberately A CONTRACT INSTEAD OF AN INTEGRATION, for the same reason as
// SMS: there is no one email API. A tenant forwards `support@theirdomain` to
// a service (Postmark, Mailgun, SendGrid, Cloudflare Email Workers) which
// parses the message and POSTs it here.
//
// **Forwarding, not OAuth** (founder decision, 2026-08-16). The alternative
// was Gmail OAuth, as olink-dispatch uses. It fails here: Google Workspace
// penetration in Ethiopia is low, so OAuth would gate every tenant behind an
// account most of them do not have — the exact wall Get It Trucking hit for
// months. A forwarding address does not care what mail system the customer
// runs.
//
// Generous on the way in, strict on authentication — field names differ per
// vendor, credentials do not.
import type { PrismaClient } from "@olink-desk/database";
import { ChannelAccountKind } from "@olink-desk/database";

import { openChannelConfig, secretsMatch } from "./crypto";
import { channelReply, type ChannelReplyResult } from "./reply";

const REQUEST_TIMEOUT_MS = 15_000;

/** Longest body we thread. A 400 KB newsletter is not a support request. */
export const MAX_BODY_CHARS = 20_000;

const FROM_KEYS = ["from", "From", "sender", "Sender", "FromFull", "envelope_from"];
const SUBJECT_KEYS = ["subject", "Subject"];
const TEXT_KEYS = [
  "text",
  "TextBody",
  "body-plain",
  "stripped-text",
  "plain",
  "body",
  "Text",
];
const MESSAGE_ID_KEYS = ["messageId", "MessageID", "Message-Id", "message-id", "message_id"];
const IN_REPLY_TO_KEYS = ["inReplyTo", "InReplyTo", "In-Reply-To", "in-reply-to", "references", "References"];

export interface EmailConfig {
  /** Shared secret the inbound service sends back to us. */
  webhookSecret: string;
  /** Where to POST an outbound message. Resend, Postmark, anything. */
  sendUrl: string;
  /** The credential, sent verbatim as the value of `authHeaderName`. */
  authHeader?: string;
  /**
   * Which header carries it. Defaults to `Authorization`, which covers Resend
   * and Mailgun; Postmark wants `X-Postmark-Server-Token` and would otherwise
   * reject every send while the config looked perfectly valid. The docstring
   * above used to say "Resend, Postmark, anything" while the header was
   * hard-coded — one of those three was not true.
   */
  authHeaderName?: string;
  /** The address replies come FROM, e.g. "Olink Desk <support@acme.et>". */
  fromAddress: string;
}

// ------------------------------------------------------------------ parsing

/**
 * Pull a bare address out of whatever the header looked like.
 * `Selam Bekele <selam@example.com>` → `selam@example.com`.
 *
 * Case-folded, because SELAM@Example.com and selam@example.com are one
 * mailbox and treating them as two would give the same person two records —
 * the duplicate problem ADR 0015 exists to prevent, arriving by another door.
 */
export function parseAddress(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const angled = raw.match(/<([^>]+)>/);
  const candidate = (angled ? angled[1] : raw).trim().toLowerCase();
  if (!candidate || /\s/.test(candidate)) return null;
  if (!/^[^@]+@[^@.]+(\.[^@.]+)+$/.test(candidate)) return null;
  return candidate;
}

/** The display name, if the header carried one. `Selam <s@x.com>` → `Selam`. */
export function parseDisplayName(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const angled = raw.indexOf("<");
  if (angled <= 0) return null;
  const name = raw.slice(0, angled).trim().replace(/^["']|["']$/g, "").trim();
  return name || null;
}

/**
 * The ticket number a reply is about, read from its subject.
 *
 * Outbound mail carries `[#123]`, and every mail client on earth preserves
 * the subject through a reply. That makes it the one threading signal that
 * works everywhere — `In-Reply-To` is better when present, but a customer who
 * composes a fresh message quoting the old subject still lands correctly.
 */
export function ticketNumberInSubject(subject: string): number | null {
  if (typeof subject !== "string") return null;
  const m = subject.match(/\[#(\d{1,9})\]/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Strip the quoted history off a reply.
 *
 * Without this every reply carries the entire prior thread, so the ticket
 * list previews "On Mon, 16 Aug…" for every row and an agent reads the same
 * paragraph five times. Conservative on purpose: it only cuts at markers that
 * unambiguously begin quoted text, and if that would leave nothing it keeps
 * the original — losing what somebody wrote is far worse than showing too
 * much.
 */
export function stripQuotedReply(body: string): string {
  if (typeof body !== "string") return "";
  const lines = body.split(/\r?\n/);
  const cutMarkers = [
    /^\s*On .+ wrote:\s*$/,          // Gmail, Apple Mail
    /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/i,
    /^\s*_{5,}\s*$/,                  // Outlook's rule above the quoted head
    /^\s*From:\s.+$/,                 // Outlook quoted header block
    /^\s*>{1,}/,                      // plain quoting
  ];
  let cut = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    if (cutMarkers.some((re) => re.test(lines[i]))) {
      cut = i;
      break;
    }
  }
  const kept = lines.slice(0, cut).join("\n").trim();
  return kept || body.trim();
}

export interface ParsedEmail {
  sender: string | null;
  senderName: string | null;
  subject: string;
  text: string | null;
  messageId: string | null;
  inReplyTo: string | null;
}

/** Whatever the vendor called them. */
export function parseInboundEmail(fields: Record<string, unknown>): ParsedEmail {
  const pick = (keys: string[]): string => {
    for (const key of keys) {
      const value = fields[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      // Postmark sends FromFull as an object.
      if (value && typeof value === "object" && "Email" in (value as object)) {
        const email = (value as { Email?: unknown }).Email;
        if (typeof email === "string" && email.trim()) return email.trim();
      }
    }
    return "";
  };
  const rawFrom = pick(FROM_KEYS);
  const rawText = pick(TEXT_KEYS);
  return {
    sender: parseAddress(rawFrom),
    senderName: parseDisplayName(rawFrom),
    subject: pick(SUBJECT_KEYS),
    text: rawText ? stripQuotedReply(rawText).slice(0, MAX_BODY_CHARS) : null,
    messageId: pick(MESSAGE_ID_KEYS) || null,
    inReplyTo: pick(IN_REPLY_TO_KEYS) || null,
  };
}

// ----------------------------------------------------------------- inbound

export type EmailWebhookResult =
  | { status: 401 }
  | { status: 400; reason: string }
  | { status: 200; threaded: false; reason: string }
  | { status: 200; threaded: true; result: ChannelReplyResult };

/**
 * One inbound email, threaded onto a ticket.
 *
 * Returns 200 for anything we simply do not act on — an auto-reply, a message
 * with no body — because a non-2xx tells the inbound service to retry, and
 * retrying an out-of-office forever is how a mail loop starts.
 */
export async function handleEmailWebhook(opts: {
  db: PrismaClient;
  organizationSlug: string;
  secret: string | null;
  fields: Record<string, unknown>;
}): Promise<EmailWebhookResult> {
  const { db, fields } = opts;

  const organization = await db.organization.findUnique({
    where: { slug: opts.organizationSlug },
  });
  if (!organization) return { status: 401 };

  const account = await db.channelAccount.findFirst({
    where: {
      organizationId: organization.id,
      kind: ChannelAccountKind.EMAIL_INBOUND,
      active: true,
    },
  });
  if (!account) return { status: 401 };

  let config: EmailConfig;
  try {
    config = openChannelConfig<EmailConfig>(account.config);
  } catch {
    return { status: 401 };
  }
  // Constant-time, and fails closed on an unset secret.
  if (!secretsMatch(config.webhookSecret, opts.secret)) return { status: 401 };

  const mail = parseInboundEmail(fields);
  if (!mail.sender) return { status: 400, reason: "no_sender" };
  if (!mail.text) return { status: 200, threaded: false, reason: "no_body" };

  // Auto-replies must never open a ticket, and must never be replied to: our
  // acknowledgement would bounce off their auto-responder and back again.
  if (isAutoReply(fields, mail.subject)) {
    return { status: 200, threaded: false, reason: "auto_reply" };
  }

  // The subject token is how a reply finds its ticket. `channelReply` threads
  // on the conversation's newest open ticket anyway, so this matters for the
  // case it cannot handle: a customer replying to a RESOLVED ticket, who
  // should reopen that one rather than silently start a new thread.
  const number = ticketNumberInSubject(mail.subject);

  const threaded = await channelReply({
    db,
    organization,
    channel: "EMAIL",
    // The mailbox is the identity, and it is durable in a way a widget
    // session id is not — the same address next year is the same person.
    externalUserId: mail.sender,
    text: mail.text,
    // Vendor message ids make redelivery idempotent. Prefixed like every
    // other channel's so two channels cannot collide on one id.
    externalMessageId: mail.messageId ? `email:${mail.messageId}` : undefined,
    subjectHint: mail.subject || undefined,
    reopenTicketNumber: number ?? undefined,
    contactHint: { email: mail.sender, name: mail.senderName },
    send: async (body, ticket) =>
      sendEmail(config, mail.sender!, mail.subject, body, ticket?.number),
  });

  // A redelivery of a message we already threaded. The inbound service gets a
  // 200 either way; saying which is what makes a duplicate visible in a log
  // rather than looking like a second customer message.
  if (!("ticketId" in threaded)) {
    return { status: 200, threaded: false, reason: "duplicate" };
  }
  return { status: 200, threaded: true, result: threaded };
}

/**
 * Out-of-office, bounces, and anything else generated by a machine.
 *
 * Getting this wrong is not one bad ticket: our acknowledgement goes back to
 * their auto-responder, which replies again, and the two systems talk to each
 * other until somebody notices. The headers below are the standard ones every
 * well-behaved auto-responder sets, and the subject check catches the rest.
 */
export function isAutoReply(fields: Record<string, unknown>, subject: string): boolean {
  const header = (name: string): string => {
    const direct = fields[name] ?? fields[name.toLowerCase()];
    if (typeof direct === "string") return direct.toLowerCase();
    const headers = fields.headers ?? fields.Headers;
    if (headers && typeof headers === "object" && !Array.isArray(headers)) {
      const v = (headers as Record<string, unknown>)[name];
      if (typeof v === "string") return v.toLowerCase();
    }
    return "";
  };
  if (header("Auto-Submitted").startsWith("auto-")) return true;
  if (header("X-Auto-Response-Suppress")) return true;
  if (header("Precedence") === "bulk" || header("Precedence") === "auto_reply") return true;
  if (header("X-Autoreply") || header("X-Autorespond")) return true;
  // Some responders set no header at all and only the subject gives them away.
  return /^\s*(auto(matic)?[- ]?reply|out of (the )?office|autoresponse)\b/i.test(subject);
}

// ---------------------------------------------------------------- outbound

/**
 * Send one reply. Returns false rather than throwing — the transport contract
 * every adapter follows, so a provider outage cannot 500 a webhook.
 *
 * The `[#n]` token goes in the SUBJECT, which is what makes the customer's
 * reply come back to the right ticket.
 */
export async function sendEmail(
  config: EmailConfig,
  to: string,
  subject: string,
  body: string,
  ticketNumber?: number,
): Promise<boolean> {
  if (!config.sendUrl || !config.fromAddress) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(config.sendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.authHeader
          ? { [config.authHeaderName || "Authorization"]: config.authHeader }
          : {}),
      },
      body: JSON.stringify({
        from: config.fromAddress,
        to: [to],
        subject: replySubject(subject, ticketNumber),
        text: body,
      }),
      signal: controller.signal,
    });
    return resp.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** `Re: their subject [#123]`, without stacking Re: or repeating the token. */
export function replySubject(subject: string, ticketNumber?: number): string {
  const base = (subject || "Your message").replace(/\s*\[#\d+\]\s*$/, "").trim();
  const withRe = /^re:/i.test(base) ? base : `Re: ${base}`;
  return ticketNumber ? `${withRe} [#${ticketNumber}]` : withRe;
}

/**
 * Whether this tenant has email wired up. "Connected" means we can both
 * receive AND reply — an inbound-only setup would take a customer's message
 * and then have nowhere to answer it, which is worse than being off.
 */
export async function emailConnected(
  db: PrismaClient,
  organizationId: string,
): Promise<boolean> {
  const account = await db.channelAccount.findFirst({
    where: {
      organizationId,
      kind: ChannelAccountKind.EMAIL_INBOUND,
      active: true,
    },
  });
  if (!account) return false;
  try {
    const config = openChannelConfig<EmailConfig>(account.config);
    return Boolean(config.webhookSecret && config.sendUrl && config.fromAddress);
  } catch {
    return false;
  }
}
