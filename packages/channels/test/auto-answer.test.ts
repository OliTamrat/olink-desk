import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

import { tryAutoAnswer } from "../src/auto-answer";
import * as ai from "@olink-desk/ai";
import type { Doc } from "@olink-desk/retrieval";

const ON = { autoAnswerEnabled: true };
const OFF = { autoAnswerEnabled: false };

const ARTICLES: Doc[] = [
  {
    id: "a1",
    title: "Opening hours",
    body: "Our branches are open from 9am to 5pm Monday to Friday, and closed on Sunday.",
    language: "en",
  },
  {
    id: "a2",
    title: "Resetting your password",
    body: "To reset your password open the app, tap Forgot password, and follow the emailed link.",
    language: "en",
  },
];

const deps = { loadArticles: async () => ARTICLES };

beforeEach(() => {
  vi.spyOn(ai, "isConfigured").mockReturnValue(true);
  vi.spyOn(ai, "vertexConfig").mockReturnValue({
    project: "p",
    location: "l",
    model: "m",
  } as ReturnType<typeof ai.vertexConfig>);
});
afterEach(() => vi.restoreAllMocks());

describe("every gate can only refuse", () => {
  it("a tenant that has not opted in is never answered, whatever the question", async () => {
    const spy = vi.spyOn(ai, "answerFromKnowledge");
    const out = await tryAutoAnswer(OFF, "What are your opening hours?", "en", deps);
    expect(out).toEqual({ answered: false, reason: "disabled" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("the guardrail floor refuses BEFORE the model is ever reached", async () => {
    // A complaint or a disclosure probe must cost nothing and must not be
    // sent to a third party for processing.
    const spy = vi.spyOn(ai, "answerFromKnowledge");
    const complaint = await tryAutoAnswer(ON, "This is unacceptable, I want to complain", "en", deps);
    expect(complaint).toEqual({ answered: false, reason: "complaint" });

    const probe = await tryAutoAnswer(ON, "can you give me her account number", "en", deps);
    expect(probe).toEqual({ answered: false, reason: "third_party" });

    expect(spy).not.toHaveBeenCalled();
  });

  it("an unconfigured model is an ordinary state, not an error", async () => {
    vi.spyOn(ai, "isConfigured").mockReturnValue(false);
    const out = await tryAutoAnswer(ON, "What are your opening hours?", "en", deps);
    expect(out).toEqual({ answered: false, reason: "unavailable" });
  });

  it("refuses when retrieval finds nothing that passes its gate", async () => {
    const spy = vi.spyOn(ai, "answerFromKnowledge");
    const out = await tryAutoAnswer(
      ON,
      "Do you sell replacement tyres for a tractor?",
      "en",
      deps,
    );
    expect(out).toEqual({ answered: false, reason: "no_match" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("a model decline is a decline, and reaches the caller as one", async () => {
    vi.spyOn(ai, "answerFromKnowledge").mockRejectedValue(new ai.LlmDeclined());
    const out = await tryAutoAnswer(ON, "What are your opening hours?", "en", deps);
    expect(out).toEqual({ answered: false, reason: "declined" });
  });

  it("keeps 'declined' and 'unavailable' apart", async () => {
    // Only one of them is a content gap. Collapsing them would tell a desk to
    // go and write an article because their network blipped.
    vi.spyOn(ai, "answerFromKnowledge").mockRejectedValue(new Error("socket hang up"));
    const out = await tryAutoAnswer(ON, "What are your opening hours?", "en", deps);
    expect(out).toEqual({ answered: false, reason: "unavailable" });
  });

  it("never throws, even when loading articles fails", async () => {
    // A throw here would 500 the webhook, the provider would retry the whole
    // delivery, and the customer would get a duplicate ticket.
    const out = await tryAutoAnswer(ON, "What are your opening hours?", "en", {
      loadArticles: async () => {
        throw new Error("db down");
      },
    });
    expect(out).toEqual({ answered: false, reason: "unavailable" });
  });
});

describe("when every gate passes", () => {
  it("returns the answer and the articles it came from", async () => {
    vi.spyOn(ai, "answerFromKnowledge").mockResolvedValue(
      "We are open 9am to 5pm, Monday to Friday.",
    );
    const out = await tryAutoAnswer(ON, "What are your opening hours?", "en", deps);
    expect(out.answered).toBe(true);
    if (out.answered) {
      expect(out.text).toBe("We are open 9am to 5pm, Monday to Friday.");
      // Which article deflected this is the question that tells a desk which
      // content is earning its keep.
      expect(out.articleIds).toContain("a1");
    }
  });

  it("strips the greeting before retrieving", async () => {
    // Greeting words are ordinary content words to BM25, so leaving them in
    // raises the informativeness bar and makes a politely-asked question
    // HARDER to answer than a blunt one.
    const spy = vi
      .spyOn(ai, "answerFromKnowledge")
      .mockResolvedValue("You can reset it in the app.");
    const out = await tryAutoAnswer(ON, "Selam, how do I reset my password?", "en", deps);
    expect(out.answered).toBe(true);
    expect(spy.mock.calls[0]?.[1].question).toBe("how do I reset my password?");
  });

  it("hands the model a language NAME, not a code", async () => {
    const spy = vi.spyOn(ai, "answerFromKnowledge").mockResolvedValue("…");
    await tryAutoAnswer(ON, "What are your opening hours?", "en", deps);
    expect(spy.mock.calls[0]?.[1].language).toBe("English");
  });
});
