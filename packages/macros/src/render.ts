// Macro rendering — turning a saved reply into the sentence one particular
// customer reads.
//
// The load-bearing decision, and the one that makes Desk's macros worth more
// than a competitor's: **a macro renders in the CUSTOMER's language, not the
// agent's.** An Addis agent working a console set to English who applies
// "Request account number" to a Tigrinya ticket must get the Tigrinya body.
// This is the Bank Assist sign-in-card lesson applied to staff tooling — the
// panel's language and the conversation's language are different things, and
// conflating them is how a Tigrinya customer gets answered in Amharic.
//
// Everything here is pure: no clock, no database, no I/O. The caller supplies
// the facts, so the same macro + same ticket always renders the same text and
// a test can prove it.

import { SUPPORTED_LANGUAGES, type Language } from "@olink-desk/i18n";

/** A macro's body in each language the workspace has authored. */
export type MacroBodies = Partial<Record<Language, string>>;

/** The facts a placeholder can be filled from. All optional — a macro must
 *  survive a ticket whose contact never gave a name. */
export interface MacroContext {
  customerName?: string | null;
  ticketNumber?: number | null;
  agentName?: string | null;
  organizationName?: string | null;
}

export interface RenderedMacro {
  text: string;
  /** Which language actually supplied the body. Surfaced in the console so an
   *  agent can SEE that they are about to send English into an Amharic
   *  conversation, rather than discovering it in the customer's reply. */
  language: Language;
  /** True when `language` is not the language that was asked for. */
  fellBack: boolean;
}

// Placeholders are deliberately a closed set. An open one ("any field on the
// ticket") reads as more powerful and is actually a leak: it lets whoever
// writes a macro address a customer with an internal note, an assignee's
// email, or another tenant's data if a join ever widens. Adding one here is a
// decision someone makes on purpose.
const PLACEHOLDERS = [
  "customer.name",
  "ticket.number",
  "agent.name",
  "organization.name",
] as const;
export type MacroPlaceholder = (typeof PLACEHOLDERS)[number];

// What a customer reads when the fact is missing. Translated, because this
// text is customer-facing: leaving "there" in an Amharic sentence is exactly
// the half-translated output the golden rule exists to prevent. These are
// four words rather than four i18n keys because they only ever appear inside
// a macro body and have no other call site; the reviewer sees them in the
// macros sheet.
const MISSING_NAME: Record<Language, string> = {
  en: "there",
  am: "ውድ ደንበኛ",
  om: "maamila kabajamaa",
  ti: "ክቡር ዓሚል",
  so: "macmiil sharaf leh",
  sw: "mteja mpendwa",
};

// Matches ANY {{…}}, not just well-formed field names. An earlier version
// only matched `word.word`, so `{{nope}}` and `{{not.a.field}}` slipped past
// both the renderer and save-time validation and were delivered to a customer
// verbatim — found by the test below, not by reading this file.
const TOKEN_RE = /\{\{([^{}]*)\}\}/g;

function tokenName(raw: string): string {
  return raw.trim();
}

/**
 * Pick the body to use. Order: the language asked for, then the workspace's
 * default, then English, then any body that exists at all.
 *
 * The last step matters more than it looks: a workspace that authored a macro
 * ONLY in Amharic would otherwise get an empty composer, which reads as a
 * broken button. Handing over the Amharic body — flagged as a fallback — is
 * strictly better than handing over nothing.
 */
export function pickBody(
  bodies: MacroBodies,
  wanted: string | null | undefined,
  organizationDefault?: string | null,
): { text: string; language: Language } | null {
  const candidates: (string | null | undefined)[] = [
    wanted,
    organizationDefault,
    "en",
  ];
  for (const c of candidates) {
    if (!c) continue;
    const lang = c as Language;
    const body = bodies[lang];
    if (body && body.trim()) return { text: body, language: lang };
  }
  for (const lang of SUPPORTED_LANGUAGES) {
    const body = bodies[lang];
    if (body && body.trim()) return { text: body, language: lang };
  }
  return null;
}

/**
 * Render a macro for one ticket.
 *
 * Unresolved placeholders are never left on the page. `{{customer.name}}`
 * with no name resolves to a translated form of address; every other unknown
 * or unfillable token is REMOVED, and the whitespace it leaves behind is
 * collapsed. The alternative — passing `{{ticket.number}}` through to the
 * composer — relies on the agent noticing before pressing send, and the whole
 * point of a macro is that they do not read it closely.
 */
export function renderMacro(
  bodies: MacroBodies,
  wantedLanguage: string | null | undefined,
  context: MacroContext,
  organizationDefault?: string | null,
): RenderedMacro | null {
  const picked = pickBody(bodies, wantedLanguage, organizationDefault);
  if (!picked) return null;

  const values: Record<MacroPlaceholder, string> = {
    "customer.name": context.customerName?.trim()
      ? context.customerName.trim()
      : MISSING_NAME[picked.language],
    "ticket.number":
      typeof context.ticketNumber === "number" ? `#${context.ticketNumber}` : "",
    "agent.name": context.agentName?.trim() ?? "",
    "organization.name": context.organizationName?.trim() ?? "",
  };

  const text = picked.text
    .replace(TOKEN_RE, (_match, raw: string) => {
      const name = tokenName(raw);
      return (PLACEHOLDERS as readonly string[]).includes(name)
        ? values[name as MacroPlaceholder]
        : "";
    })
    // Collapse the gaps a removed token leaves: "Hello  ," and a line of
    // nothing but a vanished placeholder both read as a bug to a customer.
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const wanted =
    wantedLanguage && (SUPPORTED_LANGUAGES as readonly string[]).includes(wantedLanguage)
      ? wantedLanguage
      : null;

  return {
    text,
    language: picked.language,
    fellBack: wanted !== null && wanted !== picked.language,
  };
}

/** Which placeholders a body actually uses — powers the editor's hint line. */
export function placeholdersUsed(bodies: MacroBodies): MacroPlaceholder[] {
  const found = new Set<MacroPlaceholder>();
  for (const body of Object.values(bodies)) {
    if (!body) continue;
    for (const match of body.matchAll(TOKEN_RE)) {
      const name = tokenName(match[1]);
      if ((PLACEHOLDERS as readonly string[]).includes(name)) {
        found.add(name as MacroPlaceholder);
      }
    }
  }
  return PLACEHOLDERS.filter((p) => found.has(p));
}

/** Every placeholder the editor offers, for the insert menu. */
export function knownPlaceholders(): readonly MacroPlaceholder[] {
  return PLACEHOLDERS;
}

/**
 * Validate a submitted body set. Returns an error string, or null when the
 * macro is storable.
 */
export function macroBodiesError(bodies: MacroBodies): string | null {
  const written = Object.entries(bodies).filter(([, v]) => v && v.trim());
  if (written.length === 0) return "A macro needs a body in at least one language";
  for (const [lang, body] of written) {
    if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(lang)) {
      return `Unsupported language: ${lang}`;
    }
    if ((body as string).length > 4000) {
      return `The ${lang} body is too long (4000 characters maximum)`;
    }
    // An unknown token would be silently deleted at send time. Refusing at
    // save time is the only moment a person is looking at the macro.
    for (const match of (body as string).matchAll(TOKEN_RE)) {
      const name = tokenName(match[1]);
      if (!(PLACEHOLDERS as readonly string[]).includes(name)) {
        return `Unknown placeholder {{${name}}} in the ${lang} body`;
      }
    }
  }
  return null;
}

/** Coerce stored JSON into a bodies map, dropping anything unrecognised. */
export function parseBodies(raw: unknown): MacroBodies {
  const out: MacroBodies = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    if ((SUPPORTED_LANGUAGES as readonly string[]).includes(key)) {
      out[key as Language] = value;
    }
  }
  return out;
}
