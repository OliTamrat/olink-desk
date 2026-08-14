// Telegram adapter contract tests — driving the real webhook handler with the
// payload shapes Telegram documents, against a real database. Outbound fetch
// is stubbed: the contract under test is ours, not Telegram's uptime.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sealChannelConfig } from "../src/crypto";
import { handleTelegramWebhook, parseUpdate } from "../src/telegram";
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
