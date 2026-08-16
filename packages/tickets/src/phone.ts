// A phone number is this desk's identity for a person: `Contact` is unique on
// (organizationId, phone). That constraint is decorative unless the number is
// normalised first — `+251911234567`, `0911234567` and `0911 23 45 67` are one
// customer, and storing them as three rows means the third agent to take a
// call from them creates a third record and sees none of the history.
//
// Same lesson as tags (ADR 0011): normalise at the boundary, once, so the
// thing can actually be counted and joined on.

/**
 * Ethiopian mobile numbers are 9 digits after the country code and start with
 * 9 (Ethio Telecom) or 7 (Safaricom Ethiopia). Locally they are written with a
 * leading 0: 09… / 07…
 */
const ET_COUNTRY = "251";

export const MAX_PHONE_LENGTH = 20;

/** Everything a person might type between digits, and nothing else. */
const PUNCTUATION = /[\s\-(). ‐-―]/g;

// Ge'ez digits appear on Amharic keyboards. Someone typing ፱ means 9.
const GEEZ_DIGITS = "፩፪፫፬፭፮፯፰፱";

function toAsciiDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    const geez = GEEZ_DIGITS.indexOf(ch);
    if (geez >= 0) {
      out += String(geez + 1);
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Normalise a typed phone number to E.164 where we can recognise it.
 *
 * Returns null when the input is not a number we are willing to treat as an
 * identity. Refusing is deliberate: storing an unrecognised string as a
 * customer's identity creates a row that will never match the same person
 * again, which is worse than making the agent correct the typo.
 *
 * NOT a validity check — we cannot know whether a number is in service. It
 * only decides whether two strings are the same person.
 */
export function normalizePhone(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = toAsciiDigits(raw.trim()).replace(PUNCTUATION, "");
  if (!cleaned) return null;
  if (cleaned.length > MAX_PHONE_LENGTH) return null;

  const plus = cleaned.startsWith("+");
  const digits = plus ? cleaned.slice(1) : cleaned;
  if (!/^\d+$/.test(digits)) return null;

  // 00 is the other way to write +, used across Africa and Europe.
  if (!plus && digits.startsWith("00")) return e164(digits.slice(2));

  if (plus) return e164(digits);

  // Local Ethiopian form: 0 + the 9-digit national number, so exactly ten
  // characters. Mobiles are 09…/07…, fixed lines 011…/022… — all nine digits
  // after the zero. The range used to allow nine OR ten, which accepted
  // `091123456` (one digit short) as a real number and gave that typo its own
  // permanent customer record.
  if (digits.startsWith("0") && digits.length === 10) {
    return e164(ET_COUNTRY + digits.slice(1));
  }
  // Country code without the plus — what a paste from a spreadsheet looks
  // like. Twelve digits starting 251 is unambiguous.
  if (digits.startsWith(ET_COUNTRY) && digits.length === 3 + 9) return e164(digits);
  // Bare national number, no leading zero: 911234567.
  if (/^[79]\d{8}$/.test(digits)) return e164(ET_COUNTRY + digits);

  // Anything else with no country code is ambiguous — a 5-digit short code, a
  // half-typed number, an account number. We do not guess: guessing wrong
  // silently merges two different people onto one record.
  return null;
}

function e164(digits: string): string | null {
  // Shortest real E.164 numbers are 7 digits + country code; longest is 15.
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

/**
 * How the number is shown back to staff. Ethiopian numbers read as 09… locally
 * — that is what is written on a form, said on a call, and printed on a card,
 * so showing +251 9… everywhere makes the desk feel foreign for the sake of a
 * storage format nobody outside the database cares about.
 */
export function displayPhone(e164Number: string): string {
  if (!e164Number.startsWith(`+${ET_COUNTRY}`)) return e164Number;
  const national = e164Number.slice(1 + ET_COUNTRY.length);
  if (national.length !== 9) return e164Number;
  // 0911 234 567 — the grouping printed on Ethiopian business cards.
  return `0${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}
