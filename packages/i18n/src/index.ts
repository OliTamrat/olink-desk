// Customer-facing strings in Olink Desk's five languages, plus best-effort
// language detection — both ported from Olink Bank Assist (ADR 0002).
//
// The strings live in strings.json, not in code, so a linguist can review a
// TSV (`pnpm --filter @olink-desk/i18n export:tsv`) and corrections land as a
// data edit, never a retyped Ge'ez literal. EN is authored; AM/OM/TI/SO are
// drafts composed from Bank Assist's reviewed sentence patterns and must go
// through native review before a pilot.
//
// Localization scope is fixed by PROJECT_GUIDELINES.md: en/am/om/ti/so and no
// other languages. Bank Assist's Swahili column deliberately did not port.

import rawStrings from "./strings.json";

export const SUPPORTED_LANGUAGES = ["en", "am", "om", "ti", "so"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  am: "አማርኛ",
  om: "Afaan Oromoo",
  ti: "ትግርኛ",
  so: "Soomaali",
};

const STRINGS = rawStrings as Record<Language, Record<string, string>>;

export function isSupportedLanguage(value: string): value is Language {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

// What each string is for and what a translation must preserve — carried in
// the TSV export's context column, addressed to the reviewer, not to the next
// maintainer (the Bank Assist lesson: inline comments never reach the person
// doing the translating).
export const NOTES: Record<string, string> = {
  greeting:
    "First message when a customer opens a chat (Telegram /start, widget open). " +
    "{org} is the organization's name. This is a human support desk, not a bot " +
    "persona — it must not claim to be an assistant that answers by itself.",
  ticket_opened:
    "Auto-acknowledgement sent once when a new ticket is opened from an inbound " +
    "message. {org} is the organization's name, {number} the human-facing ticket " +
    "number. It promises a reply in this same chat — keep that promise explicit.",
};

/**
 * Translate a string key, interpolating {placeholders}. Unknown language or
 * missing key falls back to English: a customer reading an English sentence in
 * an otherwise-Amharic exchange sees an untranslated string somebody can fix;
 * a customer reading "ticket_opened" sees a broken product.
 */
export function t(
  language: string | null | undefined,
  key: string,
  params: Record<string, string | number> = {},
): string {
  const lang: Language =
    language && isSupportedLanguage(language) ? language : "en";
  const template = STRINGS[lang][key] ?? STRINGS.en[key];
  if (template === undefined) {
    throw new Error(`Unknown i18n key: ${key}`);
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** The whole table, for tests and the TSV export. */
export function allStrings(): Record<Language, Record<string, string>> {
  return STRINGS;
}

// ---------------------------------------------------------------- detection
//
// Ported from Bank Assist's classifier (minus Swahili, out of scope here).
// Rules-first: deterministic, testable, zero-latency, works offline.

const ETHIOPIC = /[ሀ-፿]/;
// The glottal series spelled with አ vs ኣ is the quickest orthographic tell
// between Amharic and Tigrinya in short chat messages.
const TIGRINYA_TELL = /[ኣ]|እየ|ኢኹም|ዲኹም|እዩ/;

// Deliberately excludes ultra-short tokens (fi, nu, ee, ku, la) — they
// collide across languages and with English, and a wrong positive costs more
// than a miss, because unmarked Latin text falls through to English by
// elimination below.
const OROMO_WORDS = new Set([
  "akkam", "maaloo", "tajaajila", "waan", "akkamitti", "danda", "qaba",
  "kootii", "koo", "guyyaa", "hangam", "waa'ee", "waee", "beekuu",
  "barbaada", "barbaade", "barbaadha", "maqaan", "maqaa", "eenyu", "maaliif",
  "eessa", "yoom", "keessan", "keessa", "irratti", "irraa", "waliin",
  "jedhama", "jirta", "jirtu", "jirtan", "galatoomi", "nagaa", "argachuu",
  "fayyadamuu", "kaffaltii", "kaffaluu", "yookaan", "immoo", "garuu",
  "dhiyeessuu", "hojjechuu", "rakkoo", "gargaarsa",
]);
const SOMALI_WORDS = new Set([
  "waan", "waxaan", "sidee", "fadlan", "maxay", "immisa", "adeegga",
  "waxa", "saabsan", "goorma", "xagee", "doonayaa", "rabaa", "ogaan",
  "mahadsanid", "magacaygu", "aniga", "adiga", "annaga", "iyaga", "maxaa",
  "macmiilka", "warqad", "dhibaato", "caawimaad", "su'aal", "jawaab",
]);
const ENGLISH_WORDS = new Set([
  "the", "how", "what", "is", "my", "open", "can", "i", "to", "tell", "me",
  "more", "about", "your", "you", "do", "does", "are", "where", "when",
  "why", "which", "for", "with", "and", "need", "want", "have", "get",
  "send", "there", "this", "that", "would", "should", "could", "please",
  "of", "in", "on", "help", "problem", "order", "ticket", "call", "service",
]);

// How many unmarked Latin words before a message counts as English prose.
const LATIN_PROSE_WORDS = 3;

/**
 * Best-effort detection; null means "no signal, keep the conversation's
 * sticky language". Among the five supported languages only English, Afaan
 * Oromo and Somali use Latin script, so unmarked Latin prose is English by
 * elimination — with a word-count floor so a bare "ATM" or "OK" mid-Amharic
 * conversation cannot flip the language (Bank Assist finding #5).
 */
export function detectLanguage(text: string): Language | null {
  if (ETHIOPIC.test(text)) {
    return TIGRINYA_TELL.test(text) ? "ti" : "am";
  }
  const words = new Set(text.toLowerCase().match(/[a-z']+/g) ?? []);
  if (words.size === 0) return null;
  let om = 0;
  let so = 0;
  let en = 0;
  for (const w of words) {
    if (OROMO_WORDS.has(w)) om += 1;
    if (SOMALI_WORDS.has(w)) so += 1;
    if (ENGLISH_WORDS.has(w)) en += 1;
  }
  const localBest = Math.max(om, so);
  if (Math.max(localBest, en) === 0) {
    return words.size >= LATIN_PROSE_WORDS ? "en" : null;
  }
  if (en >= localBest) return "en";
  // "waan" is in both local lists; prefer the language with more distinct
  // hits, and a tie goes to Oromo (the original Bank Assist priority).
  return om >= so ? "om" : "so";
}
