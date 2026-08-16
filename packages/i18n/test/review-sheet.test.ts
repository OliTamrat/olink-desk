// The review sheets are the artefact a native speaker actually opens, so a
// stale one is not a bookkeeping slip — it is a review that silently excludes
// whatever shipped since it was last written.
//
// This test exists because that happened: the product carried 325 console
// strings while the sheet carried 165, so the 160 newest — every string added
// across the customers, email, layout, context-panel, phone-bar and tabs work
// — had never been in front of a reviewer, while the coverage tests all
// passed. Those tests measure the TABLE. Nothing measured the SHEET.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { allStrings, allUiStrings, NOTES, UI_NOTES } from "../src/index";
import { buildSheet } from "../scripts/sheet";

const SHEETS = [
  { file: "strings.tsv", strings: allStrings(), notes: NOTES },
  { file: "ui_strings.tsv", strings: allUiStrings(), notes: UI_NOTES },
];

describe.each(SHEETS)("review sheet $file", ({ file, strings, notes }) => {
  it("is current — re-run `pnpm --filter @olink-desk/i18n export:tsv` if this fails", () => {
    const committed = readFileSync(join(__dirname, "..", "review", file), "utf-8");
    expect(committed).toBe(buildSheet(strings, notes));
  });

  it("has a row for every English key", () => {
    const committed = readFileSync(join(__dirname, "..", "review", file), "utf-8");
    // Header plus one row each. Counted rather than inferred from the
    // equality above, so a failure says WHICH of the two problems it is.
    const rows = committed.trimEnd().split("\n").length - 1;
    expect(rows).toBe(Object.keys(strings.en).length);
  });
});
