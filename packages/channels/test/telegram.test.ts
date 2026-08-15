// Telegram adapter contract tests — driving the real webhook handler with the
// payload shapes Telegram documents, against a real database. Outbound fetch
// is stubbed: the contract under test is ours, not Telegram's uptime.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sealChannelConfig } from "../src/crypto";
import { handleTelegramWebhook, parseUpdate, telegramStatus } from "../src/telegram";
import { createOrg, prisma } from "./helpers";

const SECRET = "s3cret-webhook-token";

function textUpdate(text: string, messageId = 1, chatId = 42) {
  return { message: { message_id: messageId, chat: { id: chatId }, text } };
}

async function connectedOrg() {
  const org = await createOrg({ name: "Acme Support" });
  await prisma.channelAccount.create({
    data: {
      organizationId: org.id,
      kind: "TELEGRAM_BOT",
      label: "Telegram bot",
      config: sealChannelConfig({
        botToken: "12345:token",
        webhookSecret: SECRET,
      }),
    },
  });
  return org;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("parseUpdate", () => {
  it("extracts a text message", () => {
    expect(parseUpdate(textUpdate("hello", 7, 99))).toEqual({
      kind: "message",
      chatId: 99,
      messageId: 7,
      text: "hello",
    });
  });

  it("treats /start as a command, deep-link payload included", () => {
    expect(parseUpdate(textUpdate("/start"))).toMatchObject({ kind: "start" });
    expect(parseUpdate(textUpdate("/start ref123"))).toMatchObject({
      kind: "start",
    });
  });

  it("ignores non-text updates", () => {
    expect(parseUpdate({ message: { chat: { id: 1 }, sticker: {} } })).toEqual({
      kind: "ignore",
    });
    expect(parseUpdate({ edited_message: {} })).toEqual({ kind: "ignore" });
    expect(parseUpdate(null)).toEqual({ kind: "ignore" });
  });
});

describe("handleTelegramWebhook", () => {
  it("404s an unknown organization", async () => {
    const result = await handleTelegramWebhook({
      db: prisma,
      orgSlug: "no-such-org",
      secretHeader: SECRET,
      update: textUpdate("hi"),
    });
    expect(result.status).toBe(404);
  });

  it("fails closed with no connected account", async () => {
    const org = await createOrg();
    const result = await handleTelegramWebhook({
      db: prisma,
      orgSlug: org.slug,
      secretHeader: "anything",
      update: textUpdate("hi"),
    });
    expect(result.status).toBe(403);
  });

  it("rejects a wrong or missing secret", async () => {
    const org = await connectedOrg();
    for (const secretHeader of ["wrong", "", null]) {
      const result = await handleTelegramWebhook({
        db: prisma,
        orgSlug: org.slug,
        secretHeader,
        update: textUpdate("hi"),
      });
      expect(result.status).toBe(403);
    }
  });

  it("threads a text message and sends the ack through the bot API", async () => {
    const org = await connectedOrg();
    const result = await handleTelegramWebhook({
      db: prisma,
      orgSlug: org.slug,
      secretHeader: SECRET,
      update: textUpdate("my delivery is late", 100),
    });
    expect(result.status).toBe(200);

    const ticket = await prisma.ticket.findFirst({
      where: { organizationId: org.id },
    });
    expect(ticket).not.toBeNull();
    expect(ticket!.channel).toBe("TELEGRAM");
    const stored = await prisma.ticketMessage.findFirst({
      where: { organizationId: org.id, externalId: "tg:42:100" },
    });
    expect(stored?.body).toBe("my delivery is late");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("sendMessage");
    expect(JSON.parse(String(init.body)).text).toContain("Acme Support");
  });

  it("answers /start with the greeting and opens no ticket", async () => {
    const org = await connectedOrg();
    const result = await handleTelegramWebhook({
      db: prisma,
      orgSlug: org.slug,
      secretHeader: SECRET,
      update: textUpdate("/start"),
    });
    expect(result.status).toBe(200);
    expect(await prisma.ticket.count({ where: { organizationId: org.id } })).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).text).toContain("Acme Support");
  });

  it("acknowledges non-text updates without acting on them", async () => {
    const org = await connectedOrg();
    const result = await handleTelegramWebhook({
      db: prisma,
      orgSlug: org.slug,
      secretHeader: SECRET,
      update: { message: { chat: { id: 42 }, photo: [{}] } },
    });
    expect(result.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is idempotent across Telegram redeliveries of one update", async () => {
    const org = await connectedOrg();
    const update = textUpdate("hello again", 555);
    for (let i = 0; i < 2; i += 1) {
      await handleTelegramWebhook({
        db: prisma,
        orgSlug: org.slug,
        secretHeader: SECRET,
        update,
      });
    }
    expect(
      await prisma.ticketMessage.count({
        where: { organizationId: org.id, externalId: "tg:42:555" },
      }),
    ).toBe(1);
    expect(await prisma.ticket.count({ where: { organizationId: org.id } })).toBe(1);
  });

  it("a Telegram outage never fails the webhook", async () => {
    const org = await connectedOrg();
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const result = await handleTelegramWebhook({
      db: prisma,
      orgSlug: org.slug,
      secretHeader: SECRET,
      update: textUpdate("hello during outage", 9),
    });
    expect(result.status).toBe(200);
    // Inbound stored; no outbound ack recorded for a send that failed.
    const ticket = await prisma.ticket.findFirst({
      where: { organizationId: org.id },
    });
    expect(ticket).not.toBeNull();
    expect(
      await prisma.ticketMessage.count({
        where: { ticketId: ticket!.id, direction: "OUTBOUND" },
      }),
    ).toBe(0);
  });
});

// telegramStatus asks Telegram getMe + getWebhookInfo with the stored token.
// The contract that matters: a revoked token reads tokenValid=false (the
// silent-bot case this probe exists for), an unreachable Telegram reads
// tokenValid=null (unknown, not invalid), and the token itself never appears
// in the result.
describe("telegramStatus", () => {
  const APP = "https://desk.example.com";

  function telegramApi(handlers: {
    getMe?: () => unknown;
    getWebhookInfo?: () => unknown;
  }) {
    fetchMock.mockImplementation((url: string) => {
      const body = url.includes("getMe")
        ? handlers.getMe?.()
        : handlers.getWebhookInfo?.();
      return Promise.resolve(
        new Response(JSON.stringify(body ?? { ok: false }), { status: 200 }),
      );
    });
  }

  it("reports not-connected with no account and calls nothing", async () => {
    const org = await createOrg();
    const status = await telegramStatus({
      db: prisma,
      organization: org,
      appBaseUrl: APP,
    });
    expect(status.connected).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a healthy connection with the registered webhook matching", async () => {
    const org = await connectedOrg();
    const expectedUrl = `${APP}/api/webhooks/telegram/${org.slug}`;
    telegramApi({
      getMe: () => ({ ok: true, result: { username: "Olink_Desk_Bot" } }),
      getWebhookInfo: () => ({
        ok: true,
        result: { url: expectedUrl, pending_update_count: 0 },
      }),
    });
    const status = await telegramStatus({
      db: prisma,
      organization: org,
      appBaseUrl: APP,
    });
    expect(status).toMatchObject({
      connected: true,
      tokenValid: true,
      botUsername: "Olink_Desk_Bot",
      webhookMatches: true,
      registeredWebhookUrl: expectedUrl,
    });
    expect(JSON.stringify(status)).not.toContain("12345:token");
  });

  it("reports a revoked token as invalid, not as unknown", async () => {
    const org = await connectedOrg();
    telegramApi({
      getMe: () => ({ ok: false, error_code: 401, description: "Unauthorized" }),
    });
    const status = await telegramStatus({
      db: prisma,
      organization: org,
      appBaseUrl: APP,
    });
    expect(status.connected).toBe(true);
    expect(status.tokenValid).toBe(false);
    // Only getMe was called — no point asking for webhook info with a dead token.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces a webhook pointed elsewhere and Telegram's last error", async () => {
    const org = await connectedOrg();
    telegramApi({
      getMe: () => ({ ok: true, result: { username: "Olink_Desk_Bot" } }),
      getWebhookInfo: () => ({
        ok: true,
        result: {
          url: "https://old-host.example.com/hook",
          pending_update_count: 7,
          last_error_message: "Wrong response from the webhook: 403 Forbidden",
        },
      }),
    });
    const status = await telegramStatus({
      db: prisma,
      organization: org,
      appBaseUrl: APP,
    });
    expect(status.webhookMatches).toBe(false);
    expect(status.pendingUpdates).toBe(7);
    expect(status.lastErrorMessage).toContain("403");
  });

  it("an unreachable Telegram reads unknown (null), never invalid", async () => {
    const org = await connectedOrg();
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const status = await telegramStatus({
      db: prisma,
      organization: org,
      appBaseUrl: APP,
    });
    expect(status.connected).toBe(true);
    expect(status.tokenValid).toBeNull();
    expect(status.probeError).toContain("ECONNRESET");
  });
});
