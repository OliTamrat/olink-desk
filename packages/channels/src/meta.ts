// WhatsApp, Messenger and Instagram Direct — one Meta app, three products.
// Ported from Bank Assist's meta.py, one module for the same reason: Meta is
// one app, one callback URL, one app secret, one signature scheme, one
// webhook envelope. Only the innermost payload and the send call differ.
//
// The handshake: Meta confirms an endpoint by GETting it with hub.mode /
// hub.verify_token / hub.challenge and expects the challenge echoed as BARE
// TEXT — a quoted JSON string does not match, and getting it wrong means the
// callback simply cannot be registered.
//
// The signature: X-Hub-Signature-256 is HMAC-SHA256 over the raw body keyed
// with the APP SECRET — not the access token, which is the mistake worth
// naming because both are long opaque strings sitting next to each other in
// the dashboard.
//
// What is NOT solved here, and cannot be from code: Meta requires a verified
// business, a reviewed use case, and (for WhatsApp) approved templates for
// anything sent first rather than in reply. The point of finishing the code
// anyway is that the day the review clears, the work is credential entry.
import { createHmac } from "node:crypto";

import type { Channel, PrismaClient } from "@olink-desk/database";
import { ChannelAccountKind } from "@olink-desk/database";

import { openChannelConfig } from "./crypto";
import { channelReply } from "./reply";
import { secretsMatch } from "./crypto";

// Pinned deliberately: Meta deprecates versions on a schedule, and an
// unpinned "latest" turns their calendar into our outage.
export const API_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;
const REQUEST_TIMEOUT_MS = 15_000;

// `object` in the webhook envelope -> our channel.
const OBJECT_TO_CHANNEL: Record<string, Channel> = {
  whatsapp_business_account: "WHATSAPP",
  page: "MESSENGER",
  instagram: "INSTAGRAM",
};

// WhatsApp rejects a body over 4,096 characters; Messenger and Instagram cut
// off at 2,000. Truncation is visible and recoverable; a rejected send is
// silent and is not.
export const MAX_TEXT: Record<string, number> = {
  WHATSAPP: 4096,
  MESSENGER: 2000,
  INSTAGRAM: 2000,
};

const META_KINDS: Record<string, ChannelAccountKind> = {
  WHATSAPP: ChannelAccountKind.META_WHATSAPP,
  MESSENGER: ChannelAccountKind.META_MESSENGER,
  INSTAGRAM: ChannelAccountKind.META_INSTAGRAM,
};

export interface MetaConfig {
  appSecret: string;
  verifyToken: string;
  accessToken: string;
  /** WhatsApp only: the Cloud API phone number id sends go through. */
  phoneNumberId?: string;
}

/**
 * Constant-time check of X-Hub-Signature-256, failing closed on a missing
 * secret or header — HMAC with an empty key is still perfectly valid, so an
 * unconfigured tenant would otherwise accept anything signed with "".
 * Compares the whole `sha256=<hex>` string so a header that omits the prefix
 * does not match a bare digest.
 */
export function validSignature(
  appSecret: string | undefined,
  rawBody: string | Buffer,
  header: string | null,
): boolean {
  if (!appSecret || !header) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return secretsMatch(`sha256=${expected}`, header);
}

/** The GET subscription handshake: the challenge to echo as bare text, or
 * null. Fails closed on an unset expected token so an unconfigured tenant's
 * callback cannot be claimed by whoever guesses the slug. */
export function verifyHandshake(opts: {
  mode: string;
  token: string;
  challenge: string;
  expectedToken: string | undefined;
}): string | null {
  const { mode, token, challenge, expectedToken } = opts;
  if (!expectedToken || mode !== "subscribe") return null;
  if (!secretsMatch(expectedToken, token)) return null;
  return challenge;
}

// ------------------------------------------------------------------ inbound

export interface InboundText {
  sender: string;
  text: string;
  /** Channel-side message id (WhatsApp wamid / messaging mid) for dedup. */
  messageId?: string;
}

type Entry = Record<string, unknown>;

function textsFromWhatsApp(entry: Entry): InboundText[] {
  // Statuses (sent/delivered/read) arrive in this same envelope under
  // value.statuses with no `messages` key — not someone talking. Images,
  // audio, location and button replies appear with no `text`.
  const out: InboundText[] = [];
  for (const change of (entry.changes as Entry[] | undefined) ?? []) {
    const value = (change.value ?? {}) as Entry;
    for (const message of (value.messages as Entry[] | undefined) ?? []) {
      const body = ((message.text ?? {}) as { body?: unknown }).body;
      const sender = message.from;
      if (typeof body === "string" && body && sender) {
        out.push({
          sender: String(sender),
          text: body,
          messageId: typeof message.id === "string" ? message.id : undefined,
        });
      }
    }
  }
  return out;
}

function textsFromMessaging(entry: Entry): InboundText[] {
  // `is_echo` marks a message the page itself sent — including the replies
  // this service just sent. Treating one as inbound makes the desk answer
  // its own ack forever: the single most expensive mistake available here.
  const out: InboundText[] = [];
  for (const event of (entry.messaging as Entry[] | undefined) ?? []) {
    const message = (event.message ?? {}) as Entry;
    if (message.is_echo) continue;
    const text = message.text;
    const sender = ((event.sender ?? {}) as { id?: unknown }).id;
    if (typeof text === "string" && text && sender) {
      out.push({
        sender: String(sender),
        text,
        messageId: typeof message.mid === "string" ? message.mid : undefined,
      });
    }
  }
  return out;
}

/** (channel, texts) for any Meta webhook body. Null channel for an object we
 * do not serve, so an app subscribed to extra products cannot drive traffic
 * into the wrong one. */
export function inbound(payload: Entry): {
  channel: Channel | null;
  texts: InboundText[];
} {
  const channel = OBJECT_TO_CHANNEL[String(payload.object)] ?? null;
  if (channel === null) return { channel: null, texts: [] };
  const reader = channel === "WHATSAPP" ? textsFromWhatsApp : textsFromMessaging;
  const texts: InboundText[] = [];
  for (const entry of (payload.entry as Entry[] | undefined) ?? []) {
    texts.push(...reader(entry));
  }
  return { channel, texts };
}

// ----------------------------------------------------------------- outbound

/** Send, log failures, never raise. Meta responds to repeated non-2xx by
 * retrying and eventually disabling the subscription — one bad token could
 * silently switch the channel off. */
async function post(url: string, token: string, body: unknown): Promise<boolean> {
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn(
        JSON.stringify({ event: "meta_send_failed", status: resp.status }),
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      JSON.stringify({ event: "meta_send_failed", error: String(err) }),
    );
    return false;
  }
}

export function sendWhatsApp(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  text: string,
): Promise<boolean> {
  return post(`${GRAPH}/${phoneNumberId}/messages`, accessToken, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body: text.slice(0, MAX_TEXT.WHATSAPP) },
  });
}

/** Messenger and Instagram share one endpoint and one body shape.
 * `messaging_type: RESPONSE` keeps the send inside the standard messaging
 * window without a paid template — correct because the desk only ever
 * replies, never messages a customer first. */
export function sendMessaging(
  accessToken: string,
  to: string,
  text: string,
  channel: Channel,
): Promise<boolean> {
  return post(`${GRAPH}/me/messages`, accessToken, {
    recipient: { id: to },
    messaging_type: "RESPONSE",
    message: { text: text.slice(0, MAX_TEXT[channel] ?? 2000) },
  });
}

// ------------------------------------------------------------------ webhook

export interface WebhookResult {
  status: number;
  body: string | Record<string, unknown>;
}

async function metaAccounts(db: PrismaClient, organizationId: string) {
  return db.channelAccount.findMany({
    where: {
      organizationId,
      kind: {
        in: [
          ChannelAccountKind.META_WHATSAPP,
          ChannelAccountKind.META_MESSENGER,
          ChannelAccountKind.META_INSTAGRAM,
        ],
      },
      active: true,
    },
  });
}

/** Meta's GET handshake for one tenant. The route must return the body as
 * bare text with status 200 when a string is returned. */
export async function handleMetaVerify(opts: {
  db: PrismaClient;
  orgSlug: string;
  mode: string;
  token: string;
  challenge: string;
}): Promise<WebhookResult> {
  const { db, orgSlug } = opts;
  const organization = await db.organization.findUnique({
    where: { slug: orgSlug },
  });
  if (!organization) return { status: 404, body: { error: "Unknown organization" } };
  for (const account of await metaAccounts(db, organization.id)) {
    let config: MetaConfig;
    try {
      config = openChannelConfig<MetaConfig>(account.config);
    } catch {
      continue;
    }
    const challenge = verifyHandshake({
      mode: opts.mode,
      token: opts.token,
      challenge: opts.challenge,
      expectedToken: config.verifyToken,
    });
    if (challenge !== null) return { status: 200, body: challenge };
  }
  return { status: 403, body: { error: "Bad verify token" } };
}

/** One inbound Meta POST for one tenant, all three products. */
export async function handleMetaWebhook(opts: {
  db: PrismaClient;
  orgSlug: string;
  rawBody: string;
  signatureHeader: string | null;
}): Promise<WebhookResult> {
  const { db, orgSlug, rawBody, signatureHeader } = opts;
  const organization = await db.organization.findUnique({
    where: { slug: orgSlug },
  });
  if (!organization) return { status: 404, body: { error: "Unknown organization" } };

  const accounts = await metaAccounts(db, organization.id);
  const configs = new Map<ChannelAccountKind, MetaConfig>();
  for (const account of accounts) {
    try {
      configs.set(account.kind, openChannelConfig<MetaConfig>(account.config));
    } catch {
      // An unreadable credential is an unconfigured one.
    }
  }
  // The app secret is per Meta app; every product account of one tenant
  // should carry the same one, but verify against each so a half-migrated
  // tenant fails closed rather than open.
  const signatureValid = [...configs.values()].some((c) =>
    validSignature(c.appSecret, rawBody, signatureHeader),
  );
  if (!signatureValid) {
    return { status: 403, body: { error: "Bad webhook signature" } };
  }

  let payload: Entry;
  try {
    payload = JSON.parse(rawBody || "{}") as Entry;
  } catch {
    console.warn(JSON.stringify({ event: "meta_body_not_json" }));
    return { status: 200, body: { ok: true } };
  }

  const { channel, texts } = inbound(payload);
  if (channel === null || texts.length === 0) {
    return { status: 200, body: { ok: true } };
  }
  const config = configs.get(META_KINDS[channel]);
  if (!config) {
    // Signed delivery for a product this tenant has not configured a sender
    // for: acknowledge (Meta must not retry) but thread nothing — a reply
    // could never be sent, which is not "live" to the customer.
    return { status: 200, body: { ok: true } };
  }

  const send =
    channel === "WHATSAPP"
      ? (to: string) => (body: string) =>
          config.phoneNumberId
            ? sendWhatsApp(config.accessToken, config.phoneNumberId, to, body)
            : Promise.resolve(false)
      : (to: string) => (body: string) =>
          sendMessaging(config.accessToken, to, body, channel);

  for (const item of texts) {
    await channelReply({
      db,
      organization,
      channel,
      externalUserId: item.sender,
      text: item.text,
      externalMessageId: item.messageId
        ? `meta:${item.messageId}`
        : undefined,
      send: send(item.sender),
    });
  }
  return { status: 200, body: { ok: true } };
}

/** Which Meta products this org can SEND on — the catalogue's "live" test.
 * WhatsApp needs a phone number id as well as a token: an app secret alone
 * lets a delivery in without letting a reply out. */
export async function metaConnected(
  db: PrismaClient,
  organizationId: string,
): Promise<{ whatsapp: boolean; messenger: boolean; instagram: boolean }> {
  const out = { whatsapp: false, messenger: false, instagram: false };
  for (const account of await metaAccounts(db, organizationId)) {
    let config: MetaConfig;
    try {
      config = openChannelConfig<MetaConfig>(account.config);
    } catch {
      continue;
    }
    if (account.kind === ChannelAccountKind.META_WHATSAPP) {
      out.whatsapp = Boolean(config.accessToken && config.phoneNumberId);
    } else if (account.kind === ChannelAccountKind.META_MESSENGER) {
      out.messenger = Boolean(config.accessToken);
    } else if (account.kind === ChannelAccountKind.META_INSTAGRAM) {
      out.instagram = Boolean(config.accessToken);
    }
  }
  return out;
}
