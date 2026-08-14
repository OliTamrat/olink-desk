// Viber Channels API — ported from Bank Assist. Same shape as the Telegram
// adapter, but three of Viber's differences are load-bearing and each is a
// silent failure if missed:
//
// 1. A Viber error arrives as HTTP 200. Every call returns 200 and reports
//    success in a JSON `status` field, where 0 is OK. Checking only the HTTP
//    status reports a send as successful when the token was rejected or the
//    account is not live — `bodyOk()` checks the body.
// 2. The signature key is the auth token itself: HMAC-SHA256 over the RAW
//    request body, hex digest in X-Viber-Content-Signature. There is no
//    separate webhook secret, which is why the config holds one credential.
// 3. `sender.name` is required on every message — a send without it is
//    rejected, as a 200, per (1).
import { createHmac } from "node:crypto";

import type { Organization, PrismaClient } from "@olink-desk/database";
import { ChannelAccountKind } from "@olink-desk/database";
import { t } from "@olink-desk/i18n";

import { openChannelConfig, sealChannelConfig, secretsMatch } from "./crypto";
import { channelReply } from "./reply";

const API = "https://chatapi.viber.com/pa";
const REQUEST_TIMEOUT_MS = 15_000;

// Viber rejects a text message over 7,000 characters. Truncating is the
// lesser harm: a clipped reply is visibly clipped, a dropped one looks like
// the desk ignored the customer.
export const MAX_TEXT = 7000;

// Delivery/read receipts are requested away; "webhook" (Viber's validation
// ping) is always delivered whether or not it is requested.
const EVENT_TYPES = ["message", "subscribed", "unsubscribed", "conversation_started"];

export interface ViberConfig {
  authToken: string;
}

export function signature(authToken: string, body: string | Buffer): string {
  return createHmac("sha256", authToken).update(body).digest("hex");
}

/**
 * Constant-time check of an inbound webhook. Fails closed on a missing
 * token: an unconfigured tenant must not accept unsigned traffic, and HMAC
 * with an empty key would otherwise produce a perfectly checkable signature
 * for anyone who guessed the empty string.
 */
export function validSignature(
  authToken: string | undefined,
  rawBody: string | Buffer,
  header: string | null,
): boolean {
  if (!authToken || !header) return false;
  return secretsMatch(signature(authToken, rawBody), header);
}

function bodyOk(body: unknown): boolean {
  const status = (body as { status?: unknown } | null)?.status;
  if (status !== 0) {
    console.warn(
      JSON.stringify({
        event: "viber_call_failed",
        status,
        message: (body as { status_message?: unknown } | null)?.status_message,
      }),
    );
    return false;
  }
  return true;
}

/** Send a reply. Failures logged, never raised — a non-2xx makes Viber retry
 * the delivery, re-running the pipeline on every retry. */
export async function sendMessage(
  authToken: string,
  receiver: string,
  text: string,
  senderName: string,
): Promise<boolean> {
  try {
    const resp = await fetch(`${API}/send_message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Viber-Auth-Token": authToken,
      },
      body: JSON.stringify({
        receiver,
        type: "text",
        text: text.slice(0, MAX_TEXT),
        sender: { name: senderName.slice(0, 28) },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn(
        JSON.stringify({ event: "viber_send_failed", status: resp.status }),
      );
      return false;
    }
    return bodyOk(await resp.json().catch(() => null));
  } catch (err) {
    console.warn(
      JSON.stringify({ event: "viber_send_failed", error: String(err) }),
    );
    return false;
  }
}

/** Register the webhook. DOES raise — this runs inside an operator's
 * "Connect" click, and a bad token must be reported to the person pasting
 * it. Viber validates by immediately POSTing a `webhook` event to the URL
 * and refuses registration unless that call returns 200. */
export async function setWebhook(
  authToken: string,
  url: string,
): Promise<unknown> {
  const resp = await fetch(`${API}/set_webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Viber-Auth-Token": authToken,
    },
    body: JSON.stringify({ url, event_types: EVENT_TYPES }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body: unknown = await resp.json().catch(() => null);
  const status = (body as { status?: unknown } | null)?.status;
  if (!resp.ok || status !== 0) {
    const message =
      (body as { status_message?: unknown } | null)?.status_message ??
      "unknown error";
    throw new Error(`Viber rejected the webhook: ${String(message)}`);
  }
  return body;
}

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * The whole inbound webhook, framework-agnostic. Takes the RAW body — the
 * signature covers the exact bytes Viber sent; re-serialising parsed JSON
 * produces a different string and fails every check.
 */
export async function handleViberWebhook(opts: {
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

  const account = await db.channelAccount.findFirst({
    where: {
      organizationId: organization.id,
      kind: ChannelAccountKind.VIBER_BOT,
      active: true,
    },
  });
  const config = account
    ? openChannelConfig<ViberConfig>(account.config)
    : null;
  if (!config || !validSignature(config.authToken, rawBody, signatureHeader)) {
    return { status: 403, body: { error: "Bad webhook signature" } };
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody || "{}") as Record<string, unknown>;
  } catch {
    // Signature-valid but unparseable must not be a 500 — a 500 makes Viber
    // retry the same broken body indefinitely.
    console.warn(JSON.stringify({ event: "viber_body_not_json" }));
    return { status: 200, body: { ok: true } };
  }
  const kind = event.event;

  // Viber's validation ping (sent the moment setWebhook is called, before
  // any customer exists) must return 200 or registration fails. Receipts and
  // unsubscribes carry nothing to thread.
  if (
    kind === "webhook" ||
    kind === "delivered" ||
    kind === "seen" ||
    kind === "failed" ||
    kind === "unsubscribed"
  ) {
    return { status: 200, body: { ok: true } };
  }

  // Viber's analogue of /start: the customer opened the chat and has typed
  // nothing. `user` carries identity here; `message` events use `sender`.
  if (kind === "conversation_started") {
    const receiver = (event.user as { id?: unknown } | undefined)?.id;
    if (typeof receiver === "string" && receiver) {
      await sendMessage(
        config.authToken,
        receiver,
        t(organization.defaultLanguage, "greeting", { org: organization.name }),
        organization.name,
      );
    }
    return { status: 200, body: { ok: true } };
  }

  if (kind !== "message") return { status: 200, body: { ok: true } };

  const message = (event.message ?? {}) as { text?: unknown };
  const sender = (event.sender ?? {}) as { id?: unknown };
  const text = message.text;
  const senderId = sender.id;
  // Stickers, images and location shares arrive as `message` events with no
  // text — nothing for the desk to thread.
  if (typeof text !== "string" || !text || typeof senderId !== "string" || !senderId) {
    return { status: 200, body: { ok: true } };
  }

  const messageToken = event.message_token;
  await channelReply({
    db,
    organization,
    channel: "VIBER",
    externalUserId: senderId,
    text,
    externalMessageId:
      messageToken !== undefined && messageToken !== null
        ? `vb:${String(messageToken)}`
        : undefined,
    send: (body) =>
      sendMessage(config.authToken, senderId, body, organization.name),
  });
  return { status: 200, body: { ok: true } };
}

/** True when this org can SEND on Viber — the catalogue's "live" test. */
export async function viberConnected(
  db: PrismaClient,
  organizationId: string,
): Promise<boolean> {
  const account = await db.channelAccount.findFirst({
    where: {
      organizationId,
      kind: ChannelAccountKind.VIBER_BOT,
      active: true,
    },
  });
  if (!account) return false;
  try {
    return Boolean(openChannelConfig<ViberConfig>(account.config).authToken);
  } catch {
    return false;
  }
}

/**
 * Connect a Viber bot token. Committed BEFORE setWebhook, because Viber
 * validates the registration by immediately POSTing a `webhook` event that
 * arrives as a separate request — an unstored token would fail its signature
 * check with a 403 and the connect could never succeed. On rejection the
 * previous state is restored.
 */
export async function connectViber(opts: {
  db: PrismaClient;
  organization: Organization;
  authToken: string;
  appBaseUrl: string;
}): Promise<{ webhookUrl: string }> {
  const { db, organization, authToken, appBaseUrl } = opts;
  const webhookUrl = `${appBaseUrl}/api/webhooks/viber/${organization.slug}`;
  const sealed = sealChannelConfig({ authToken });

  const previous = await db.channelAccount.findFirst({
    where: {
      organizationId: organization.id,
      kind: ChannelAccountKind.VIBER_BOT,
    },
  });
  const account = previous
    ? await db.channelAccount.update({
        where: { id: previous.id },
        data: { config: sealed, active: true },
      })
    : await db.channelAccount.create({
        data: {
          organizationId: organization.id,
          kind: ChannelAccountKind.VIBER_BOT,
          label: "Viber bot",
          config: sealed,
        },
      });

  try {
    await setWebhook(authToken, webhookUrl);
  } catch (err) {
    if (previous) {
      await db.channelAccount.update({
        where: { id: account.id },
        data: { config: previous.config as object, active: previous.active },
      });
    } else {
      await db.channelAccount.delete({ where: { id: account.id } });
    }
    throw err;
  }

  await db.auditLog.create({
    data: {
      organizationId: organization.id,
      action: "channel.viber_connected",
      entityType: "channel_account",
      entityId: String(account.id),
      metadata: { webhookUrl },
    },
  });
  return { webhookUrl };
}
