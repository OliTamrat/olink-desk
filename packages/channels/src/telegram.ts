// Telegram: the reference channel adapter, ported from Bank Assist.
// An adapter is transport only — everything shared lives in channelReply().
import type { Organization, PrismaClient } from "@olink-desk/database";
import { ChannelAccountKind } from "@olink-desk/database";
import { t } from "@olink-desk/i18n";

import { openChannelConfig, sealChannelConfig, secretsMatch } from "./crypto";
import { channelReply } from "./reply";

const API = "https://api.telegram.org";
const REQUEST_TIMEOUT_MS = 15_000;

export interface TelegramConfig {
  botToken: string;
  /** Our secret, echoed back by Telegram in X-Telegram-Bot-Api-Secret-Token. */
  webhookSecret: string;
}

/**
 * Send a reply. Failures are logged, never raised — a Telegram outage must
 * not 500 the webhook (Telegram would retry the whole update).
 */
export async function sendMessage(
  botToken: string,
  chatId: number | string,
  text: string,
): Promise<boolean> {
  try {
    const resp = await fetch(`${API}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn(
        JSON.stringify({ event: "telegram_send_failed", status: resp.status }),
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      JSON.stringify({ event: "telegram_send_failed", error: String(err) }),
    );
    return false;
  }
}

/** Register this service as the bot's webhook. Throws on rejection — the
 * connect flow needs the provider's error to surface to the operator. */
export async function setWebhook(
  botToken: string,
  url: string,
  secret: string,
): Promise<unknown> {
  const resp = await fetch(`${API}/bot${botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: secret,
      allowed_updates: ["message"],
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body: unknown = await resp.json().catch(() => null);
  if (!resp.ok || !(body as { ok?: boolean } | null)?.ok) {
    throw new Error(`Telegram rejected the webhook: ${JSON.stringify(body)}`);
  }
  return body;
}

export type ParsedUpdate =
  | { kind: "start"; chatId: number | string }
  | { kind: "message"; chatId: number | string; messageId: number; text: string }
  | { kind: "ignore" };

/**
 * What Telegram sent, reduced to what the desk cares about. Non-text updates
 * (stickers, photos, joins) are ignored: there is nothing to thread, and
 * acknowledging anyway would answer a question nobody asked. `/start` is
 * Telegram's own "open the bot" command, not something the customer typed to
 * ask for help — split, because Telegram appends deep-link payloads
 * ("/start ref123").
 */
export function parseUpdate(update: unknown): ParsedUpdate {
  const message = (update as { message?: unknown } | null)?.message as
    | { text?: unknown; message_id?: unknown; chat?: { id?: unknown } }
    | undefined;
  const text = message?.text;
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;
  if (
    typeof text !== "string" ||
    (typeof chatId !== "number" && typeof chatId !== "string") ||
    typeof messageId !== "number"
  ) {
    return { kind: "ignore" };
  }
  if (text.split(/\s+/, 1)[0] === "/start") {
    return { kind: "start", chatId };
  }
  return { kind: "message", chatId, messageId, text };
}

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * The whole inbound webhook, transport-agnostic of the HTTP framework: the
 * Next.js route hands in the org slug, the secret header, and the parsed
 * JSON, and returns whatever this says. Keeping it here means the contract
 * tests drive the real path without a web server.
 */
export async function handleTelegramWebhook(opts: {
  db: PrismaClient;
  orgSlug: string;
  secretHeader: string | null;
  update: unknown;
}): Promise<WebhookResult> {
  const { db, orgSlug, secretHeader, update } = opts;
  const organization = await db.organization.findUnique({
    where: { slug: orgSlug },
  });
  if (!organization) return { status: 404, body: { error: "Unknown organization" } };

  const config = await activeTelegramConfig(db, organization.id);
  // Fail closed: no connected account, or a wrong secret, accepts nothing.
  if (!config || !secretsMatch(config.webhookSecret, secretHeader)) {
    return { status: 403, body: { error: "Bad webhook secret" } };
  }

  const parsed = parseUpdate(update);
  if (parsed.kind === "ignore") return { status: 200, body: { ok: true } };

  if (parsed.kind === "start") {
    await sendMessage(
      config.botToken,
      parsed.chatId,
      t(organization.defaultLanguage, "greeting", { org: organization.name }),
    );
    return { status: 200, body: { ok: true } };
  }

  await channelReply({
    db,
    organization,
    channel: "TELEGRAM",
    externalUserId: String(parsed.chatId),
    text: parsed.text,
    externalMessageId: `tg:${parsed.chatId}:${parsed.messageId}`,
    send: (body) => sendMessage(config.botToken, parsed.chatId, body),
  });
  return { status: 200, body: { ok: true } };
}

async function activeTelegramConfig(
  db: PrismaClient,
  organizationId: string,
): Promise<TelegramConfig | null> {
  const account = await db.channelAccount.findFirst({
    where: {
      organizationId,
      kind: ChannelAccountKind.TELEGRAM_BOT,
      active: true,
    },
  });
  if (!account) return null;
  return openChannelConfig<TelegramConfig>(account.config);
}

/** True when this org can SEND on Telegram — the catalogue's "live" test. */
export async function telegramConnected(
  db: PrismaClient,
  organizationId: string,
): Promise<boolean> {
  const config = await activeTelegramConfig(db, organizationId).catch(
    () => null,
  );
  return Boolean(config?.botToken);
}

export interface TelegramStatus {
  connected: boolean;
  /** null = Telegram unreachable, so validity is unknown — not "invalid". */
  tokenValid: boolean | null;
  botUsername: string | null;
  expectedWebhookUrl: string;
  registeredWebhookUrl: string | null;
  webhookMatches: boolean | null;
  pendingUpdates: number | null;
  lastErrorMessage: string | null;
  probeError: string | null;
}

/**
 * Live health of a tenant's Telegram connection, asked of Telegram itself:
 * does the stored token still work (getMe), and is the webhook actually
 * pointed at us (getWebhookInfo)? This exists because both failures are
 * invisible from the inside — a token revoked in BotFather after connect
 * leaves our record looking fine while every send silently dies. The token
 * never leaves this function.
 */
export async function telegramStatus(opts: {
  db: PrismaClient;
  organization: Organization;
  appBaseUrl: string;
}): Promise<TelegramStatus> {
  const { db, organization, appBaseUrl } = opts;
  const expectedWebhookUrl = `${appBaseUrl}/api/webhooks/telegram/${organization.slug}`;
  const status: TelegramStatus = {
    connected: false,
    tokenValid: null,
    botUsername: null,
    expectedWebhookUrl,
    registeredWebhookUrl: null,
    webhookMatches: null,
    pendingUpdates: null,
    lastErrorMessage: null,
    probeError: null,
  };

  const config = await activeTelegramConfig(db, organization.id).catch(() => null);
  if (!config?.botToken) return status;
  status.connected = true;

  try {
    const me = await fetch(`${API}/bot${config.botToken}/getMe`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const meBody = (await me.json().catch(() => null)) as
      | { ok?: boolean; result?: { username?: string } }
      | null;
    status.tokenValid = Boolean(meBody?.ok);
    status.botUsername = meBody?.result?.username ?? null;
  } catch (err) {
    status.probeError = String(err);
    return status;
  }
  if (!status.tokenValid) return status;

  try {
    const info = await fetch(`${API}/bot${config.botToken}/getWebhookInfo`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const infoBody = (await info.json().catch(() => null)) as
      | {
          ok?: boolean;
          result?: {
            url?: string;
            pending_update_count?: number;
            last_error_message?: string;
          };
        }
      | null;
    if (infoBody?.ok && infoBody.result) {
      status.registeredWebhookUrl = infoBody.result.url || null;
      status.webhookMatches = infoBody.result.url === expectedWebhookUrl;
      status.pendingUpdates = infoBody.result.pending_update_count ?? null;
      status.lastErrorMessage = infoBody.result.last_error_message ?? null;
    }
  } catch (err) {
    status.probeError = String(err);
  }
  return status;
}

/**
 * Connect a BotFather token for a tenant. The credential is stored and
 * committed BEFORE setWebhook is called, because Telegram may validate the
 * registration with a request that arrives on its own connection — an
 * uncommitted credential would fail that check with a 403 and the connect
 * could never succeed. On rejection the previous state is restored, so a
 * failed paste does not silently disconnect a channel that was working.
 */
export async function connectTelegram(opts: {
  db: PrismaClient;
  organization: Organization;
  botToken: string;
  appBaseUrl: string;
}): Promise<{ webhookUrl: string }> {
  const { db, organization, botToken, appBaseUrl } = opts;
  const webhookUrl = `${appBaseUrl}/api/webhooks/telegram/${organization.slug}`;
  const { randomBytes } = await import("node:crypto");
  const webhookSecret = randomBytes(32).toString("hex");
  const sealed = sealChannelConfig({ botToken, webhookSecret });

  const previous = await db.channelAccount.findFirst({
    where: {
      organizationId: organization.id,
      kind: ChannelAccountKind.TELEGRAM_BOT,
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
          kind: ChannelAccountKind.TELEGRAM_BOT,
          label: "Telegram bot",
          config: sealed,
        },
      });

  try {
    await setWebhook(botToken, webhookUrl, webhookSecret);
  } catch (err) {
    // Put back whatever was there.
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
      action: "channel.telegram_connected",
      entityType: "channel_account",
      entityId: String(account.id),
      metadata: { webhookUrl },
    },
  });
  return { webhookUrl };
}
