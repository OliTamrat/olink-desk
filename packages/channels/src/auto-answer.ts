// The deflection loop: can this inbound message be answered without a person?
//
// Four gates, in order, and EVERY ONE of them can only say no:
//
//   1. The tenant opted in.                      (autoAnswerEnabled)
//   2. The guardrail floor allows it.            (deterministic, no model)
//   3. Retrieval found published articles that   (BM25 + informativeness gate)
//      pass its own relevance gate.
//   4. The model read them and did not decline.  (INSUFFICIENT_CONTEXT)
//
// Nothing here can turn a "no" into a "yes". That is the property worth
// protecting: adding a gate later is safe by construction, and any future
// change that lets a gate be skipped is the dangerous one.
//
// If any gate says no, the caller does exactly what it did before this file
// existed — acknowledge, open a ticket, wait for a person. **Silence is the
// safe default and it is also the current behaviour**, so a failure anywhere
// in here costs a customer a few minutes rather than telling them something
// untrue.
import { answerFromKnowledge, isConfigured, vertexConfig, LlmDeclined } from "@olink-desk/ai";
import { mayAutoAnswer, stripGreeting, type Refusal } from "@olink-desk/guardrails";
import type { PrismaClient } from "@olink-desk/database";
import { retrieve, type Doc } from "@olink-desk/retrieval";
import { LANGUAGE_NAMES, type Language } from "@olink-desk/i18n";

/** Why no answer was sent. `answered` is the only success. */
export type AutoAnswerOutcome =
  | { answered: true; text: string; articleIds: string[] }
  | { answered: false; reason: Refusal | "disabled" | "no_match" | "declined" | "unavailable" };

export interface AutoAnswerDeps {
  /** Published articles for this tenant, in the customer's language. */
  loadArticles: (language: string) => Promise<Doc[]>;
}

/**
 * Try to answer. Never throws — every failure is an outcome.
 *
 * A throw here would take down a channel webhook, which would make the
 * provider retry the whole delivery, which would duplicate the ticket. The
 * transport contract in this package is "log, never raise", and this is
 * downstream of it.
 */
export async function tryAutoAnswer(
  organization: { autoAnswerEnabled: boolean },
  text: string,
  language: string,
  deps: AutoAnswerDeps,
): Promise<AutoAnswerOutcome> {
  if (!organization.autoAnswerEnabled) return { answered: false, reason: "disabled" };

  // The deterministic floor, before anything expensive and before the model
  // is consulted at all. A refusal here never reaches Vertex, so a complaint
  // or a social-engineering probe costs nothing and leaves no trace with a
  // third party.
  const verdict = mayAutoAnswer(text);
  if (!verdict.ok) return { answered: false, reason: verdict.reason };

  // Not configured is not an error — it is the ordinary state of a
  // deployment without Vertex, and the desk works fine that way.
  if (!isConfigured()) return { answered: false, reason: "unavailable" };
  const config = vertexConfig();
  if (!config) return { answered: false, reason: "unavailable" };

  // The greeting comes off before retrieval. Greeting words are ordinary
  // content words to BM25, so leaving them in pads the query's content-word
  // count and RAISES the informativeness bar — "Selam, how do I open an
  // account?" becomes harder to answer than the same question asked bluntly.
  const query = stripGreeting(text);

  let articles: Doc[];
  try {
    articles = await deps.loadArticles(language);
  } catch {
    return { answered: false, reason: "unavailable" };
  }

  // `retrieve` enforces the relevance gate itself and returns [] when nothing
  // passes, so an empty result here means "found nothing good enough", not
  // "found nothing at all". Both lead to a person.
  const hits = retrieve(query, articles, { language, limit: 3 });
  if (hits.length === 0) return { answered: false, reason: "no_match" };

  try {
    const answer = await answerFromKnowledge(config, {
      question: query,
      // The model is given the language's NAME, not its code: "Amharic"
      // is something it recognises, "am" is ambiguous with a dozen things.
      language: LANGUAGE_NAMES[language as Language] ?? language,
      articles: hits.map((h) => ({ title: h.title, body: h.body })),
    });
    return { answered: true, text: answer, articleIds: hits.map((h) => h.id) };
  } catch (err) {
    // A decline and an outage are different facts and must stay different:
    // a decline means the desk's content did not cover the question, which is
    // a content gap worth reporting. An outage means nothing about coverage.
    if (err instanceof LlmDeclined) return { answered: false, reason: "declined" };
    return { answered: false, reason: "unavailable" };
  }
}

/**
 * The default article loader: this tenant's PUBLISHED articles, in one
 * language.
 *
 * Lives here rather than being threaded in from each webhook route, and that
 * is a correction rather than a convenience. Passing it down through seven
 * adapters and seven routes meant every channel had to be wired
 * independently, and a channel somebody forgot would silently never answer —
 * the "complete on the server, unreachable from the outside" failure this
 * codebase has hit five times. One loader, built where `db` and the
 * organization already are, cannot be half-wired.
 *
 * The off switch is `Organization.autoAnswerEnabled` and nothing else. A
 * customer on SMS deserves the same answer as one on Telegram, so there is no
 * per-channel opt-in to get wrong.
 *
 * `isPublished` is the whole safety filter here. A draft is something nobody
 * has approved, and this is the one path where its words would reach a
 * customer with no person reading them first.
 */
export function publishedArticleLoader(
  db: PrismaClient,
  organizationId: string,
): (language: string) => Promise<Doc[]> {
  return async (language: string) => {
    const rows = await db.kbArticle.findMany({
      where: { organizationId, isPublished: true },
      select: { id: true, titles: true, bodies: true },
      // A bound, so a tenant with thousands of articles cannot turn every
      // inbound message into an unbounded read. BM25 over the newest few
      // hundred is the same answer in practice.
      take: 300,
      orderBy: { updatedAt: "desc" },
    });

    const docs: Doc[] = [];
    for (const row of rows) {
      const titles = (row.titles ?? {}) as Record<string, string>;
      const bodies = (row.bodies ?? {}) as Record<string, string>;
      const title = titles[language];
      const body = bodies[language];
      // An article with no text in THIS language is skipped rather than
      // falling back to English. Scoring a Tigrinya question against English
      // prose is meaningless, and answering in the wrong language is worse
      // than not answering — retrieval's own language filter says the same.
      if (typeof title === "string" && typeof body === "string" && body.trim().length > 0) {
        docs.push({ id: row.id, title, body, language });
      }
    }
    return docs;
  };
}
