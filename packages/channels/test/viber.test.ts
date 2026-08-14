// Viber adapter contract tests — including the three quirks the reference
// implementation names: errors as HTTP 200, the token as the signature key,
// and the required sender name.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sealChannelConfig } from "../src/crypto";
import {
  handleViberWebhook,
  signature,
  validSignature,
} from "../src/viber";
import { createOrg, prisma } from "./helpers";

const TOKEN = "viber-auth-token-0001";

async function connectedOrg() {
  const org = await createOrg({ name: "Acme Support" });
  await prisma.channelAccount.create({
    data: {
      organizationId: org.id,
      kind: "VIBER_BOT",
      label: "Viber bot",
      config: sealChannelConfig({ authToken: TOKEN }),
    },
  });
  return org;
}

function signed(body: Record<string, unknown>) {
  const rawBody = JSON.stringify(body);
  return { rawBody, header: signature(TOKEN, rawBody) };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ status: 0 }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("validSignature", () => {
  it("fails closed on a missing token or header", () => {
    expect(validSignature(undefined, "body", "abc")).toBe(false);
    expect(validSignature("", "body", "abc")).toBe(false);
    expect(validSignature(TOKEN, "body", null)).toBe(false);
  });

  it("accepts only the digest over the exact bytes", () => {
    expect(validSignature(TOKEN, "body", signature(TOKEN, "body"))).toBe(true);
    expect(validSignature(TOKEN, "body ", signature(TOKEN, "body"))).toBe(false);
    expect(validSignature("other", "body", signature(TOKEN, "body"))).toBe(false);
  });
});

describe("handleViberWebhook", () => {
  it("rejects an unsigned delivery, fails closed unconfigured", async () => {
    const org = await connectedOrg();
    const result = await handleViberWebhook({
      db: prisma,
      orgSlug: org.slug,
      rawBody: JSON.stringify({ event: "message" }),
      signatureHeader: "wrong",
    });
    expect(result.status).toBe(403);

    const bare = await createOrg();
    const { rawBody, header } = signed({ event: "message" });
    const unconfigured = await handleViberWebhook({
      db: prisma,
      orgSlug: bare.slug,
      rawBody,
      signatureHeader: header,
    });
    expect(unconfigured.status).toBe(403);
  });

  it("answers the validation ping and receipts with 200 and no action", async () => {
    const org = await connectedOrg();
    for (const kind of ["webhook", "delivered", "seen", "failed", "unsubscribed"]) {
      const { rawBody, header } = signed({ event: kind });
      const result = await handleViberWebhook({
        db: prisma,
        orgSlug: org.slug,
        rawBody,
        signatureHeader: header,
      });
      expect(result.status).toBe(200);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await prisma.ticket.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it("greets on conversation_started with the sender name set", async () => {
    const org = await connectedOrg();
    const { rawBody, header } = signed({
      event: "conversation_started",
      user: { id: "viber-user-1" },
    });
    const result = await handleViberWebhook({
      db: prisma,
      orgSlug: org.slug,
      rawBody,
      signatureHeader: header,
    });
    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.sender.name).toBe("Acme Support");
    expect(body.text).toContain("Acme Support");
  });

  it("threads a message and dedups on message_token", async () => {
    const org = await connectedOrg();
    const event = {
      event: "message",
      message_token: 987654,
      sender: { id: "viber-user-2" },
      message: { type: "text", text: "my parcel is missing" },
    };
    for (let i = 0; i < 2; i += 1) {
      const { rawBody, header } = signed(event);
      const result = await handleViberWebhook({
        db: prisma,
        orgSlug: org.slug,
        rawBody,
        signatureHeader: header,
      });
      expect(result.status).toBe(200);
    }
    expect(
      await prisma.ticketMessage.count({
        where: { organizationId: org.id, externalId: "vb:987654" },
      }),
    ).toBe(1);
    const ticket = await prisma.ticket.findFirst({
      where: { organizationId: org.id },
    });
    expect(ticket!.channel).toBe("VIBER");
  });

  it("ignores stickers and media (message events with no text)", async () => {
    const org = await connectedOrg();
    const { rawBody, header } = signed({
      event: "message",
      sender: { id: "viber-user-3" },
      message: { type: "sticker" },
    });
    const result = await handleViberWebhook({
      db: prisma,
      orgSlug: org.slug,
      rawBody,
      signatureHeader: header,
    });
    expect(result.status).toBe(200);
    expect(await prisma.ticket.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it("a signed but unparseable body is 200, never a retry loop", async () => {
    const org = await connectedOrg();
    const rawBody = "{not json";
    const result = await handleViberWebhook({
      db: prisma,
      orgSlug: org.slug,
      rawBody,
      signatureHeader: signature(TOKEN, rawBody),
    });
    expect(result.status).toBe(200);
  });

  it("treats a Viber status!=0 body as a failed send (errors arrive as 200)", async () => {
    const org = await connectedOrg();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: 2, status_message: "invalid token" }), {
        status: 200,
      }),
    );
    const { rawBody, header } = signed({
      event: "message",
      message_token: 111,
      sender: { id: "viber-user-4" },
      message: { type: "text", text: "hello can you help me" },
    });
    await handleViberWebhook({
      db: prisma,
      orgSlug: org.slug,
      rawBody,
      signatureHeader: header,
    });
    // Inbound stored; the ack was not recorded because Viber refused it.
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
