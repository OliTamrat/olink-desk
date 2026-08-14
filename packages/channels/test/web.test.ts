// Web channel contract tests — the widget's POST path through the same spine.
import { describe, expect, it } from "vitest";

import { handleWebMessage } from "../src/web";
import { createOrg, prisma } from "./helpers";

const SESSION = "widget-session-0001";

describe("handleWebMessage", () => {
  it("opens a ticket and returns the ack in the response", async () => {
    const org = await createOrg({ name: "Acme Support" });
    const result = await handleWebMessage({
      db: prisma,
      orgSlug: org.slug,
      sessionId: SESSION,
      text: "I need help with my invoice",
    });
    expect(result.status).toBe(200);
    expect(result.body.ticketCreated).toBe(true);
    expect(result.body.ticketNumber).toBe(1);
    expect((result.body.replies as string[])[0]).toContain("Acme Support");
  });

  it("rejects a malformed session id", async () => {
    const org = await createOrg();
    const result = await handleWebMessage({
      db: prisma,
      orgSlug: org.slug,
      sessionId: "x",
      text: "hello",
    });
    expect(result.status).toBe(400);
  });

  it("rejects an empty or oversize message", async () => {
    const org = await createOrg();
    for (const text of ["", "   ", "x".repeat(4001)]) {
      const result = await handleWebMessage({
        db: prisma,
        orgSlug: org.slug,
        sessionId: SESSION,
        text,
      });
      expect(result.status).toBe(400);
    }
  });

  it("dedups on clientMessageId", async () => {
    const org = await createOrg();
    const payload = {
      db: prisma,
      orgSlug: org.slug,
      sessionId: SESSION,
      text: "did this go through",
      clientMessageId: "m-1",
    };
    const first = await handleWebMessage(payload);
    const replay = await handleWebMessage(payload);
    expect(first.body.duplicate).toBe(false);
    expect(replay.body.duplicate).toBe(true);
    expect(await prisma.ticket.count({ where: { organizationId: org.id } })).toBe(1);
  });

  it("an explicit language pins the conversation", async () => {
    const org = await createOrg();
    const result = await handleWebMessage({
      db: prisma,
      orgSlug: org.slug,
      sessionId: "widget-session-lang",
      text: "please help me with something",
      language: "am",
    });
    expect(result.status).toBe(200);
    expect((result.body.replies as string[])[0]).toContain("ቲኬት");
  });
});
