// Drafting a reply for an agent.
//
// The whole safety position is in the system prompt and in what the caller is
// allowed to pass: this drafts from the CONVERSATION and the desk's own
// knowledge articles, and it is never sent by itself. An agent reads it,
// edits it, and presses send — the model's output is a starting point, not an
// outbound message.
//
// That distinction is the reason this is safe to ship without the guardrail
// apparatus Bank Assist needs. Bank Assist answers a customer directly, so a
// hallucinated interest rate reaches them. Here a person reads every word
// first. The prompt still forbids inventing specifics, because a plausible
// wrong number is harder to notice than an obvious gap.
import { generate, type VertexConfig } from "./vertex";

export const DRAFT_SYSTEM = `You draft replies for a human support agent. Your output is a DRAFT — the agent reads it, edits it, and decides whether to send it. You are not talking to the customer.

Rules:
1. Write in the language named as the customer's language. Compose in that language rather than translating an English sentence into it: everyday spoken register, short sentences, common words.
2. Use ONLY what is in the conversation and the reference articles. Never invent a price, a fee, a rate, a deadline, an account detail, a phone number, a branch, or a policy. If the answer is not there, write the reply asking for what is missing rather than guessing.
3. No greeting theatre and no sign-off block. The agent's own template supplies those. Start with the substance.
4. Plain text. No markdown, no bullet characters, no headings.
5. Be brief. Three or four sentences unless the question genuinely needs more.
6. Never promise a timescale the conversation does not already contain.`;

export interface DraftInput {
  /** Oldest first: who said what. */
  messages: Array<{ from: "customer" | "agent"; body: string }>;
  /** The language to write in, as a name the model will recognise. */
  language: string;
  subject: string | null;
  /** Knowledge articles the desk already has on this. May be empty. */
  articles: Array<{ title: string; body: string }>;
  /** What the agent typed before pressing draft, if anything. */
  intent?: string;
}

/** Everything the model is allowed to see, assembled in one place. */
export function buildPrompt(input: DraftInput): string {
  const lines: string[] = [];
  lines.push(`Customer's language: ${input.language}`);
  if (input.subject) lines.push(`Subject: ${input.subject}`);
  lines.push("");
  lines.push("Conversation so far:");
  for (const m of input.messages.slice(-12)) {
    // Trimmed per message rather than in total, so one long message cannot
    // push the rest of the conversation out of the prompt.
    lines.push(`${m.from === "customer" ? "Customer" : "Agent"}: ${m.body.slice(0, 1500)}`);
  }
  if (input.articles.length > 0) {
    lines.push("");
    lines.push("Reference articles from this desk (the only facts you may use):");
    for (const a of input.articles.slice(0, 3)) {
      lines.push(`--- ${a.title}`);
      lines.push(a.body.slice(0, 2000));
    }
  }
  if (input.intent?.trim()) {
    lines.push("");
    lines.push(`The agent wants the reply to say: ${input.intent.trim().slice(0, 500)}`);
  }
  lines.push("");
  lines.push("Write the draft reply now.");
  return lines.join("\n");
}

export async function draftReply(
  cfg: VertexConfig,
  input: DraftInput,
  overrides?: Partial<Parameters<typeof generate>[1]>,
): Promise<string> {
  return generate(cfg, {
    system: DRAFT_SYSTEM,
    prompt: buildPrompt(input),
    // Thinking on, and budgeted ON TOP of the answer: the model has to decide
    // whether the articles actually answer the question before writing, and a
    // shared budget would let that reasoning eat the reply.
    thinkingBudget: 512,
    maxOutputTokens: 700,
    temperature: 0.4,
    ...overrides,
  });
}
