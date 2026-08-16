import { describe, expect, it } from "vitest";

import { contentWords, retrieve, suggestTitles, tokenize, type Doc } from "../src/retrieve";
import { STOPWORDS, STOPWORDS_BY_LANGUAGE } from "../src/stopwords";

const doc = (id: string, title: string, body: string, language = "en"): Doc => ({
  id,
  title,
  body,
  language,
});

// A small, realistic desk knowledge base.
const KB: Doc[] = [
  doc(
    "refund",
    "Refund policy",
    "You can request a refund within 14 days of delivery. Refunds are returned to the original payment method and take 3 to 5 working days.",
  ),
  doc(
    "delivery",
    "Delivery times",
    "Standard delivery inside Addis Ababa takes 2 working days. Delivery to other regions takes 4 to 7 working days.",
  ),
  doc(
    "password",
    "Resetting your password",
    "Open the app, choose sign in, then choose forgot password. A reset code is sent to your phone.",
  ),
  doc(
    "hours",
    "Opening hours",
    "Our support team answers Monday to Friday, 9am to 5pm.",
  ),
];

describe("tokenize", () => {
  it("keeps letters in every script", () => {
    // A `[a-z]` tokeniser returns NOTHING for an Amharic question, and "no
    // results" is indistinguishable from "nothing matched".
    expect(tokenize("ገንዘብ ተመላሽ")).toEqual(["ገንዘብ", "ተመላሽ"]);
    expect(tokenize("Kaffaltii deebi'uu")).toEqual(["kaffaltii", "deebi'uu"]);
  });

  it("drops single characters and punctuation", () => {
    expect(tokenize("a refund, please!")).toEqual(["refund", "please"]);
  });
});

describe("contentWords", () => {
  it("removes function words", () => {
    expect(contentWords("how do I get a refund")).toEqual(["refund"]);
  });

  it("removes them in EVERY language, not just English", () => {
    // The Bank Assist finding this exists for: an English-only list left an
    // Amharic question's function words counted as content, so Amharic was
    // held to roughly three times the bar of English for the same question.
    // The damage is invisible and falls entirely on untested languages.
    for (const [lang, words] of Object.entries(STOPWORDS_BY_LANGUAGE)) {
      const missing = words.filter((w) => !STOPWORDS.has(w));
      expect(missing, `${lang} stopwords not in the merged set`).toEqual([]);
    }
  });

  it("deduplicates", () => {
    expect(contentWords("refund refund refund")).toEqual(["refund"]);
  });
});

describe("retrieve — finding the right thing", () => {
  it("finds the article a question is actually about", () => {
    const hits = retrieve("how do I get a refund", KB);
    expect(hits[0]?.id).toBe("refund");
  });

  it("prefers the article whose TITLE matches", () => {
    const hits = retrieve("delivery times to regions", KB);
    expect(hits[0]?.id).toBe("delivery");
  });

  it("answers a short question with one real match", () => {
    // "refund" alone is 1 content word — a ratio rule would reject it, and
    // it is the single most common thing a customer types.
    expect(retrieve("refund", KB)[0]?.id).toBe("refund");
    expect(retrieve("password reset", KB)[0]?.id).toBe("password");
  });
});

describe("retrieve — the informativeness gate", () => {
  it("declines a rambling question that only matched incidentally", () => {
    // The failure this gate exists for: one shared ordinary word returning a
    // whole article as an answer. A confident wrong answer costs a customer;
    // "I do not know, here is a person" does not.
    expect(retrieve("are you an official registered company or not", KB)).toEqual([]);
  });

  it("declines when nothing matches at all", () => {
    expect(retrieve("what is the capital of France", KB)).toEqual([]);
  });

  it("declines a query of pure function words", () => {
    expect(retrieve("hello please can you", KB)).toEqual([]);
    expect(retrieve("", KB)).toEqual([]);
  });

  it("holds a LONGER query to a higher bar than a short one", () => {
    // Longer queries have more surface area for coincidental overlap, which
    // is why the bar is length-dependent rather than one flat ratio.
    const short = retrieve("delivery days", KB);
    expect(short.length).toBeGreaterThan(0);

    const padded = retrieve(
      "delivery is something my cousin mentioned about his own unrelated situation",
      KB,
    );
    expect(padded).toEqual([]);
  });

  it("stays retrievable on a single-article corpus", () => {
    // The edge the `max(1, …)` floor protects: with one article every word
    // sits in 100% of the corpus, and a naive "below half" rule would make
    // it permanently unreachable.
    const one = [KB[0]];
    expect(retrieve("refund policy", one)[0]?.id).toBe("refund");
  });

  it("is not fooled by a word sitting in exactly half the corpus", () => {
    // "delivery" is in both of these; only one is about it.
    const two = [
      doc("a", "Delivery times", "Delivery takes two days inside the city."),
      doc("b", "Packaging", "Delivery boxes are recyclable cardboard."),
    ];
    // A question about the word alone is genuinely ambiguous; what must NOT
    // happen is an unrelated question matching purely on it.
    expect(retrieve("is your delivery company officially registered", two)).toEqual([]);
  });
});

describe("retrieve — language", () => {
  const MIXED: Doc[] = [
    doc("en-refund", "Refund policy", "You can request a refund within 14 days."),
    doc("am-refund", "የገንዘብ ተመላሽ ፖሊሲ", "በ14 ቀናት ውስጥ ገንዘብ ተመላሽ መጠየቅ ይችላሉ።", "am"),
  ];

  it("answers an Amharic question from the Amharic article", () => {
    const hits = retrieve("ገንዘብ ተመላሽ", MIXED, { language: "am" });
    expect(hits[0]?.id).toBe("am-refund");
  });

  it("never returns an article in the wrong language", () => {
    // Scoring across scripts is meaningless, and answering a Tigrinya
    // customer in English is the exact failure the whole product exists to
    // avoid.
    const hits = retrieve("refund", MIXED, { language: "am" });
    for (const h of hits) expect(h.id.startsWith("am-")).toBe(true);
  });

  it("declines rather than falling back to another language", () => {
    expect(retrieve("refund policy", MIXED, { language: "ti" })).toEqual([]);
  });
});

describe("suggestTitles", () => {
  it("offers only REAL titles", () => {
    // Tool-output-is-truth: a plausible-sounding article that does not exist
    // is worse than none, because the customer goes looking for it.
    const titles = suggestTitles(KB, "en", 2);
    expect(titles).toHaveLength(2);
    for (const t of titles) {
      expect(KB.some((d) => d.title === t)).toBe(true);
    }
  });

  it("offers nothing in a language with no articles", () => {
    expect(suggestTitles(KB, "so")).toEqual([]);
  });
});
