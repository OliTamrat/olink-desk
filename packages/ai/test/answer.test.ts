import { describe, expect, it, vi, afterEach } from "vitest";

import {
  ANSWER_SYSTEM,
  answerFromKnowledge,
  buildAnswerPrompt,
  INSUFFICIENT_CONTEXT,
  LlmDeclined,
} from "../src/answer";
import * as vertex from "../src/vertex";

const CONFIG = { project: "p", location: "l", model: "m" } as vertex.VertexConfig;
const ARTICLES = [{ title: "Opening hours", body: "We are open 9 to 5, Monday to Friday." }];

afterEach(() => vi.restoreAllMocks());

const modelSays = (text: string) =>
  vi.spyOn(vertex, "generate").mockResolvedValue(text);

describe("the decline is a throw, not a return value", () => {
  it("throws when the model returns the bare sentinel", async () => {
    modelSays(INSUFFICIENT_CONTEXT);
    await expect(
      answerFromKnowledge(CONFIG, { question: "q", language: "English", articles: ARTICLES }),
    ).rejects.toBeInstanceOf(LlmDeclined);
  });

  it("throws when the model wraps the sentinel in a sentence", async () => {
    // A model that says "I'm afraid this is INSUFFICIENT_CONTEXT" has still
    // declined. Returning that would send the customer the literal token.
    modelSays(`I'm sorry, ${INSUFFICIENT_CONTEXT}`);
    await expect(
      answerFromKnowledge(CONFIG, { question: "q", language: "English", articles: ARTICLES }),
    ).rejects.toBeInstanceOf(LlmDeclined);
  });

  it("throws on an empty or whitespace answer rather than sending nothing", async () => {
    modelSays("   \n  ");
    await expect(
      answerFromKnowledge(CONFIG, { question: "q", language: "English", articles: ARTICLES }),
    ).rejects.toBeInstanceOf(LlmDeclined);
  });

  it("never calls the model at all when retrieval found nothing", async () => {
    // Answering from no articles is the condition under which invention is
    // most likely, so this is refused before a request is even made.
    const spy = modelSays("anything");
    await expect(
      answerFromKnowledge(CONFIG, { question: "q", language: "English", articles: [] }),
    ).rejects.toBeInstanceOf(LlmDeclined);
    expect(spy).not.toHaveBeenCalled();
  });

  it("lets an unreachable model propagate — it is not a decline", async () => {
    // The fallback for "cannot answer" is a person, never a guess, and the
    // caller must be able to tell "the model said no" from "the model was
    // not reachable" because only one of them is a content gap.
    const boom = new vertex.LlmUnavailable("network");
    vi.spyOn(vertex, "generate").mockRejectedValue(boom);
    await expect(
      answerFromKnowledge(CONFIG, { question: "q", language: "English", articles: ARTICLES }),
    ).rejects.toBe(boom);
  });
});

describe("a real answer comes back trimmed", () => {
  it("returns the model's text", async () => {
    modelSays("  We are open 9 to 5, Monday to Friday.  ");
    const out = await answerFromKnowledge(CONFIG, {
      question: "what time do you open",
      language: "English",
      articles: ARTICLES,
    });
    expect(out).toBe("We are open 9 to 5, Monday to Friday.");
  });
});

describe("the prompt only ever carries what it is allowed to", () => {
  it("includes the articles and the question", () => {
    const p = buildAnswerPrompt({
      question: "what time do you open",
      language: "Amharic",
      articles: ARTICLES,
    });
    expect(p).toContain("Amharic");
    expect(p).toContain("Opening hours");
    expect(p).toContain("what time do you open");
  });

  it("caps the article count, so a broad match cannot flood the prompt", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      title: `T${i}`,
      body: `B${i}`,
    }));
    const p = buildAnswerPrompt({ question: "q", language: "English", articles: many });
    expect(p).toContain("T0");
    expect(p).not.toContain("T3");
  });
});

describe("the system prompt keeps its load-bearing refusals", () => {
  // These are asserted rather than trusted because the prompt is the only
  // thing standing between a customer and an invented interest rate, and a
  // well-meaning edit that "tightens the wording" can drop one silently.
  it("names the sentinel", () => {
    expect(ANSWER_SYSTEM).toContain(INSUFFICIENT_CONTEXT);
  });

  it("forbids inventing figures by name", () => {
    for (const forbidden of ["price", "fee", "rate", "deadline", "policy"]) {
      expect(ANSWER_SYSTEM.toLowerCase()).toContain(forbidden);
    }
  });

  it("tells it there is no human in the loop", () => {
    expect(ANSWER_SYSTEM).toMatch(/NO human between you and them/i);
  });

  it("forbids promising a follow-up it does not control", () => {
    expect(ANSWER_SYSTEM.toLowerCase()).toMatch(/never promise/);
  });

  it("says to compose in the language rather than translate into it", () => {
    expect(ANSWER_SYSTEM).toMatch(/compose in that language rather than translating/i);
  });
});
