// What a macro DOES, beyond the words it sends.
//
// A macro used to be a canned reply plus one optional status change. Zendesk's
// model — and the one an agent actually wants — is a small bundle of actions:
// send this text, set the status, set the priority, add these tags. Doing four
// things by hand after every canned reply is exactly the repetition a macro
// exists to remove.
//
// Pure and here rather than in a route, because two rules below are safety
// properties rather than conveniences and both deserve a test.

export const SETTABLE_STATUSES = ["OPEN", "PENDING", "RESOLVED"] as const;
export type SettableStatus = (typeof SETTABLE_STATUSES)[number];

export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type MacroPriority = (typeof PRIORITIES)[number];

/** A hard cap, so one macro cannot bury a ticket under a wall of labels. */
export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 32;

export interface MacroActions {
  setStatus: SettableStatus | null;
  setPriority: MacroPriority | null;
  addTags: string[];
}

export const NO_ACTIONS: MacroActions = {
  setStatus: null,
  setPriority: null,
  addTags: [],
};

/**
 * `Some Tag!` → `some-tag`.
 *
 * Matches how tags are keyed elsewhere, so a macro cannot mint a second tag
 * that only differs by case or spacing and then split a filter in two.
 */
export function tagSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ሀ-፿]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_TAG_LENGTH);
}

/**
 * Take whatever arrived and return actions that are safe to apply.
 *
 * **CLOSED and NEW are not settable, and that is deliberate.** A macro is
 * prose an agent fires in one click; letting one CLOSE a ticket outright would
 * end a conversation the customer is still in, and letting one set NEW would
 * walk a ticket backwards past its own first-response clock. An agent who
 * genuinely wants either can still do it from the properties rail, where it is
 * a considered act rather than a side effect of picking a reply.
 */
export function cleanActions(input: unknown): MacroActions {
  const raw = (input ?? {}) as Record<string, unknown>;
  const status =
    typeof raw.setStatus === "string" &&
    (SETTABLE_STATUSES as readonly string[]).includes(raw.setStatus)
      ? (raw.setStatus as SettableStatus)
      : null;
  const priority =
    typeof raw.setPriority === "string" &&
    (PRIORITIES as readonly string[]).includes(raw.setPriority)
      ? (raw.setPriority as MacroPriority)
      : null;

  const tags: string[] = [];
  const source = Array.isArray(raw.addTags)
    ? raw.addTags
    : typeof raw.addTags === "string"
      ? raw.addTags.split(",")
      : [];
  for (const entry of source) {
    if (typeof entry !== "string") continue;
    const slug = tagSlug(entry);
    if (!slug || tags.includes(slug)) continue;
    tags.push(slug);
    if (tags.length >= MAX_TAGS) break;
  }
  return { setStatus: status, setPriority: priority, addTags: tags };
}

export function hasActions(a: MacroActions): boolean {
  return Boolean(a.setStatus || a.setPriority || a.addTags.length > 0);
}

/**
 * One short line per action, for the summary under a macro in the list.
 *
 * Returns i18n keys and their parameters rather than sentences: what a macro
 * does is read by agents in six languages, and building the line here from
 * English fragments is the mistake ADR-equivalent work in Bank Assist recorded
 * — a sentence assembled from pieces only reads correctly in a language whose
 * word order happens to match English.
 */
export function describeActions(
  a: MacroActions,
): Array<{ key: string; params: Record<string, string | number> }> {
  const out: Array<{ key: string; params: Record<string, string | number> }> = [];
  if (a.setStatus) out.push({ key: "ui_macro_does_status", params: { value: a.setStatus } });
  if (a.setPriority)
    out.push({ key: "ui_macro_does_priority", params: { value: a.setPriority } });
  if (a.addTags.length > 0)
    out.push({
      key: "ui_macro_does_tags",
      params: { n: a.addTags.length, list: a.addTags.join(", ") },
    });
  return out;
}
