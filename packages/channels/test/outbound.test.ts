// The outbound reply path: delivery through the ticket's own channel,
// recording only what was accepted, tenant scope from the caller's session.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sealChannelConfig } from "../src/crypto";
import { sendAgentReply } from "../src/outbound";
import { channelReply } from "../src/reply";
import { handleWebMessage, listWebMessages } from "../src/web";
import { createOrg, prisma } from "./helpers";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true, status: 0 }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function agentFor(orgId: string) {
  return prisma.user.create({
    data: {
      organizationId: orgId,
      email: `agent-${orgId.slice(0, 8)}@example.com`,
      name: "Agent",
      role: "AGENT",
      status: "ACTIVE",
    },
  });
}

async function telegramTicket(org: Awaited<ReturnType<typeof createOrg>>) {
  await prisma.channelAccount.create({
    data: {
      organizationId: org.id,
      kind: "TELEGRAM_BOT",
      label: "Telegram bot",
      config: sealChannelConfig({ botToken: "12345:token", webhookSecret: "s" }),
    },
  });
  const result = await channelReply({
    db: prisma,
    organization: org,
    channel: "TELEGRAM",
    externalUserId: "42",
    text: "please help with my order",
    send: () => Promise.resolve(true),
  });
  if (result.duplicate) throw new Error("unexpected dup");
  return result;
}

describe("sendAgentReply", () => {
  it("delivers through the bot API, records OUTBOUND, opens the ticket", async () => {
    const org = await createOrg();
    const agent = await agentFor(org.id);
    const inbound = await telegramTicket(org);

    const result = await sendAgentReply({
      db: prisma,
      organizationId: org.id,
      ticketId: inbound.ticketId,
      body: "We are on it — expect a call today.",
      authorUserId: agent.id,
    });
    expect(result.ok).toBe(true);

    const ticket = await prisma.ticket.findUnique({
      where: { id: inbound.ticketId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    expect(ticket!.status).toBe("OPEN");
    expect(ticket!.firstRespondedAt).not.toBeNull();
    // The system ack (no author) is already on the timeline; the agent's
    // reply is the one carrying an author.
    const agentReplies = ticket!.messages.filter(
      (m) => m.direction === "OUTBOUND" && m.authorUserId !== null,
    );
    expect(agentReplies).toHaveLength(1);
    expect(agentReplies[0].authorUserId).toBe(agent.id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("sendMessage");
    expect(JSON.parse(String(init.body)).chat_id).toBe("42");
  });

  it("records nothing when the channel refuses the send", async () => {
    const org = await createOrg();
    const agent = await agentFor(org.id);
    const inbound = await telegramTicket(org);
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));

    const result = await sendAgentReply({
      db: prisma,
      organizationId: org.id,
      ticketId: inbound.ticketId,
      body: "hello",
      authorUserId: agent.id,
    });
    expect(!result.ok && result.reason).toBe("delivery_failed");
    // No agent-authored outbound row was recorded (the system ack from
    // ticket creation is authorless and already there).
    expect(
      await prisma.ticketMessage.count({
        where: {
          ticketId: inbound.ticketId,
          direction: "OUTBOUND",
          authorUserId: { not: null },
        },
      }),
    ).toBe(0);
    const ticket = await prisma.ticket.findUnique({ where: { id: inbound.ticketId } });
    expect(ticket!.firstRespondedAt).toBeNull();
  });

  it("cannot reach a ticket in another tenant", async () => {
    const orgA = await createOrg();
    const orgB = await createOrg();
    const agentB = await agentFor(orgB.id);
    const inbound = await telegramTicket(orgA);

    const result = await sendAgentReply({
      db: prisma,
      organizationId: orgB.id,
      ticketId: inbound.ticketId,
      body: "cross-tenant attempt",
      authorUserId: agentB.id,
    });
    expect(!result.ok && result.reason).toBe("ticket_not_found");
  });

  it("refuses when the channel holds no credential", async () => {
    const org = await createOrg();
    const agent = await agentFor(org.id);
    // Ticket exists but the Telegram account was deactivated since.
    const inbound = await telegramTicket(org);
    await prisma.channelAccount.updateMany({
      where: { organizationId: org.id },
      data: { active: false },
    });
    const result = await sendAgentReply({
      db: prisma,
      organizationId: org.id,
      ticketId: inbound.ticketId,
      body: "hello",
      authorUserId: agent.id,
    });
    expect(!result.ok && result.reason).toBe("channel_not_connected");
  });

  it("USSD tickets refuse outbound — a session cannot be re-entered", async () => {
    const org = await createOrg();
    const agent = await agentFor(org.id);
    const inbound = await channelReply({
      db: prisma,
      organization: org,
      channel: "USSD",
      externalUserId: "+251911000009",
      text: "my line is down",
      send: () => Promise.resolve(true),
    });
    if (inbound.duplicate) throw new Error("unexpected dup");
    const result = await sendAgentReply({
      db: prisma,
      organizationId: org.id,
      ticketId: inbound.ticketId,
      body: "hello",
      authorUserId: agent.id,
    });
    expect(!result.ok && result.reason).toBe("no_outbound_transport");
  });

  it("a WEB reply is delivered by recording: the widget poll returns it", async () => {
    const org = await createOrg({ name: "Acme Support" });
    const agent = await agentFor(org.id);
    const sessionId = "widget-session-out1";
    await handleWebMessage({
      db: prisma,
      orgSlug: org.slug,
      sessionId,
      text: "is my invoice ready",
    });
    const ticket = await prisma.ticket.findFirst({
      where: { organizationId: org.id },
    });
    const result = await sendAgentReply({
      db: prisma,
      organizationId: org.id,
      ticketId: ticket!.id,
      body: "Yes — it was sent this morning.",
      authorUserId: agent.id,
    });
    expect(result.ok).toBe(true);

    const poll = await listWebMessages({ db: prisma, orgSlug: org.slug, sessionId });
    const bodies = (poll.body.messages as Array<{ direction: string; body: string }>)
      .map((m) => `${m.direction}:${m.body}`);
    expect(bodies.some((b) => b.startsWith("OUTBOUND:Yes — it was sent"))).toBe(true);
  });
});
