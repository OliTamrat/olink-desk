// SMS adapter contract tests — the aggregator contract: lenient field
// parsing, strict authentication, numbered billable segments.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sealChannelConfig } from "../src/crypto";
import { handleSmsWebhook, MAX_PARTS, parseInbound, PART_CHARS, segments } from "../src/sms";
import { createOrg, prisma } from "./helpers";

const SECRET = "sms-shared-secret";

async function connectedOrg() {
  const org = await createOrg({ name: "Acme Support" });
  await prisma.channelAccount.create({
    data: {
      organizationId: org.id,
      kind: "SMS_AFROMESSAGE",
      label: "SMS",
      config: sealChannelConfig({
        webhookSecret: SECRET,
        sendUrl: "https://sms.example/send",
        authHeader: "Bearer sms-key",
        senderId: "ACME",
      }),
    },
  });
  return org;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("parseInbound", () => {
  it("accepts the common vendor spellings", () => {
    expect(parseInbound({ from: "0911", text: "hi" })).toMatchObject({
      sender: "0911",
      text: "hi",
    });
    expect(parseInbound({ msisdn: "0911", message: "hi" })).toMatchObject({
      sender: "0911",
      text: "hi",
    });
    expect(parseInbound({ sender: "0911", body: "hi", message_id: "77" })).toMatchObject({
      sender: "0911",
      text: "hi",
      messageId: "77",
    });
  });

  it("returns nulls rather than empty strings", () => {
    expect(parseInbound({ from: "  ", text: "" })).toEqual({
      sender: null,
      text: null,
      messageId: null,
    });
  });
});

describe("segments", () => {
  it("never numbers a single-part reply", () => {
    expect(segments("short reply")).toEqual(["short reply"]);
  });

  it("numbers multi-part replies and keeps each within a billable part", () => {
    const parts = segments("x".repeat(400));
    expect(parts.length).toBe(3);
    parts.forEach((part, i) => {
      expect(part.endsWith(`(${i + 1}/3)`)).toBe(true);
      expect(part.length).toBeLessThanOrEqual(PART_CHARS);
    });
  });

  it("caps at MAX_PARTS and visibly marks the cut", () => {
    const parts = segments("x".repeat(5000));
    expect(parts.length).toBe(MAX_PARTS);
    expect(parts[MAX_PARTS - 1]).toContain("…");
  });
});

describe("handleSmsWebhook", () => {
  it("fails closed on a wrong or missing secret", async () => {
    const org = await connectedOrg();
    for (const secretHeader of ["wrong", null]) {
      const result = await handleSmsWebhook({
        db: prisma,
        orgSlug: org.slug,
        secretHeader,
        fields: { from: "0911223344", text: "hello" },
      });
      expect(result.status).toBe(403);
    }
  });

  it("threads an inbound SMS and acks through the gateway", async () => {
    const org = await connectedOrg();
    const result = await handleSmsWebhook({
      db: prisma,
      orgSlug: org.slug,
      secretHeader: SECRET,
      fields: { msisdn: "0911223344", message: "generator is down", id: "sms-1" },
    });
    expect(result.status).toBe(200);
    const ticket = await prisma.ticket.findFirst({
      where: { organizationId: org.id },
    });
    expect(ticket!.channel).toBe("SMS");
    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://sms.example/send");
    const body = JSON.parse(String(init.body));
    expect(body.to).toBe("0911223344");
    expect(body.from).toBe("ACME");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sms-key");
  });

  it("dedups on the aggregator's message id", async () => {
    const org = await connectedOrg();
    for (let i = 0; i < 2; i += 1) {
      await handleSmsWebhook({
        db: prisma,
        orgSlug: org.slug,
        secretHeader: SECRET,
        fields: { from: "0911000001", text: "hello again", message_id: "dup-9" },
      });
    }
    expect(
      await prisma.ticketMessage.count({
        where: { organizationId: org.id, externalId: "sms:dup-9" },
      }),
    ).toBe(1);
  });

  it("acks a callback with no usable text without threading", async () => {
    const org = await connectedOrg();
    const result = await handleSmsWebhook({
      db: prisma,
      orgSlug: org.slug,
      secretHeader: SECRET,
      fields: { from: "0911223344" },
    });
    expect(result.status).toBe(200);
    expect(await prisma.ticket.count({ where: { organizationId: org.id } })).toBe(0);
  });
});
