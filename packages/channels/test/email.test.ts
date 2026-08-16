import { describe, expect, it } from "vitest";

import {
  isAutoReply,
  parseAddress,
  parseDisplayName,
  parseInboundEmail,
  replySubject,
  stripQuotedReply,
  ticketNumberInSubject,
} from "../src/email";

describe("parseAddress", () => {
  it("pulls the mailbox out of a display-name header", () => {
    expect(parseAddress("Selam Bekele <selam@example.com>")).toBe("selam@example.com");
    expect(parseAddress("<selam@example.com>")).toBe("selam@example.com");
    expect(parseAddress("selam@example.com")).toBe("selam@example.com");
  });

  it("case-folds, because two spellings of one mailbox are one person", () => {
    // Not cosmetic: the address IS the identity, so treating these as two
    // would give the same customer two records — the duplicate problem
    // ADR 0015 closed, arriving through a different door.
    expect(parseAddress("Selam@Example.COM")).toBe("selam@example.com");
  });

  it("refuses what is not an address rather than storing it as one", () => {
    expect(parseAddress("")).toBeNull();
    expect(parseAddress("not an address")).toBeNull();
    expect(parseAddress("selam@localhost")).toBeNull();
    expect(parseAddress("@example.com")).toBeNull();
  });
});

describe("parseDisplayName", () => {
  it("takes the name when there is one, and nothing when there is not", () => {
    expect(parseDisplayName("Selam Bekele <s@x.com>")).toBe("Selam Bekele");
    expect(parseDisplayName('"Selam Bekele" <s@x.com>')).toBe("Selam Bekele");
    expect(parseDisplayName("s@x.com")).toBeNull();
  });
});

describe("ticketNumberInSubject", () => {
  it("finds the token wherever the mail client left it", () => {
    expect(ticketNumberInSubject("Re: Missing parcel [#42]")).toBe(42);
    expect(ticketNumberInSubject("RE: RE: FW: Missing parcel [#42] (was: ...)")).toBe(42);
    expect(ticketNumberInSubject("[#7] Missing parcel")).toBe(7);
  });

  it("returns nothing for a first-contact subject", () => {
    expect(ticketNumberInSubject("Missing parcel")).toBeNull();
    expect(ticketNumberInSubject("")).toBeNull();
    // A number that is not our token must not be mistaken for one.
    expect(ticketNumberInSubject("Invoice #42 attached")).toBeNull();
    expect(ticketNumberInSubject("Order [42]")).toBeNull();
  });
});

describe("replySubject", () => {
  it("adds Re: and the token, and does not stack either", () => {
    expect(replySubject("Missing parcel", 42)).toBe("Re: Missing parcel [#42]");
    expect(replySubject("Re: Missing parcel", 42)).toBe("Re: Missing parcel [#42]");
    // The token must not accumulate over a long thread.
    expect(replySubject("Re: Missing parcel [#42]", 42)).toBe("Re: Missing parcel [#42]");
  });

  it("survives a customer who sent no subject at all", () => {
    expect(replySubject("", 42)).toBe("Re: Your message [#42]");
  });

  it("round-trips: what we send is read back as the same ticket", () => {
    const sent = replySubject("Missing parcel", 42);
    expect(ticketNumberInSubject(`Re: ${sent}`)).toBe(42);
  });
});

describe("stripQuotedReply", () => {
  it("cuts the quoted history off a Gmail reply", () => {
    const body = [
      "Yes, that address is correct.",
      "",
      "On Mon, 16 Aug 2026 at 10:02, Olink Desk <support@acme.et> wrote:",
      "> Could you confirm the delivery address?",
      "> Thanks",
    ].join("\n");
    expect(stripQuotedReply(body)).toBe("Yes, that address is correct.");
  });

  it("cuts an Outlook reply at its header block", () => {
    const body = [
      "Still not delivered.",
      "",
      "From: Olink Desk <support@acme.et>",
      "Sent: Monday 16 August",
      "Subject: Re: Missing parcel",
    ].join("\n");
    expect(stripQuotedReply(body)).toBe("Still not delivered.");
  });

  it("KEEPS the original when cutting would leave nothing", () => {
    // A customer whose entire message is a quote of ours still said something
    // by sending it. Losing what somebody wrote is far worse than showing too
    // much, so this direction always errs toward keeping.
    const body = "> Could you confirm the delivery address?";
    expect(stripQuotedReply(body)).toBe(body);
  });

  it("leaves an ordinary first message alone", () => {
    const body = "Hello,\n\nMy parcel has not arrived.\n\nThanks,\nSelam";
    expect(stripQuotedReply(body)).toBe(body);
  });
});

describe("isAutoReply", () => {
  it("catches the standard headers", () => {
    // Getting this wrong is a mail LOOP, not one bad ticket: our ack goes to
    // their auto-responder, which replies, forever.
    expect(isAutoReply({ "Auto-Submitted": "auto-replied" }, "Away")).toBe(true);
    expect(isAutoReply({ Precedence: "bulk" }, "Newsletter")).toBe(true);
    expect(isAutoReply({ "X-Autoreply": "yes" }, "Away")).toBe(true);
    expect(isAutoReply({ headers: { "Auto-Submitted": "auto-generated" } }, "x")).toBe(true);
  });

  it("catches responders that only give themselves away in the subject", () => {
    expect(isAutoReply({}, "Out of Office: your message")).toBe(true);
    expect(isAutoReply({}, "Automatic reply: Missing parcel")).toBe(true);
    expect(isAutoReply({}, "Auto-Reply")).toBe(true);
  });

  it("does not mistake a real customer for a machine", () => {
    expect(isAutoReply({}, "Missing parcel")).toBe(false);
    expect(isAutoReply({}, "I am out of the office next week, can you deliver after?")).toBe(false);
    expect(isAutoReply({ "Auto-Submitted": "no" }, "Missing parcel")).toBe(false);
  });
});

describe("parseInboundEmail", () => {
  it("reads Postmark's shape", () => {
    const parsed = parseInboundEmail({
      FromFull: { Email: "Selam@Example.com", Name: "Selam" },
      Subject: "Missing parcel [#42]",
      TextBody: "Still nothing.\n\nOn Mon, Olink Desk wrote:\n> any update?",
      MessageID: "abc-123",
    });
    expect(parsed.sender).toBe("selam@example.com");
    expect(parsed.subject).toBe("Missing parcel [#42]");
    expect(parsed.text).toBe("Still nothing.");
    expect(parsed.messageId).toBe("abc-123");
  });

  it("reads Mailgun's shape", () => {
    const parsed = parseInboundEmail({
      from: "Selam Bekele <selam@example.com>",
      subject: "Missing parcel",
      "stripped-text": "My parcel has not arrived.",
      "message-id": "xyz@mail",
    });
    expect(parsed.sender).toBe("selam@example.com");
    expect(parsed.senderName).toBe("Selam Bekele");
    expect(parsed.text).toBe("My parcel has not arrived.");
  });

  it("returns nulls rather than guessing when a vendor sends something else", () => {
    const parsed = parseInboundEmail({ whatever: "nonsense" });
    expect(parsed.sender).toBeNull();
    expect(parsed.text).toBeNull();
  });
});
