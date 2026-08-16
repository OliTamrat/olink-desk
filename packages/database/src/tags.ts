// Tag normalisation.
//
// Lives beside the schema because the slug is what carries the uniqueness
// constraint — it is a property of the data model, not of any one route, and
// three callers computing it slightly differently would defeat the
// constraint rather than enforce it.
//
// The whole reason tags exist in this product is to be COUNTED later: "what
// are people contacting us about" is unanswerable today. A desk that ends up
// with "Refund", "refund", "refunds " and "Refund " as four tags produces a
// report that is quietly wrong, and quietly wrong is the worst kind.

/** Longest a tag may be. Past this it is a note, not a label. */
export const MAX_TAG_LENGTH = 40;

/**
 * The normalised form two tags are considered the same by.
 *
 * Case-folded, trimmed, inner whitespace collapsed, and spaces and
 * underscores unified to hyphens — so "Failed payment", "failed_payment" and
 * "failed-payment" are one tag rather than three.
 *
 * Deliberately NOT stemmed: "refund" and "refunds" stay distinct. Stemming
 * would silently merge labels a person chose on purpose, and unlike a
 * spelling variant there is no way for them to tell it happened.
 */
export function tagSlug(raw: string): string {
  return raw
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    // Punctuation a person types around a label carries no meaning, but
    // letters in ANY script do — Ge'ez tags must survive this unchanged.
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The display form: what a person typed, tidied but not flattened. */
export function tagDisplayName(raw: string): string {
  return raw.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH);
}

/** Why this tag cannot be stored, or null. */
export function tagError(raw: string): string | null {
  const display = tagDisplayName(raw);
  if (!display) return "A tag needs a name";
  if (raw.trim().length > MAX_TAG_LENGTH) {
    return `A tag can be at most ${MAX_TAG_LENGTH} characters`;
  }
  // A name made entirely of punctuation normalises to nothing, which would
  // collide with every other such name on the empty slug.
  if (!tagSlug(raw)) return "That tag has no letters or numbers in it";
  return null;
}
