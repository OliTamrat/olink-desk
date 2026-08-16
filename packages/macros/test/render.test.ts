import { SUPPORTED_LANGUAGES } from "@olink-desk/i18n";
import { describe, expect, it } from "vitest";

import {
  knownPlaceholders,
  macroBodiesError,
  parseBodies,
  pickBody,
  placeholdersUsed,
  renderMacro,
} from "../src/render";
import { STARTER_MACROS } from "../src/starters";

const CTX = {
  customerName: "Aster",
  ticketNumber: 42,
  agentName: "Selam",
  organizationName: "Nehm Trucking",
};

describe("language selection", () => {
  // The reason this feature exists. An agent's console language is not the
  // customer's language, and picking the agent's is the defect.
  it("renders in the ticket's language, not the agent's", () => {
    const bodies = { en: "Hello", am: "ሰላም", ti: "ሰላም ትግርኛ" };
    expect(renderMacro(bodies, "ti", CTX)?.text).toBe("ሰላም ትግርኛ");
    expect(renderMacro(bodies, "am", CTX)?.text).toBe("ሰላም");
  });

  it("falls back to the workspace default, then English", () => {
    const bodies = { en: "English body", am: "የአማርኛ አካል" };
    const so = renderMacro(bodies, "so", CTX, "am");
    expect(so?.language).toBe("am");
    expect(so?.fellBack).toBe(true);

    const noDefault = renderMacro(bodies, "so", CTX);
    expect(noDefault?.language).toBe("en");
  });

  it("hands over the only body that exists rather than nothing", () => {
    // A macro authored only in Amharic must not produce an empty composer —
    // an empty box reads as a broken button, not as a missing translation.
    const rendered = renderMacro({ am: "አማርኛ ብቻ" }, "en", CTX);
    expect(rendered?.text).toBe("አማርኛ ብቻ");
    expect(rendered?.language).toBe("am");
    expect(rendered?.fellBack).toBe(true);
  });

  it("flags a fallback so the agent can see it before sending", () => {
    expect(renderMacro({ en: "x" }, "en", CTX)?.fellBack).toBe(false);
    expect(renderMacro({ en: "x" }, "ti", CTX)?.fellBack).toBe(true);
  });

  it("treats a blank body as absent", () => {
    expect(pickBody({ ti: "   ", en: "real" }, "ti")?.language).toBe("en");
  });

  it("returns null when there is nothing to send", () => {
    expect(renderMacro({}, "en", CTX)).toBeNull();
    expect(renderMacro({ en: "  " }, "en", CTX)).toBeNull();
  });
});

describe("placeholders", () => {
  it("fills every known placeholder", () => {
    const text = renderMacro(
      {
        en:
          "Hi {{customer.name}}, ticket {{ticket.number}} at " +
          "{{organization.name}} — {{agent.name}}",
      },
      "en",
      CTX,
    )?.text;
    expect(text).toBe("Hi Aster, ticket #42 at Nehm Trucking — Selam");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(renderMacro({ en: "Hi {{ customer.name }}" }, "en", CTX)?.text).toBe(
      "Hi Aster",
    );
  });

  it("substitutes a translated form of address when the name is unknown", () => {
    // Never "Hello ," and never an English word inside an Amharic sentence.
    const am = renderMacro({ am: "ሰላም {{customer.name}}" }, "am", {
      customerName: null,
    });
    expect(am?.text).toBe("ሰላም ውድ ደንበኛ");
    const en = renderMacro({ en: "Hello {{customer.name}}" }, "en", {});
    expect(en?.text).toBe("Hello there");
  });

  it("never leaves a raw token in text bound for a customer", () => {
    // A macro exists so the agent does NOT read the draft closely. Anything
    // unresolved has to be gone before it reaches the composer.
    const text = renderMacro(
      { en: "A {{ticket.number}} B {{agent.name}} C {{not.a.field}} D {{nope}}" },
      "en",
      {},
    )?.text;
    expect(text).not.toContain("{{");
    expect(text).not.toContain("}}");
    expect(text).toBe("A B C D");
  });

  it("collapses the gap a removed placeholder leaves", () => {
    expect(renderMacro({ en: "Regards,\n{{agent.name}}" }, "en", {})?.text).toBe(
      "Regards,",
    );
    expect(renderMacro({ en: "Ticket {{ticket.number}}." }, "en", {})?.text).toBe(
      "Ticket.",
    );
  });

  it("reports which placeholders a macro uses", () => {
    expect(
      placeholdersUsed({ en: "{{agent.name}}", am: "{{customer.name}}" }),
    ).toEqual(["customer.name", "agent.name"]);
    expect(placeholdersUsed({ en: "no tokens" })).toEqual([]);
  });
});

describe("validation", () => {
  it("refuses an empty macro", () => {
    expect(macroBodiesError({})).toMatch(/at least one language/);
    expect(macroBodiesError({ en: "   " })).toMatch(/at least one language/);
  });

  it("refuses an unknown placeholder at save time", () => {
    // The only moment a person is actually looking at the macro. Accepting it
    // here means silently deleting it from every reply afterwards.
    expect(macroBodiesError({ en: "Hi {{customer.email}}" })).toMatch(
      /Unknown placeholder/,
    );
    expect(macroBodiesError({ en: "Hi {{customer.name}}" })).toBeNull();
  });

  it("refuses an over-long body", () => {
    expect(macroBodiesError({ en: "x".repeat(4001) })).toMatch(/too long/);
  });

  it("drops unrecognised keys when parsing stored JSON", () => {
    expect(parseBodies({ en: "a", klingon: "b", am: 7 })).toEqual({ en: "a" });
    expect(parseBodies(null)).toEqual({});
    expect(parseBodies("nope")).toEqual({});
  });
});

describe("starter macros", () => {
  it("ships every starter in all six languages", () => {
    // The fleet golden rule, enforced rather than promised: a macro is
    // customer-facing prose sent verbatim, so an English-only starter would
    // put English in front of an Amharic customer on day one.
    for (const macro of STARTER_MACROS) {
      for (const lang of SUPPORTED_LANGUAGES) {
        const body = macro.bodies[lang];
        expect(body, `${macro.title} is missing ${lang}`).toBeTruthy();
        expect((body ?? "").trim().length).toBeGreaterThan(20);
      }
    }
  });

  it("stores only valid bodies", () => {
    for (const macro of STARTER_MACROS) {
      expect(macroBodiesError(macro.bodies), macro.title).toBeNull();
    }
  });

  it("uses the same placeholders in every language of a starter", () => {
    // A translation that quietly drops {{ticket.number}} makes the Amharic
    // reply less useful than the English one, and nothing else would notice.
    for (const macro of STARTER_MACROS) {
      const reference = placeholdersUsed({ en: macro.bodies.en });
      for (const lang of SUPPORTED_LANGUAGES) {
        expect(
          placeholdersUsed({ en: macro.bodies[lang] }),
          `${macro.title} (${lang})`,
        ).toEqual(reference);
      }
    }
  });

  it("renders every starter in every language without leaving a token", () => {
    for (const macro of STARTER_MACROS) {
      for (const lang of SUPPORTED_LANGUAGES) {
        const rendered = renderMacro(macro.bodies, lang, CTX);
        expect(rendered?.language, `${macro.title} ${lang}`).toBe(lang);
        expect(rendered?.text).not.toContain("{{");
        expect(rendered?.text).toContain("Aster");
      }
    }
  });

  it("keeps the placeholder vocabulary closed", () => {
    // Widening this set is a decision about what a macro author may address a
    // customer with — it should not happen by accident.
    expect([...knownPlaceholders()]).toEqual([
      "customer.name",
      "ticket.number",
      "agent.name",
      "organization.name",
    ]);
  });
});
