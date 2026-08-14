// The shared channel spine: threading, idempotency, tenant isolation.
// DB-backed — run with DATABASE_URL pointing at a disposable Postgres and the
// schema pushed (`prisma db push`).
import { beforeEach, describe, expect, it, vi } from "vitest";

import { channelReply } from "../src/reply";
import { createOrg, prisma } from "./helpers";

const sendOk = () => Promise.resolve(true);

function inbound(
  organization: Awaited<ReturnType<typeof createOrg>>,
  text: string,
  opts: Partial<{
    externalUserId: string;
    externalMessageId: string;
    send: (body: string) => Promise<boolean>;
  }> = {},
) {
  return channelReply({
    db: prisma,
    organization,
    channel: "TELEGRAM",
    externalUserId: opts.externalUserId ?? "42",
    text,
    externalMessageId: opts.externalMessageId,
    send: opts.send ?? sendOk,
  });
}

describe("channelReply", () => {
  it("first message opens ticket #1, stores the inbound, acks once", async () => {
    const org = await createOrg({ name: "Acme Support" });
    const sent: string[] = [];
    const send = (body: string) => {
      sent.push(body);
      return Promise.resolve(true);
    };

    const result = await inbound(org, "My order has not arrived", { send });
    expect(result.duplicate).toBe(false);
    if (result.duplicate) return;
    expect(result.ticketCreated).toBe(true);
    expect(result.ticketNumber).toBe(1);

    // The ack names the org and the ticket number, and is recorded outbound.
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("Acme Support");
    expect(sent[0]).toContain("1");
    const messages = await prisma.ticketMessage.findMany({
      where: { organizationId: org.id, ticketId: result.ticketId },
      orderBy: { createdAt: "asc" },
    });
    expect(messages.map((m) => m.direction)).toEqual(["INBOUND", "OUTBOUND"]);

    // Audited — without the message text.
    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: org.id, action: "ticket.opened_from_channel" },
    });
    expect(audit).not.toBeNull();
    expect(String(audit!.entityId)).toBe(String(result.ticketId));
    expect(JSON.stringify(audit!.metadata)).not.toContain("order has not");
  });

  it("a second message threads onto the open ticket with no second ack", async () => {
    const org = await createOrg();
    const sent: string[] = [];
    const send = (body: string) => {
      sent.push(body);
      return Promise.resolve(true);
    };
    const first = await inbound(org, "hello there friends", { send });
    const second = await inbound(org, "any update on this", { send });
    if (first.duplicate || second.duplicate) throw new Error("unexpected dup");
    expect(second.ticketId).toBe(first.ticketId);
    expect(second.ticketCreated).toBe(false);
    expect(sent).toHaveLength(1); // only the first message was acked
  });

  it("a redelivered update is a no-op (webhook idempotency)", async () => {
    const org = await createOrg();
    const id = "tg:42:1001";
    const first = await inbound(org, "hello can you help", {
      externalMessageId: id,
    });
    const replay = await inbound(org, "hello can you help", {
      externalMessageId: id,
    });
    expect(first.duplicate).toBe(false);
    expect(replay.duplicate).toBe(true);
    const count = await prisma.ticketMessage.count({
      where: { organizationId: org.id, externalId: id },
    });
    expect(count).toBe(1);
  });

  it("a message after resolution opens a new ticket", async () => {
    const org = await createOrg();
    const first = await inbound(org, "first problem here please");
    if (first.duplicate) throw new Error("unexpected dup");
    await prisma.ticket.update({
      where: { id: first.ticketId },
      data: { status: "RESOLVED" },
    });
    const next = await inbound(org, "a brand new problem");
    if (next.duplicate) throw new Error("unexpected dup");
    expect(next.ticketCreated).toBe(true);
    expect(next.ticketId).not.toBe(first.ticketId);
    expect(next.ticketNumber).toBe(2);
  });

  it("detects the customer's language and acks in it, stickily", async () => {
    const org = await createOrg({ name: "Acme" });
    const sent: string[] = [];
    const send = (body: string) => {
      sent.push(body);
      return Promise.resolve(true);
    };
    const result = await inbound(org, "ሰላም እርዳታ እፈልጋለሁ", { send });
    if (result.duplicate) throw new Error("unexpected dup");
    const conversation = await prisma.conversation.findUnique({
      where: { id: result.conversationId },
    });
    expect(conversation!.language).toBe("am");
    expect(sent[0]).toContain("ቲኬት"); // the Amharic ack, not the English one

    // A bare Latin token carries no signal and must not flip the language.
    await inbound(org, "OK");
    const after = await prisma.conversation.findUnique({
      where: { id: result.conversationId },
    });
    expect(after!.language).toBe("am");
  });

  it("does not record an ack the channel never accepted", async () => {
    const org = await createOrg();
    const result = await inbound(org, "hello is anyone there", {
      send: () => Promise.resolve(false),
    });
    if (result.duplicate) throw new Error("unexpected dup");
    const outbound = await prisma.ticketMessage.count({
      where: { ticketId: result.ticketId, direction: "OUTBOUND" },
    });
    expect(outbound).toBe(0);
  });

  it("a throwing send must not fail the webhook", async () => {
    const org = await createOrg();
    const result = await inbound(org, "hello hello hello", {
      send: () => Promise.reject(new Error("channel down")),
    });
    expect(result.duplicate).toBe(false);
  });

  it("isolates tenants: same external user, separate conversations and numbering", async () => {
    const orgA = await createOrg();
    const orgB = await createOrg();
    const a = await inbound(orgA, "hello from the customer");
    const b = await inbound(orgB, "hello from the customer", {
      externalUserId: "42",
    });
    if (a.duplicate || b.duplicate) throw new Error("unexpected dup");
    expect(a.conversationId).not.toBe(b.conversationId);
    // Both tenants start at ticket #1 — numbering is per-organization.
    expect(a.ticketNumber).toBe(1);
    expect(b.ticketNumber).toBe(1);
    // Nothing of B is visible through A's scope.
    const crossTickets = await prisma.ticket.count({
      where: { organizationId: orgA.id, id: b.ticketId },
    });
    expect(crossTickets).toBe(0);
    const crossMessages = await prisma.ticketMessage.count({
      where: { organizationId: orgA.id, ticketId: b.ticketId },
    });
    expect(crossMessages).toBe(0);
  });

  it("allocates sequential numbers under concurrent creation", async () => {
    const org = await createOrg();
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        inbound(org, `concurrent message number ${i}`, {
          externalUserId: `user-${i}`,
        }),
      ),
    );
    const numbers = results
      .map((r) => (r.duplicate ? null : r.ticketNumber))
      .filter((n): n is number => n !== null)
      .sort((x, y) => x - y);
    expect(numbers).toEqual([1, 2, 3, 4, 5]);
  });
});

// Silence expected console noise from deliberate failure-path tests.
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
