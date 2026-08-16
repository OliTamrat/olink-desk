# ADR 0013 — Deflection: the engine declines rather than guesses

- **Status:** Accepted
- **Date:** 2026-08-16
- **Context:** The strategic differentiator. Every feature so far helps a
  person answer faster; this is the first that answers *without* one — and
  the first where being wrong costs a customer rather than a minute.

## Scope, stated up front

This ships **retrieval-based** deflection: a knowledge base, BM25 search with
an informativeness gate, and an offer in the widget before a ticket is
opened. It does **not** ship LLM generation.

That is deliberate, and it is the Bank Assist posture: *the assistant must
stay fully usable with no model backend; never make the model a hard
dependency.* Everything here works with no API key, no network call to a
model, and no cost per message — and it is verifiable end to end in a sandbox
that cannot reach a model at all. Generation can sit on top of this later; it
cannot sit under it.

## The gate is the feature

Without an informativeness gate, one incidental shared word returns a whole
article as an answer. "Are you an officially registered company?" matches an
article merely because both contain "company", and the customer is confidently
shown something irrelevant instead of reaching a person.

**That failure is worse than finding nothing.** A desk that says "I don't
know, here is a human" is trustworthy; one that answers the wrong question
with confidence is not, and a customer only has to hit that once.

So `retrieve()` returns `[]` rather than a weak guess, and every caller treats
empty as "open a ticket". The gate's shape is ported from Bank Assist with its
reasoning intact:

- **"Informative" means strictly below half the corpus**, with a floor of 1.
  On a small corpus one ordinary word can sit in exactly half the articles and
  be the only thing making an unrelated question match. A naive `< n/2` would
  make a single-article corpus permanently unreachable — that edge is tested.
- **The bar is length-dependent, not one flat ratio.** A legitimate
  three-word question with one real match must pass; a rambling seven-word one
  with one incidental match must not. Longer queries have more surface area
  for coincidental overlap.
- **Stopwords cover all six languages.** The Bank Assist version was
  English-only, so an Amharic question's function words counted as content and
  Amharic was held to roughly three times the bar of English for the same
  question. That damage is invisible and falls entirely on the languages
  nobody tests. A stopword list covering one language is worse than none.
- **Tokenising is `\p{L}`, not `[a-z]`.** A Latin-only tokeniser returns
  nothing for an Amharic question, and "no results" is indistinguishable from
  "nothing matched".

## Retrieval never crosses languages

An English article shown to a Tigrinya customer is the exact failure this
product exists to avoid, so language is filtered *before* scoring — BM25 has
no way to know two scripts differ. A language with no article **declines**
rather than falling back.

## What the public surface may return

`/api/kb/[org]/search` is unauthenticated, because the customer asking is not
signed in to anything. That makes it the second public surface in the product,
so its output is deliberately narrow: **published** articles only, of **one**
organization named in the path, in the customer's language only, title and
body only — no counts, no authorship, no draft neighbours.

A draft is staff thinking out loud. The drive asserts a draft that *would*
have matched is never served.

## Nobody is trapped in a search result

The offer sits **above** the composer and never replaces it. "No, I still need
help" is always one tap away, and **the message the customer already typed is
held** so it can still be sent — losing what somebody typed because we guessed
wrong would be unforgivable.

Search only runs on the **first** message of a conversation. Once a person is
involved, interrupting the thread with search results is not help; it is a
machine talking over the conversation.

If search fails for any reason, the code falls straight through to opening the
ticket. Deflection is an optimisation; reaching a person is the product.

## Views are not deflections

`deflections` increments **only** when the customer says the article answered
them. Counting a view would make the single number that justifies writing
articles measure whether the search box was used — and every article would
look successful the moment it was written.

## Verified

19 unit tests on the engine (including the adversarial gate cases, the
single-article corpus edge, and the six-language stopword coverage) and 16
browser checks against the production standalone build, including that a
draft never reaches the public search, that a Tigrinya customer is not served
English, that an unrelated question finds nothing, that no ticket exists while
the offer is on screen, and that "still need help" opens a ticket **keeping
the customer's original words**.

## What comes next, and what it must not break

LLM generation over the retrieved articles, in the customer's language,
answering from **retrieved text only**. When that is built the rules above are
its floor, not its starting point: the gate still decides whether anything was
found, the model may still decline, and a decline takes the miss path rather
than being dressed up as an answer. Bank Assist shipped that bug once —
`LLMDeclined` handled as `LLMUnavailable` pastes back the exact text the model
just rejected.
