// BM25 retrieval with an informativeness gate.
//
// The gate is the whole reason this file is careful. Without it, one
// incidental term match returns a whole article as an answer — so a question
// like "are you the official company?" matches an article merely because both
// contain the word "company", and the customer is confidently shown something
// irrelevant instead of being put through to a person.
//
// That failure mode is worse than finding nothing. A support desk that says
// "I don't know, here is a human" is trustworthy; one that answers the wrong
// question with confidence is not, and a customer only has to hit it once.
//
// Ported from Bank Assist's retrieval findings, with its reasoning intact.

import { STOPWORDS } from "./stopwords";

export interface Doc {
  id: string;
  title: string;
  body: string;
  /** Language this text is written in — a match must be in the customer's
   *  own language, since scoring across scripts is meaningless. */
  language: string;
}

export interface Hit {
  id: string;
  title: string;
  body: string;
  score: number;
  /** How many of the question's content words this doc actually matched. */
  informativeMatches: number;
}

/** Below this many content words, a query is too short to demand a ratio. */
export const SHORT_QUERY_CONTENT_WORDS = 3;
/** For longer queries, at least this fraction of content words must be
 *  genuine low-frequency matches. */
export const MIN_INFORMATIVE_RATIO = 0.5;

const K1 = 1.5;
const B = 0.75;

/** Words, in any script. `\p{L}` so Ge'ez survives — a `[a-z]` tokeniser
 *  would return nothing at all for an Amharic question, and "no results"
 *  looks identical to "nothing matched". */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).filter(
    (w) => w.length > 1,
  );
}

/** The words that carry meaning — what the gate is measured against. */
export function contentWords(text: string): string[] {
  return [...new Set(tokenize(text).filter((w) => !STOPWORDS.has(w)))];
}

interface Indexed {
  doc: Doc;
  terms: Map<string, number>;
  length: number;
}

function indexDocs(docs: Doc[]): Indexed[] {
  return docs.map((doc) => {
    // The title is weighted by repeating it: an article called "Refund
    // policy" should beat one that mentions refunds once in passing, and
    // repetition expresses that inside BM25 rather than beside it.
    const tokens = [...tokenize(doc.title), ...tokenize(doc.title), ...tokenize(doc.body)];
    const terms = new Map<string, number>();
    for (const t of tokens) terms.set(t, (terms.get(t) ?? 0) + 1);
    return { doc, terms, length: tokens.length };
  });
}

/**
 * Search, or decline.
 *
 * Returns `[]` rather than a weak guess. Every caller treats an empty result
 * as "hand this to a person", which is the only safe default.
 */
export function retrieve(
  query: string,
  docs: Doc[],
  options: { language?: string; limit?: number } = {},
): Hit[] {
  const limit = options.limit ?? 3;

  // Language first: a Tigrinya question scored against English articles
  // produces noise, and BM25 has no way to know the scripts differ.
  const pool = options.language
    ? docs.filter((d) => d.language === options.language)
    : docs;
  if (pool.length === 0) return [];

  const words = contentWords(query);
  if (words.length === 0) return [];

  const indexed = indexDocs(pool);
  const n = indexed.length;
  const avgLen = indexed.reduce((a, d) => a + d.length, 0) / n;

  const df = new Map<string, number>();
  for (const word of words) {
    df.set(word, indexed.filter((d) => d.terms.has(word)).length);
  }

  // "Informative" means STRICTLY below half the corpus, not at it.
  //
  // On a small corpus a single ordinary word can sit in exactly half the
  // articles and be the only thing making an unrelated question match at
  // all. `(n + 1) / 2 - 1` with a floor of 1 keeps a single-article corpus
  // retrievable, which a naive `< n/2` would break.
  const informativeCeiling = Math.max(1, Math.ceil((n + 1) / 2) - 1);

  const scored = indexed.map((entry) => {
    let score = 0;
    let informativeMatches = 0;
    for (const word of words) {
      const tf = entry.terms.get(word) ?? 0;
      if (tf === 0) continue;
      const docFreq = df.get(word) ?? 0;
      if (docFreq <= informativeCeiling) informativeMatches += 1;
      const idf = Math.log(1 + (n - docFreq + 0.5) / (docFreq + 0.5));
      score += idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (entry.length / avgLen))));
    }
    return {
      id: entry.doc.id,
      title: entry.doc.title,
      body: entry.doc.body,
      score,
      informativeMatches,
    };
  });

  // The gate. Length-dependent on purpose, and no single flat ratio works:
  // a legitimate three-word question with one real match must pass, while a
  // rambling seven-word one with one incidental match must not. Longer
  // queries have more surface area for coincidental overlap, which is the
  // pattern behind every adversarial case Bank Assist found.
  const required =
    words.length <= SHORT_QUERY_CONTENT_WORDS
      ? 1
      : Math.ceil(words.length * MIN_INFORMATIVE_RATIO);

  return scored
    .filter((h) => h.score > 0 && h.informativeMatches >= required)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/**
 * Titles to offer when retrieval found nothing.
 *
 * REAL titles only, never invented — the fleet's tool-output-is-truth rule.
 * Offering a plausible-sounding article that does not exist is worse than
 * offering nothing, because the customer goes looking for it.
 */
export function suggestTitles(docs: Doc[], language: string, limit = 3): string[] {
  return docs
    .filter((d) => d.language === language)
    .slice(0, limit)
    .map((d) => d.title);
}
