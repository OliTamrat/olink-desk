// Meta adapter contract tests — one app, three products, driving the real
// payload shapes Meta documents.
import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sealChannelConfig } from "../src/crypto";
import {
  handleMetaVerify,
  handleMetaWebhook,
  inbound,
  validSignature,
  verifyHandshake,
} from "../src/meta";
import { createOrg, prisma } from "./helpers";

const APP_SECRET = "meta-app-secret";
const VERIFY_TOKEN = "meta-verify-token";

function sign(rawBody: string): string {
  return `sha256=${createHmac("sha256", APP_SECRET).update(rawBody).digest("hex")}`;
}

async function whatsappOrg() {
  const org = await createOrg({ name: "Acme Support" });
  await prisma.channelAccount.create({
    data: {
      organizationId: org.id,
      kind: "META_WHATSAPP",
      label: "WhatsApp",
      config: sealChannelConfig({
        appSecret: APP_SECRET,
        verifyToken: VERIFY_TOKEN,
        accessToken: "wa-token",
        phoneNumberId: "555000",
      }),
    },
  });
  return org;
}

function whatsappDelivery(text: string, id = "wamid.1") {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messages: [{ from: "251911000000", id, text: { body: text } }],
            },
          },
        ],
      },
    ],
  };
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

describe("verifyHandshake / validSignature", () => {
  it("fails closed on an unset verify token or app secret", () => {
    expect(
      verifyHandshake({ mode: "subscribe", token: "x", challenge: "c", expectedToken: undefined }),
    ).toBeNull();
    expect(
      verifyHandshake({ mode: "subscribe", token: "", challenge: "c", expectedToken: "" }),
    ).toBeNull();
    expect(validSignature(undefined, "body", sign("body"))).toBe(false);
  });

  it("echoes the challenge only for the right mode and token", () => {
    expect(
      verifyHandshake({ mode: "subscribe", token: VERIFY_TOKEN, challenge: "42", expectedToken: VERIFY_TOKEN }),
    ).toBe("42");
    expect(
      verifyHandshake({ mode: "unsubscribe", token: VERIFY_TOKEN, challenge: "42", expectedToken: VERIFY_TOKEN }),
    ).toBeNull();
  });

  it("compares the whole sha256= string, not a bare digest", () => {
    const digest = sign("body").slice("sha256=".length);
    expect(validSignature(APP_SECRET, "body", digest)).toBe(false);
    expect(validSignature(APP_SECRET, "body", sign("body"))).toBe(true);
  });
});

describe("inbound", () => {
  it("reads WhatsApp texts and skips status-only deliveries", () => {
    const { channel, texts } = inbound(whatsappDelivery("hello"));
    expect(channel).toBe("WHATSAPP");
    expect(texts).toEqual([
      { sender: "251911000000", text: "hello", messageId: "wamid.1" },
    ]);
    const statuses = inbound({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: { statuses: [{ status: "delivered" }] } }] }],
    });
    expect(statuses.texts).toEqual([]);
  });

  it("skips is_echo so the desk never answers its own ack forever", () => {
    const { channel, texts } = inbound({
      object: "page",
      entry: [
        {
          messaging: [
            { sender: { id: "psid-1" }, message: { mid: "m1", text: "help me" } },
            { sender: { id: "page" }, message: { is_echo: true, text: "our ack" } },
          ],
        },
      ],
    });
    expect(channel).toBe("MESSENGER");
    expect(texts).toEqual([{ sender: "psid-1", text: "help me", messageId: "m1" }]);
  });

  it("returns a null channel for objects we do not serve", () => {
    expect(inbound({ object: "permissions" }).channel).toBeNull();
  });
});

describe("handleMetaVerify / handleMetaWebhook", () => {
  it("answers the handshake with the bare challenge", async () => {
    const org = await whatsappOrg();
    const result = await handleMetaVerify({
      db: prisma,
      orgSlug: org.slug,
      mode: "subscribe",
      token: VERIFY_TOKEN,
      challenge: "1158201444",
    });
    expect(result).toEqual({ status: 200, body: "1158201444" });
  });

  it("rejects a wrong verify token", async () => {
    const org = await whatsappOrg();
    const result = await handleMetaVerify({
      db: prisma,
      orgSlug: org.slug,
      mode: "subscribe",
      token: "wrong",
      challenge: "x",
    });
    expect(result.status).toBe(403);
  });

  it("threads a signed WhatsApp message and replies through the Cloud API", async () => {
    const org = await whatsappOrg();
    const rawBody = JSON.stringify(whatsappDelivery("my card was swallowed"));
    const result = await handleMetaWebhook({
      db: prisma,
      orgSlug: org.slug,
      rawBody,
      signatureHeader: sign(rawBody),
    });
    expect(result.status).toBe(200);
    const ticket = await prisma.ticket.findFirst({
      where: { organizationId: org.id },
    });
    expect(ticket!.channel).toBe("WHATSAPP");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/555000/messages");
    expect(JSON.parse(String(init.body)).to).toBe("251911000000");
  });

  it("rejects an unsigned delivery", async () => {
    const org = await whatsappOrg();
    const rawBody = JSON.stringify(whatsappDelivery("hi"));
    const result = await handleMetaWebhook({
      db: prisma,
      orgSlug: org.slug,
      rawBody,
      signatureHeader: "sha256=deadbeef",
    });
    expect(result.status).toBe(403);
  });

  it("is idempotent across redeliveries of one message id", async () => {
    const org = await whatsappOrg();
    const rawBody = JSON.stringify(whatsappDelivery("hello again", "wamid.dup"));
    for (let i = 0; i < 2; i += 1) {
      await handleMetaWebhook({
        db: prisma,
        orgSlug: org.slug,
        rawBody,
        signatureHeader: sign(rawBody),
      });
    }
    expect(
      await prisma.ticketMessage.count({
        where: { organizationId: org.id, externalId: "meta:wamid.dup" },
      }),
    ).toBe(1);
  });

  it("acks a signed delivery for an unconfigured product without threading", async () => {
    const org = await whatsappOrg(); // has WhatsApp creds only
    const rawBody = JSON.stringify({
      object: "page",
      entry: [
        {
          messaging: [
            { sender: { id: "psid-9" }, message: { mid: "m9", text: "hi" } },
          ],
        },
      ],
    });
    const result = await handleMetaWebhook({
      db: prisma,
      orgSlug: org.slug,
      rawBody,
      signatureHeader: sign(rawBody),
    });
    expect(result.status).toBe(200);
    expect(
      await prisma.ticket.count({
        where: { organizationId: org.id, channel: "MESSENGER" },
      }),
    ).toBe(0);
  });
});
