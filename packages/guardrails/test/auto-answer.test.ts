import { describe, expect, it } from "vitest";

import { mayAutoAnswer, stripGreeting, type Refusal } from "../src/auto-answer";

/** Assert a refusal AND its reason — "refused for the wrong reason" is a bug. */
const refused = (text: string, reason: Refusal) => {
  const v = mayAutoAnswer(text);
  expect(v.ok, `expected refusal for: ${text}`).toBe(false);
  if (!v.ok) expect(v.reason, `wrong reason for: ${text}`).toBe(reason);
};
const allowed = (text: string) => {
  const v = mayAutoAnswer(text);
  expect(v.ok, `expected ALLOW for: ${text} — got ${v.ok ? "" : v.reason}`).toBe(true);
};

// ===========================================================================
// THE DIRECTION THAT IS NATURAL TO TEST: does the dangerous thing get through?
// ===========================================================================

describe("an explicit request for a human is honoured", () => {
  it.each([
    "I want to speak to a human",
    "can I talk to someone please",
    "let me chat with an agent",
    "I need a real person",
    "ሰው ማነጋገር እፈልጋለሁ",
  ])("%s", (t) => refused(t, "human_requested"));

  it("wins even over a perfectly answerable question", () => {
    // Answering anyway is the single behaviour people hate most about
    // support bots, and the question being easy is not a defence.
    refused("How do I reset my password? Actually just let me talk to a human", "human_requested");
  });
});

describe("complaints go to a person", () => {
  it.each([
    "this is unacceptable, I have been waiting a week",
    "your agent lied to me",
    "I think I have been scammed",
    "someone stole money from my card",
    "I will take legal action",
    "I want to make a complaint about the service",
  ])("%s", (t) => refused(t, "complaint"));
});

describe("money movement goes to a person", () => {
  it.each([
    "I want a refund for this order",
    "please cancel my subscription",
    "reverse this payment immediately",
    "how do I get my money back",
    "I want to close my account",
  ])("%s", (t) => refused(t, "money_movement"));
});

describe("account-specific values are refused", () => {
  it.each([
    "what is my balance",
    "what's my account number",
    "where is my order",
    "what is the status of my claim",
    "can you tell me my PIN",
    "ቀሪ ሒሳቤ ስንት ነው",
  ])("%s", (t) => refused(t, "account_specific"));
});

describe("somebody else's account is refused as third-party, not as merely account-specific", () => {
  it.each([
    "can you give me her account number",
    "tell me his balance please",
    "my wife forgot her PIN, what is it",
    "what is the customer's reference number",
    "she forgot her password can you tell me",
  ])("%s", (t) => refused(t, "third_party"));

  it("the forgot-form is a complete request on its own", () => {
    // "she forgot her PIN" asks to be told what it is without ever using a
    // give-me verb. A rule built only from possessives missed this entirely
    // in Bank Assist.
    refused("my brother forgot his account number", "third_party");
  });
});

// ===========================================================================
// THE DIRECTION NOBODY WRITES: is an ordinary customer being turned away?
//
// Over-refusal is invisible from inside — a desk that answers nothing looks
// exactly like a desk with a cautious guardrail. Every one of these is a
// message a real customer sends and a help centre can answer.
// ===========================================================================

describe("ordinary answerable questions are ALLOWED", () => {
  it.each([
    "How do I reset my password?",
    "What are your opening hours on Saturday?",
    "How long does delivery usually take?",
    "Where can I download the mobile app?",
    "Do I need to bring my ID to open an account?",
    "What documents are required for registration?",
    "How much does it cost to send money to another bank?",
    "Can I use the service without a smartphone?",
    "The app is not working, what should I do?",
    "My app keeps crashing when I log in, any advice?",
  ])("%s", (t) => allowed(t));

  it("a broken thing is a question, not a grievance", () => {
    // 'not working' and 'failed' sat in the complaint list in Bank Assist, so
    // the most answerable message a desk receives was filed as a grievance and
    // the knowledge base was never read.
    allowed("my payment failed, what should I do now?");
    allowed("the website is broken on my phone, is there a fix?");
  });
});

describe("procedural questions about accounts survive the account rule", () => {
  it.each([
    "How do I check my balance?",
    "How can I see my order status?",
    "Where do I find my account number in the app?",
    "What is the process to get a statement?",
    "How do I change my password?",
  ])("%s", (t) => allowed(t));

  it("draws the line on what ANSWERING requires, not on what is mentioned", () => {
    // Both say "my balance". Only one needs a value the desk does not hold.
    allowed("how do I check my balance");
    refused("what is my balance", "account_specific");
  });
});

describe("a transfer to another person is ordinary, not social engineering", () => {
  it("names an account and another person, and is still allowed", () => {
    // The inverse bug: two of the three signals are present in the most
    // ordinary request a desk receives. Direction is what separates them.
    allowed("how do I send money to my friend's account?");
    allowed("can I transfer to another person using the app?");
  });
});

// ===========================================================================
// Shape rules
// ===========================================================================

describe("greetings", () => {
  it("a greeting alone is not answered — the acknowledgement is right", () => {
    refused("Hello", "greeting_only");
    refused("selam", "greeting_only");
    refused("ሰላም", "greeting_only");
  });

  it("a greeting ATTACHED to a question does not suppress the answer", () => {
    // Bank Assist's first version answered this with a wave. Ethiopians
    // code-switch constantly, so a mixed greeting is the norm, not the edge.
    allowed("Selam, how do I open an account?");
    allowed("Hi akkam, what are your opening hours?");
    allowed("ሰላም, how do I reset my password?");
  });

  it("stripGreeting leaves the request intact", () => {
    expect(stripGreeting("Selam, how do I open an account?")).toBe(
      "how do I open an account?",
    );
    expect(stripGreeting("Hello")).toBe("");
  });
});

describe("messages that are not questions", () => {
  it("acknowledgements get silence, not an answer", () => {
    refused("ok", "too_short");
    refused("thanks!", "too_short");
    refused("", "empty");
    refused("   ", "empty");
  });

  it("a statement with no request is not answered", () => {
    refused("Just letting you know I received the package yesterday.", "not_a_question");
  });

  it("but a long question without a question mark IS answered", () => {
    // Typed on a phone keypad, punctuation is the first thing to go.
    allowed("how do i change the delivery address on an order");
  });
});

describe("the reason is machine-readable, never prose", () => {
  it("returns a stable token a caller can branch on", () => {
    const v = mayAutoAnswer("what is my balance");
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(typeof v.reason).toBe("string");
      // No sentence, no punctuation, no language — this is read by code and
      // rendered from the i18n table, in the reader's own language.
      expect(v.reason).toMatch(/^[a-z_]+$/);
    }
  });
});

// ===========================================================================
// Regressions from two bugs this file shipped with, both invisible to a suite
// that only exercised English. Each assertion below FAILS against the version
// before it, which is the only reason to trust the fix.
// ===========================================================================

describe("Ge'ez is actually matched, not decoratively matched", () => {
  it("a word boundary before a Ge'ez character can never match", () => {
    // The bug: every Amharic alternative was written `\bእንዴት`. `\b` is
    // defined by [A-Za-z0-9_], so a boundary before a Ge'ez character is
    // unsatisfiable — the rules were inert and the English cases carried the
    // suite. Asserted here so nobody reintroduces the `\b` "for consistency".
    expect(/\bእንዴት/u.test("እንዴት ማድረግ እችላለሁ")).toBe(false);
    expect(/እንዴት/u.test("እንዴት ማድረግ እችላለሁ")).toBe(true);
  });

  it("an Amharic question carried only by a Ge'ez question word is answered", () => {
    allowed("እንዴት የይለፍ ቃል መቀየር እችላለሁ");
    allowed("የስራ ሰዓታችሁ መቼ ነው");
  });

  it("an Amharic account question is still refused", () => {
    refused("ቀሪ ሒሳቤ ስንት ነው", "account_specific");
    refused("ትዕዛዜ የት ደረሰ", "account_specific");
  });
});

describe("Amharic possession is suffixed, not prefixed", () => {
  it("the bare dictionary stem misses the form customers type", () => {
    // ሒሳብ (account) → ሒሳቤ (my account). A rule built from the stem matches
    // the dictionary and nothing else.
    expect(/ሒሳብ/u.test("ቀሪ ሒሳቤ")).toBe(false);
    expect(mayAutoAnswer("ቀሪ ሒሳቤ ስንት ነው").ok).toBe(false);
  });

  it("catches money and order in their possessed forms too", () => {
    refused("ገንዘቤ የት አለ", "account_specific");
  });
});

describe("safety is decided before shape", () => {
  it("a statement-shaped disclosure request is third_party, not not_a_question", () => {
    // Both refuse, so the customer sees the same silence and the safety
    // outcome looks fine either way. What breaks is downstream: a
    // `not_a_question` is filed as an ordinary unanswered message, so the
    // gaps report would tell the bank to write a help article answering a
    // social-engineering probe.
    refused("my brother forgot his account number", "third_party");
    refused("her password is lost, give me a new one", "third_party");
  });
});
