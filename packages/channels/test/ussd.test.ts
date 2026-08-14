// USSD adapter contract tests — the synchronous session flow: dial-in gets
// the CON prompt, a message gets an END screen carrying the ticket number.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sealChannelConfig } from "../src/crypto";
import { handleUssdWebhook, MAX_SCREEN, parseInbound } from "../src/ussd";
import { createOrg, prisma } from "./helpers";

const SECRET = "ussd-shared-secret";

async function connectedOrg() {
  const org = await createOrg({ name: "Acme Support" });
  await prisma.channelAccount.create({
    data: {
      organizationId: org.id,
      kind: "USSD_GATEWAY",
      label: "USSD gateway",
      config: sealChannelConfig({ webhookSecret: SECRET, serviceCode: "*789#" }),
    },
  });
  return org;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("parseInbound", () => {
  it("accepts the common gateway spellings and takes the latest input segment", () => {
    expect(
      parseInbound({ phoneNumber: "+251911000000", text: "1*hello there", sessionId: "s1" }),
    ).toEqual({ phone: "+251911000000", text: "hello there", sessionId: "s1" });
    expect(parseInbound({ msisdn: "0911", ussdString: "help me" })).toMatchObject({
      phone: "0911",
      text: "help me",
    });
  });

  it("an empty input path is a dial-in, not a message", () => {
    expect(parseInbound({ phoneNumber: "0911", text: "" }).text).toBeNull();
  });
});

describe("handleUssdWebhook", () => {
  it("fails closed on a wrong or missing secret", async () => {
    const org = await connectedOrg();
    for (const secretHeader of ["wrong", null]) {
      const result = await handleUssdWebhook({
        db: prisma,
        orgSlug: org.slug,
        secretHeader,
        fields: { phoneNumber: "0911", text: "hi" },
      });
      expect(result.status).toBe(403);
      expect(result.body.startsWith("END")).toBe(true);
    }
  });

  it("answers a dial-in with the CON greeting prompt", async () => {
    const org = await connectedOrg();
    const result = await handleUssdWebhook({
      db: prisma,
      orgSlug: org.slug,
      secretHeader: SECRET,
      fields: { phoneNumber: "+251911000001", sessionId: "s1", text: "" },
    });
    expect(result.status).toBe(200);
    expect(result.body.startsWith("CON ")).toBe(true);
    expect(result.body).toContain("Acme Support");
    expect(await prisma.ticket.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it("opens a ticket from typed input and ENDs with the ticket number", async () => {
    const org = await connectedOrg();
    const result = await handleUssdWebhook({
      db: prisma,
      orgSlug: org.slug,
      secretHeader: SECRET,
      fields: {
        phoneNumber: "+251911000002",
        sessionId: "s2",
        text: "my meter is broken",
      },
    });
    expect(result.status).toBe(200);
    expect(result.body.startsWith("END ")).toBe(true);
    const ticket = await prisma.ticket.findFirst({
      where: { organizationId: org.id },
    });
    expect(ticket!.channel).toBe("USSD");
    expect(result.body).toContain(String(ticket!.number));
    expect(result.body.length).toBeLessThanOrEqual(MAX_SCREEN + "END ".length);
  });

  it("a follow-up threads onto the open ticket and ENDs with message_received", async () => {
    const org = await connectedOrg();
    const first = await handleUssdWebhook({
      db: prisma,
      orgSlug: org.slug,
      secretHeader: SECRET,
      fields: { phoneNumber: "+251911000003", sessionId: "s3", text: "first problem here" },
    });
    const second = await handleUssdWebhook({
      db: prisma,
      orgSlug: org.slug,
      secretHeader: SECRET,
      fields: { phoneNumber: "+251911000003", sessionId: "s4", text: "any update please" },
    });
    expect(first.body.startsWith("END ")).toBe(true);
    expect(second.body.startsWith("END ")).toBe(true);
    expect(await prisma.ticket.count({ where: { organizationId: org.id } })).toBe(1);
    const ticket = await prisma.ticket.findFirst({
      where: { organizationId: org.id },
    });
    // The follow-up screen still names the ticket so the customer can quote it.
    expect(second.body).toContain(String(ticket!.number));
  });

  it("a gateway retry of one session step does not double-thread", async () => {
    const org = await connectedOrg();
    const fields = {
      phoneNumber: "+251911000004",
      sessionId: "s5",
      text: "hello hello",
    };
    await handleUssdWebhook({ db: prisma, orgSlug: org.slug, secretHeader: SECRET, fields });
    await handleUssdWebhook({ db: prisma, orgSlug: org.slug, secretHeader: SECRET, fields });
    expect(
      await prisma.ticketMessage.count({
        where: { organizationId: org.id, direction: "INBOUND" },
      }),
    ).toBe(1);
  });
});
