// USSD — the channel currently being built, and the one Bank Assist has not:
// the only interactive channel that reaches a feature phone with no data.
//
// USSD is not messaging. The gateway holds a live session while the customer
// dials (*XYZ#), POSTs each input to us, and expects the NEXT SCREEN back in
// the HTTP response — prefixed CON (session continues, show a prompt) or END
// (session over, show final text). There is no out-of-band send at all, so
// the transport is the response body and nothing else.
//
// Like SMS this is a contract, not an integration: Ethio Telecom and the
// aggregators in front of them disagree on field names, so parsing is
// generous on the way in (phoneNumber/msisdn/from; text/ussdString/input;
// sessionId/session_id) and strict on authentication (X-USSD-Secret,
// constant-time, fails closed).
//
// The desk flow is deliberately one screen deep: greet → the customer types
// their message → ticket opened, ticket number on the closing screen, and
// the follow-up arrives by phone or SMS (a USSD session cannot be re-entered
// by the desk). USSD screens cap around 160-182 characters depending on the
// network, so every reply is trimmed to fit.
import type { PrismaClient } from "@olink-desk/database";
import { ChannelAccountKind } from "@olink-desk/database";
import { t } from "@olink-desk/i18n";

import { openChannelConfig, secretsMatch } from "./crypto";
import { channelReply } from "./reply";

// The conservative screen budget. 182 is the GSM-7 USSD maximum; some
// networks render less. The CON/END prefix is not shown to the customer but
// travels in the same PDU, hence the margin.
export const MAX_SCREEN = 160;

const PHONE_KEYS = ["phoneNumber", "msisdn", "from", "phone"];
const TEXT_KEYS = ["text", "ussdString", "input", "ussd_string"];
const SESSION_KEYS = ["sessionId", "session_id", "sessionID"];

export interface UssdConfig {
  webhookSecret: string;
  /** Shown nowhere yet; recorded so the catalogue can name it. */
  serviceCode?: string;
}

export function parseInbound(fields: Record<string, unknown>): {
  phone: string | null;
  text: string | null;
  sessionId: string | null;
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
  // Aggregators send the whole input path ("1*hello there") — the customer's
  // latest entry is the last segment.
  const raw = pick(TEXT_KEYS);
  const text = raw === null ? null : raw.split("*").pop()?.trim() ?? null;
  return {
    phone: pick(PHONE_KEYS),
    text: text === "" ? null : text,
    sessionId: pick(SESSION_KEYS),
  };
}

function screen(prefix: "CON" | "END", body: string): string {
  return `${prefix} ${body.slice(0, MAX_SCREEN)}`;
}

export interface UssdResult {
  status: number;
  /** text/plain — the gateway renders this as the next screen. */
  body: string;
}

/**
 * One USSD gateway callback. An empty input is the dial-in: answer CON with
 * the greeting-as-prompt. Text is the customer's message: thread it onto a
 * ticket through the same spine as every other channel and END with the
 * ticket acknowledgement. The ack is delivered in-response, so `send`
 * collects rather than transmits — exactly like the web channel.
 */
export async function handleUssdWebhook(opts: {
  db: PrismaClient;
  orgSlug: string;
  secretHeader: string | null;
  fields: Record<string, unknown>;
}): Promise<UssdResult> {
  const { db, orgSlug, secretHeader, fields } = opts;
  const organization = await db.organization.findUnique({
    where: { slug: orgSlug },
  });
  if (!organization) return { status: 404, body: "END Unknown service" };

  const account = await db.channelAccount.findFirst({
    where: {
      organizationId: organization.id,
      kind: ChannelAccountKind.USSD_GATEWAY,
      active: true,
    },
  });
  let config: UssdConfig | null = null;
  try {
    config = account ? openChannelConfig<UssdConfig>(account.config) : null;
  } catch {
    config = null;
  }
  if (!config || !secretsMatch(config.webhookSecret, secretHeader)) {
    // A USSD gateway shows the raw body on error screens; keep it terse.
    return { status: 403, body: "END Not authorized" };
  }

  const { phone, text, sessionId } = parseInbound(fields);
  if (!phone) return { status: 200, body: "END Missing phone number" };

  if (!text) {
    // Dial-in, nothing typed yet: the greeting doubles as the prompt.
    return {
      status: 200,
      body: screen(
        "CON",
        t(organization.defaultLanguage, "greeting", { org: organization.name }),
      ),
    };
  }

  const replies: string[] = [];
  const result = await channelReply({
    db,
    organization,
    channel: "USSD",
    externalUserId: phone,
    text,
    // A gateway that retries a session step re-sends the same sessionId and
    // input path; the session id scopes the dedup to this dialogue.
    externalMessageId: sessionId ? `ussd:${sessionId}:${text.slice(0, 32)}` : undefined,
    send: (body) => {
      replies.push(body);
      return Promise.resolve(true);
    },
  });

  // New ticket → the ack (with the ticket number) closes the session.
  // Threaded onto an existing ticket → the message_received closing, because
  // a USSD screen is the only reply surface this session will ever have.
  let closing = replies[0];
  if (closing === undefined) {
    const number = result.duplicate ? undefined : result.ticketNumber;
    closing =
      number === undefined
        ? t(organization.defaultLanguage, "greeting", { org: organization.name })
        : t(organization.defaultLanguage, "message_received", {
            number,
          });
  }
  return { status: 200, body: screen("END", closing) };
}

/** True when this org has a USSD gateway configured — the catalogue's test. */
export async function ussdConnected(
  db: PrismaClient,
  organizationId: string,
): Promise<boolean> {
  const account = await db.channelAccount.findFirst({
    where: {
      organizationId,
      kind: ChannelAccountKind.USSD_GATEWAY,
      active: true,
    },
  });
  if (!account) return false;
  try {
    return Boolean(openChannelConfig<UssdConfig>(account.config).webhookSecret);
  } catch {
    return false;
  }
}
