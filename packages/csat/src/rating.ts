// Reading a satisfaction score out of whatever the customer actually typed.
//
// This is the whole difficulty of CSAT on a messaging channel. After a survey
// goes out, the next thing the customer sends is either a rating or a brand
// new problem, and there is no structural difference between the two — both
// arrive as a line of text on the same conversation. Guess wrong in one
// direction and a real question is silently swallowed as a score; guess wrong
// in the other and "5" becomes a support ticket saying "5".
//
// The rule is therefore deliberately narrow: a rating is a message that is
// ESSENTIALLY JUST A NUMBER. Anything with real words in it is a message.
// That asymmetry is on purpose — losing a rating costs a data point, losing a
// question costs a customer.

/** Scores are 1–5. Five points is the most a person can meaningfully separate
 *  on a phone keypad, and it maps onto the star scale everyone already knows. */
export const MIN_SCORE = 1;
export const MAX_SCORE = 5;

// Ge'ez numerals, for completeness. They are rare in chat — Ethiopian users
// type Arabic numerals — but a customer who sends ፫ has unambiguously sent a
// three, and refusing it would be a gap nobody would ever think to report.
const GEEZ_DIGITS: Record<string, number> = {
  "፩": 1,
  "፪": 2,
  "፫": 3,
  "፬": 4,
  "፭": 5,
};

// Stars, because a Telegram or widget button may send them and because people
// genuinely type them.
const STAR = /[★⭐✩✪✫✬✭✮✯]/gu;

/**
 * A score, or null when the message is not a rating.
 *
 * Accepted: "4", " 4 ", "4.", "4/5", "★★★★", "፬", and the button payloads the
 * widget sends. Rejected: "45", "0", "6", "4 but the app is still broken",
 * and anything containing words — those are messages.
 */
export function parseRating(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;

  // Stars first: a run of stars is a rating by construction, and counting
  // them is more honest than trying to read a number out of them.
  const stars = text.match(STAR);
  if (stars && text.replace(STAR, "").trim() === "") {
    return stars.length >= MIN_SCORE && stars.length <= MAX_SCORE ? stars.length : null;
  }

  // Strip only decoration a person adds around a bare number — never letters,
  // because letters are what make something a sentence.
  const stripped = text
    .replace(/^[\s.,!?()[\]"'‘’“”]+/u, "")
    .replace(/[\s.,!?()[\]"'‘’“”]+$/u, "")
    .replace(/[።፣፤!]+$/u, "");

  if (stripped.length === 1 && stripped in GEEZ_DIGITS) {
    return GEEZ_DIGITS[stripped];
  }

  // "4/5" and "4 / 5" — a common way to answer, and unambiguous.
  const outOf = /^([1-9])\s*\/\s*5$/.exec(stripped);
  if (outOf) {
    const n = Number(outOf[1]);
    return n >= MIN_SCORE && n <= MAX_SCORE ? n : null;
  }

  // A bare integer. `^\d+$` rather than parseInt on a longer string: "45" and
  // "4pm" must not read as 4, and an order number like "4521" is exactly the
  // kind of thing a customer sends right after being asked something.
  if (!/^\d+$/.test(stripped)) return null;
  const n = Number(stripped);
  return n >= MIN_SCORE && n <= MAX_SCORE ? n : null;
}

/** How long a sent survey stays open to being answered.
 *
 *  Long enough for someone who reads their messages the next morning; short
 *  enough that a "3" sent a fortnight later — which is far more likely to be
 *  the start of a new question — is treated as a message. */
export const SURVEY_OPEN_HOURS = 48;

export interface SurveyWindow {
  csatSentAt: Date | null;
  csatScore: number | null;
}

/**
 * Is this ticket currently waiting on a rating?
 *
 * Both halves matter. Without `csatScore === null` a customer who already
 * rated could have a later "2" — plainly a new message — swallowed as a
 * second score. Without the window, a number sent weeks later is captured
 * instead of answered.
 */
export function awaitingRating(
  ticket: SurveyWindow,
  now: Date,
): boolean {
  if (!ticket.csatSentAt || ticket.csatScore !== null) return false;
  const ageHours = (now.getTime() - ticket.csatSentAt.getTime()) / 3600000;
  return ageHours >= 0 && ageHours <= SURVEY_OPEN_HOURS;
}

export interface SurveyCandidate {
  firstRespondedAt: Date | null;
  csatSentAt: Date | null;
}

/**
 * Should resolving this ticket send a survey?
 *
 * **A ticket no person ever replied to is not surveyed.** Asking "how did we
 * do?" about an exchange the desk never took part in reads as mockery, and
 * the answer would measure nothing anyway. This is the rule most worth
 * keeping: it is exactly the one an implementation gets wrong by treating
 * "resolved" as the only condition.
 *
 * A ticket already surveyed is never surveyed again, so re-resolving a
 * reopened ticket does not re-ask.
 */
export function shouldSurvey(ticket: SurveyCandidate): boolean {
  return ticket.firstRespondedAt !== null && ticket.csatSentAt === null;
}
