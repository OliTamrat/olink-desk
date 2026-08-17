// Answering a customer directly, with no person in the loop.
//
// `draft.ts` says in its own header why it needed none of this: an agent reads
// every word before it goes out, so the model's output is a starting point.
// Here there is nobody between the model and the customer, so the apparatus it
// named is the apparatus this file is.
//
// The position, in one line: **the model's only power is to refuse.** It
// cannot decide a message is answerable — `packages/guardrails` decided that
// deterministically before this was called. It cannot supply a fact —
// retrieval did that. What it can do is read the articles, judge that they do
// not actually answer the question, and say so.
import { generate, type VertexConfig } from "./vertex";

/**
 * The sentinel the model returns instead of guessing.
 *
 * A distinct token rather than a phrase, so recognising a decline is an exact
 * comparison and not a hopeful `includes("sorry")`. Bank Assist shipped a bug
 * where a decline was pasted back to the customer AS the answer — complete
 * with a source citation attached to a non-answer — because the caller only
 * checked whether the model had returned *something*.
 */
export const INSUFFICIENT_CONTEXT = "INSUFFICIENT_CONTEXT";

/** Thrown when the model read the articles and judged they do not answer. */
export class LlmDeclined extends Error {
  constructor() {
    super("model declined: retrieved articles do not answer the question");
    this.name = "LlmDeclined";
  }
}

export const ANSWER_SYSTEM = `You are answering a customer of a support desk directly. There is NO human between you and them — what you write is sent.

Your ONLY source of facts is the reference articles supplied below. You have no access to any account, order, balance, or record.

Rules:
1. If the articles do not actually answer the question, reply with exactly ${INSUFFICIENT_CONTEXT} and nothing else. This is always the correct answer when you are unsure. A person will pick the conversation up — saying nothing costs the customer a few minutes; saying something wrong costs them their trust and the desk its reputation.
2. Never invent or estimate a price, fee, rate, interest, deadline, delivery time, phone number, address, branch, opening hour, eligibility rule, or policy. If a specific figure is not written in the articles, you do not know it.
3. Answer ONLY what was asked. Do not add related information the customer did not ask for.
4. Write in the language named as the customer's language. Compose in that language rather than translating an English sentence into it: everyday spoken register, short sentences, common words over literary ones.
5. Plain text only. No markdown, no bullet characters, no headings, no links.
6. Be brief — two to four sentences. This is read on a phone, often over SMS.
7. Never claim to be a human, and never claim to be looking anything up.
8. Never promise that someone will call, reply, or follow up. You do not control that.`;

export interface AnswerInput {
  /** The customer's message, greeting already stripped by the caller. */
  question: string;
  /** Language name the model will recognise ("Amharic", not "am"). */
  language: string;
  /**
   * Articles retrieval selected. PUBLISHED ONLY — the caller filters, and a
   * draft article reaching a customer through this path is the side door the
   * publish flag exists to close.
   */
  articles: Array<{ title: string; body: string }>;
}

export function buildAnswerPrompt(input: AnswerInput): string {
  const lines: string[] = [];
  lines.push(`Customer's language: ${input.language}`);
  lines.push("");
  lines.push("Reference articles (the ONLY facts you may use):");
  for (const a of input.articles.slice(0, 3)) {
    lines.push(`--- ${a.title}`);
    lines.push(a.body.slice(0, 2000));
  }
  lines.push("");
  lines.push("Customer's question:");
  lines.push(input.question.slice(0, 1500));
  return lines.join("\n");
}

/**
 * Answer, or throw `LlmDeclined`.
 *
 * Never returns an empty or sentinel string — a caller that forgets to check
 * would otherwise send the customer a blank message or the literal word
 * INSUFFICIENT_CONTEXT. Making the decline a *throw* rather than a return
 * value is what stops that failing quietly.
 *
 * Callers must let `LlmUnavailable` propagate to the human path too: an
 * unreachable model is not an answer, and the fallback for "cannot answer" is
 * always a person, never a guess.
 */
export async function answerFromKnowledge(
  config: VertexConfig,
  input: AnswerInput,
): Promise<string> {
  // No articles means retrieval found nothing that passed its gate. Calling
  // the model here would be asking it to answer from nothing, which is the
  // one condition under which it is most likely to invent something.
  if (input.articles.length === 0) throw new LlmDeclined();

  const raw = await generate(config, {
    system: ANSWER_SYSTEM,
    prompt: buildAnswerPrompt(input),
    // Judgement call: it has to decide whether to decline before writing, so
    // it gets room to think on top of the answer itself.
    thinkingBudget: 512,
    maxOutputTokens: 1024,
  });

  const text = raw.trim();
  if (text.length === 0) throw new LlmDeclined();

  // The sentinel, however it comes back. The model is told to return it alone,
  // but a model that wraps it in a sentence has still declined, and treating
  // that as an answer would send the customer the word INSUFFICIENT_CONTEXT.
  if (text.includes(INSUFFICIENT_CONTEXT)) throw new LlmDeclined();

  return text;
}
