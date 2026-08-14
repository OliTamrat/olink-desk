// SMS, through whichever aggregator the tenant has an agreement with —
// ported from Bank Assist. Every other channel talks to one company's API;
// SMS goes through an aggregator (in Ethiopia: AfroMessage, GeezSMS, or Ethio
// Telecom direct), so this defines A CONTRACT INSTEAD OF AN INTEGRATION:
//
// Inbound — the aggregator POSTs with a shared secret in X-SMS-Secret and
// either form-encoded or JSON fields. Field names vary by vendor, so common
// spellings are accepted. Deliberately generous on the way in, strict on
// authentication.
//
// Outbound — a POST to `sendUrl` with `authHeader` sent verbatim as the
// Authorization header, JSON body {to, text, from}. A vendor whose shape
// differs needs a mapping written from its spec, not from guesswork.
//
// SMS is the only channel that costs money per reply, which changes one
// decision: a long reply is split into numbered parts up to MAX_PARTS rather
// than truncated — but capped, so a long answer cannot quietly bill the
// tenant for a dozen segments to one customer.
import type { PrismaClient } from "@olink-desk/database";
import { ChannelAccountKind } from "@olink-desk/database";

import { openChannelConfig, secretsMatch } from "./crypto";
import { channelReply } from "./reply";

const REQUEST_TIMEOUT_MS = 15_000;

// A GSM-7 message is 160 characters, or 153 per part once concatenated —
// 153 keeps a split message billing as the parts intended.
export const PART_CHARS = 153;
// Four parts is roughly a paragraph; beyond that the right answer is "call
// us", not a wall of text the tenant pays for by the segment.
export const MAX_PARTS = 4;

const FROM_KEYS = ["from", "msisdn", "sender", "source", "originator"];
const TEXT_KEYS = ["text", "message", "body", "content", "sms"];
const ID_KEYS = ["id", "message_id", "messageId", "smsId"];

export const SMS_KINDS = [
  ChannelAccountKind.SMS_AFROMESSAGE,
  ChannelAccountKind.SMS_GEEZSMS,
  ChannelAccountKind.SMS_FALCONVAS,
] as const;

export interface SmsConfig {
  webhookSecret: string;
  sendUrl: string;
  /** Sent verbatim as the Authorization header. */
  authHeader?: string;
  senderId: string;
}

/** (sender, text, id) from an aggregator's callback, whatever it calls them. */
export function parseInbound(fields: Record<string, unknown>): {
  sender: string | null;
  text: string | null;
  messageId: string | null;
} {
  const pick = (keys: string[]) => {
    for (const key of keys) {
      const value = fields[key];
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim();
      }
    }
    return null;
  };
  return {
    sender: pick(FROM_KEYS),
    text: pick(TEXT_KEYS),
    messageId: pick(ID_KEYS),
  };
}

/** Split a reply into billable parts, numbered so they can be reassembled —
 * SMS parts can arrive out of order, and an unlabelled second half of an
 * answer is worse than no answer. Single-part replies are never numbered. */
export function segments(text: string): string[] {
  if (text.length <= PART_CHARS) return [text];
  // Reserve room for the " (n/m)" suffix numbering adds.
  const body = PART_CHARS - 6;
  let raw: string[] = [];
  for (let i = 0; i < text.length; i += body) {
    raw.push(text.slice(i, i + body));
  }
  if (raw.length > MAX_PARTS) {
    raw = raw.slice(0, MAX_PARTS);
    // Say it was cut. A silently truncated answer reads as a complete one.
    raw[raw.length - 1] = raw[raw.length - 1].slice(0, body - 1) + "…";
  }
  const total = raw.length;
  return raw.map((part, i) => `${part} (${i + 1}/${total})`);
}

/** Send a reply, one request per segment. Failures logged, never raised.
 * Stops at the first failed segment: if part one did not arrive, parts two
 * and three are noise the tenant pays for. */
export async function sendMessage(opts: {
  sendUrl: string;
  authHeader?: string;
  to: string;
  text: string;
  senderId: string;
}): Promise<boolean> {
  if (!opts.sendUrl) {
    console.warn(JSON.stringify({ event: "sms_send_skipped_no_gateway" }));
    return false;
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.authHeader) headers.Authorization = opts.authHeader;

  for (const part of segments(opts.text)) {
    try {
      const resp = await fetch(opts.sendUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ to: opts.to, text: part, from: opts.senderId }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!resp.ok) {
        console.warn(
          JSON.stringify({ event: "sms_send_failed", status: resp.status }),
        );
        return false;
      }
    } catch (err) {
      console.warn(
        JSON.stringify({ event: "sms_send_failed", error: String(err) }),
      );
      return false;
    }
  }
  return true;
}

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

async function activeSmsConfig(
  db: PrismaClient,
  organizationId: string,
): Promise<SmsConfig | null> {
  const account = await db.channelAccount.findFirst({
    where: {
      organizationId,
      kind: { in: [...SMS_KINDS] },
      active: true,
    },
  });
  if (!account) return null;
  try {
    return openChannelConfig<SmsConfig>(account.config);
  } catch {
    return null;
  }
}

/** One inbound SMS callback, framework-agnostic. `fields` is the parsed
 * form-encoded or JSON body — SMS aggregators send both. */
export async function handleSmsWebhook(opts: {
  db: PrismaClient;
  orgSlug: string;
  secretHeader: string | null;
  fields: Record<string, unknown>;
}): Promise<WebhookResult> {
  const { db, orgSlug, secretHeader, fields } = opts;
  const organization = await db.organization.findUnique({
    where: { slug: orgSlug },
  });
  if (!organization) return { status: 404, body: { error: "Unknown organization" } };

  const config = await activeSmsConfig(db, organization.id);
  if (!config || !secretsMatch(config.webhookSecret, secretHeader)) {
    return { status: 403, body: { error: "Bad webhook secret" } };
  }

  const { sender, text, messageId } = parseInbound(fields);
  if (!sender || !text) return { status: 200, body: { ok: true } };

  await channelReply({
    db,
    organization,
    channel: "SMS",
    externalUserId: sender,
    text,
    externalMessageId: messageId ? `sms:${messageId}` : undefined,
    send: (body) =>
      sendMessage({
        sendUrl: config.sendUrl,
        authHeader: config.authHeader,
        to: sender,
        text: body,
        senderId: config.senderId,
      }),
  });
  return { status: 200, body: { ok: true } };
}

/** True when this org can SEND on SMS — the catalogue's "live" test. */
export async function smsConnected(
  db: PrismaClient,
  organizationId: string,
): Promise<boolean> {
  const config = await activeSmsConfig(db, organizationId);
  return Boolean(config?.sendUrl);
}
