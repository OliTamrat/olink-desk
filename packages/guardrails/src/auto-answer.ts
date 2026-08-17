// May this message be answered by the machine, with no person in the loop?
//
// This is the floor, and it is DELIBERATELY NOT A MODEL. Every decision here
// is a deterministic rule over the customer's own words, because the failure
// this prevents — a confident wrong answer sent to a customer in a bank's
// name — is exactly the failure a model cannot be trusted to catch about
// itself. The model gets a vote later, and it can only vote *against*
// answering (see LlmDeclined); it can never overrule this file.
//
// `packages/ai` deliberately does not import this and this deliberately does
// not import `packages/ai`. The safety floor holding when the model is
// unreachable, misconfigured, or wrong is the entire point.
//
// Ported doctrine from Olink Bank Assist, adapted from banking to a support
// desk. The lesson carried over unchanged: **over-refusal is the failure mode
// you cannot see from inside.** Every rule below has cases in both directions
// in the test file — "does the dangerous thing get through" AND "is an
// ordinary customer being turned away" — because only the first is natural to
// write, and a rule tested in one direction is half-tested.

/** Why a message will not be auto-answered. Machine-readable, never prose. */
export type Refusal =
  | "empty"
  | "too_short"
  | "greeting_only"
  | "not_a_question"
  | "account_specific"
  | "third_party"
  | "complaint"
  | "money_movement"
  | "human_requested";

export type Verdict = { ok: true } | { ok: false; reason: Refusal };

const ALLOW: Verdict = { ok: true };
const deny = (reason: Refusal): Verdict => ({ ok: false, reason });

/**
 * Shortest message worth answering, in characters.
 *
 * Not arbitrary: below this a message is an acknowledgement ("ok", "thanks",
 * "yes", "እሺ") rather than a question, and retrieval on two words is noise.
 * The customer is not owed an answer to "ok" — they are owed silence.
 */
export const MIN_ANSWERABLE_CHARS = 12;

// ---------------------------------------------------------------------------
// Greetings. A greeting alone gets the ordinary acknowledgement, not an
// answer — but a greeting ATTACHED to a question must not suppress the answer,
// which is how Bank Assist's first version broke: "Selam, how do I open an
// account?" was treated as a greeting and answered with a wave.
// ---------------------------------------------------------------------------
const GREETING =
  /\b(hi|hello|hey|good\s+(morning|afternoon|evening)|selam|salam|akkam|asalam|hola)\b|ሰላም|ጤና|እንደምን|ሰላማት/iu;

/** Greeting words removed, so what remains is the actual request. */
export function stripGreeting(text: string): string {
  return text
    .replace(new RegExp(GREETING.source, "giu"), " ")
    .replace(/^[\s,.!—–-]+/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Account-specific: something only the desk's own back-office system knows.
//
// The line is drawn on what ANSWERING REQUIRES, not on what the message
// mentions. "What is my balance" needs a value we do not hold; "how do I check
// my balance" is a published how-to and is answerable. Both say *my balance* —
// which is precisely why a keyword list alone gets this wrong, and why the
// procedural forms are checked FIRST and allowed through.
// ---------------------------------------------------------------------------
const PROCEDURAL_LATIN =
  /\b(how (do|can|would|should)|what (is|are) the (process|procedure|steps|requirement)|where (do|can)|can i|do i need|what documents|how long does|how much does it cost to|akkamitti|akkam.{0,20}danda|sidee|jinsi gani|namna gani|nawezaje|ninawezaje)\b/iu;

/**
 * The same escape hatch, in the scripts that do not use `\b`.
 *
 * THIS EXISTS BECAUSE ITS ABSENCE WAS THE BUG, and the bug is worth naming
 * because it is the shape every multilingual rule in this fleet fails in:
 * the English rule had a procedural allowance and the other five did not, so
 * "how can I change my password" was answered in English and refused in
 * Amharic as an account-specific request. Same question, same customer, and
 * the desk that claims six languages quietly serves one.
 *
 * Nothing about that is visible from a passing test suite written in English,
 * and it is invisible in production too — an over-refused customer does not
 * complain, they just get a slower answer from a person and conclude the
 * product is ordinary.
 *
 * `እንዴት` / `ብኸመይ` / `ከመይ` are "how"; the infinitive-plus-can forms are the
 * everyday way of asking to be shown a procedure.
 */
const PROCEDURAL_GEEZ =
  /እንዴት|ብኸመይ|ከመይ|ሂደት|ምን ማድረግ|የት ማግኘት|ማድረግ እችላለሁ|እችላለሁ|ይቻላል/u;

const isProcedural = (text: string): boolean =>
  PROCEDURAL_LATIN.test(text) || PROCEDURAL_GEEZ.test(text);

const ACCOUNT_NOUN =
  /\b(balance|statement|transaction|order|invoice|bill|account number|reference number|tracking|shipment|delivery|ticket status|application status|claim|policy number|pin|password|otp)\b/iu;

/**
 * Amharic account words, matched across the possessive.
 *
 * Amharic suffixes possession onto the stem rather than putting a word in
 * front of it: ሒሳብ (account) becomes ሒሳቤ (my account), ገንዘብ (money) becomes
 * ገንዘቤ (my money), ትዕዛዝ (order) becomes ትዕዛዜ (my order). A regex built from
 * the bare stem matches the dictionary form and misses every sentence a
 * customer actually types — which is the single most common way a non-English
 * rule in this fleet turns out to be decorative.
 *
 * So the final consonant is matched as its whole vowel series. Ge'ez is a
 * syllabary: one character carries consonant+vowel, and inflection changes
 * that character rather than adding one.
 */
const AMHARIC_ACCOUNT =
  /[ሒሂ]ሳ[በቡቢባቤብቦ]|ገንዘ[በቡቢባቤብቦ]|ትዕዛ[ዘዙዚዛዜዝዞ]|መለያ ቁጥር|የይለፍ ቃል/u;

// ---------------------------------------------------------------------------
// Third party: asking about somebody else's account. This is the social
// engineering case, and the shape is an account word + another person +
// the speaker asking to RECEIVE something.
//
// Direction is what separates it from an ordinary request. "Send money to his
// account" and "tell me his account number" both name an account and another
// person; only the second asks to be told. Bank Assist refused legitimate
// transfers for a fortnight by checking only the first two.
// ---------------------------------------------------------------------------
const THIRD_PARTY_MARKER =
  /\b(his|her|their|my (friend|wife|husband|brother|sister|mother|father|son|daughter|colleague)|someone else|another (person|customer)|the customer's)\b/iu;

const ASKS_TO_RECEIVE =
  /\b(tell me|give me|send me|show me|what is|what's|can you (tell|give|send|show)|i need to know|find out)\b/iu;

const FORGOT_FORM =
  /\b(forgot|lost|can't remember|cannot remember|doesn't remember|does not remember)\b/iu;

// ---------------------------------------------------------------------------
// Complaint. A grievance is never auto-answered — not because the machine
// could not produce sentences, but because a person who is angry and gets a
// machine is angrier, and that is the interaction that ends up screenshotted.
//
// NOTE the deliberate absence of "not working" and "broken" here. A broken
// thing is a QUESTION, not a grievance: "the app is not working, what do I
// do?" is the single most answerable message a desk receives, and Bank Assist
// spent a release filing it as a complaint and never reading the knowledge
// base at all.
// ---------------------------------------------------------------------------
const COMPLAINT =
  /\b(complain|complaint|unacceptable|disgrace|disgusted|appalling|furious|angry|scam|scammed|fraud|stole|stolen|cheated|lied|liar|sue|lawyer|legal action|ombudsman|report you|worst)\b/iu;

/** Money leaving or being reversed. Always a person, on any channel. */
const MONEY_MOVEMENT =
  /\b(refund|charge ?back|cancel (my|the) (order|subscription|account|payment)|reverse (the|this|my) (payment|transaction|charge)|money back|close my account|delete my account)\b/iu;

/** An explicit ask for a human is honoured immediately and literally. */
const HUMAN_REQUESTED =
  /\b(speak|talk|chat) (to|with) (a|an|someone|somebody|real|human|person|agent|operator)\b|\b(human|real person|customer service representative|agent please)\b|ሰው ማነጋገር|ሰው እፈልጋለሁ/iu;

/**
 * Does this read as a request for information at all?
 *
 * Split by script on purpose. `\b` is defined by `[A-Za-z0-9_]`, so a word
 * boundary before a Ge'ez character can NEVER match — `\bእንዴት` is dead
 * regex that silently tests nothing. Every Amharic question word in the first
 * version of this file was inert for exactly that reason, and the suite still
 * passed because the English cases carried it.
 *
 * Latin keeps `\b` (it needs it: "can" must not match inside "cancel").
 * Ge'ez is matched bare, which is safe because the syllabary has no
 * lookalike-substring problem of that kind.
 */
const QUESTION_SHAPE_LATIN =
  /\?|\b(how|what|when|where|which|why|who|can|could|do|does|is|are|will|would|should|need|want|help|tell|akkam|maal|hangam|eessa|yoom|sidee|xaggee|vipi|lini)\b/iu;

const QUESTION_SHAPE_GEEZ = /፧|እንዴት|ምን|መቼ|የት|ስንት|ማን|ለምን|የትኛው|እችላለሁ|አለ\?|ይቻላል/u;

const isQuestionShaped = (text: string): boolean =>
  QUESTION_SHAPE_LATIN.test(text) || QUESTION_SHAPE_GEEZ.test(text);

/**
 * The decision.
 *
 * Order is load-bearing and each position is defended:
 *
 *  1. An explicit request for a human wins over everything, including a
 *     perfectly answerable question. Answering it anyway is the behaviour
 *     people hate most about support bots.
 *  2. Complaints and money movement outrank answerability for the same
 *     reason — being right is not the point.
 *  3. The third-party check runs BEFORE the account check, so a disclosure
 *     request cannot use its own account word to fall into the milder branch.
 *  4. The procedural allowance runs LAST among the account rules, so
 *     "how do I check my balance" survives while "what is my balance" does
 *     not.
 */
export function mayAutoAnswer(raw: string): Verdict {
  const text = (raw ?? "").trim();
  if (text.length === 0) return deny("empty");

  if (HUMAN_REQUESTED.test(text)) return deny("human_requested");
  if (COMPLAINT.test(text)) return deny("complaint");
  if (MONEY_MOVEMENT.test(text)) return deny("money_movement");

  const stripped = stripGreeting(text);
  // A greeting and nothing else. Checked on the STRIPPED text so that a
  // greeting carrying a real question falls through to the rules below.
  if (stripped.length === 0) return deny("greeting_only");

  // ---- SAFETY RULES BEFORE SHAPE RULES ----
  //
  // The order here is the fix for a bug this file shipped with: the shape
  // checks used to run first, so "my brother forgot his account number" —
  // a disclosure request with no question word in it — came back
  // `not_a_question` instead of `third_party`.
  //
  // Both refuse, so the customer got the same silence either way and the
  // safety outcome looked fine. What broke was everything DOWNSTREAM of the
  // reason: a `not_a_question` is filed as an ordinary unanswered message, so
  // the content-gaps report would have told the bank to go and write a help
  // article answering a social-engineering probe. Bank Assist hit exactly
  // this, and the lesson recorded there is that getting the refusal wrong is
  // never one bug — it is the refusal, plus what the desk then does about it.
  //
  // So: "must this never be answered" is decided before "is this even worth
  // answering".
  const mentionsAccount = ACCOUNT_NOUN.test(stripped) || AMHARIC_ACCOUNT.test(stripped);
  const forgotForm = FORGOT_FORM.test(stripped);

  if (
    (mentionsAccount || forgotForm) &&
    THIRD_PARTY_MARKER.test(stripped) &&
    (ASKS_TO_RECEIVE.test(stripped) || forgotForm)
  ) {
    return deny("third_party");
  }

  // The procedural allowance deliberately falls THROUGH to the shape checks
  // rather than returning early — a single exit is easier to reason about,
  // and a procedural phrasing is question-shaped by construction anyway.
  if (mentionsAccount && !isProcedural(stripped)) {
    return deny("account_specific");
  }

  // ---- SHAPE RULES ----
  if (stripped.length < MIN_ANSWERABLE_CHARS) return deny("too_short");
  if (!isQuestionShaped(stripped)) return deny("not_a_question");

  return ALLOW;
}
