// Writes review/strings.tsv and review/ui_strings.tsv — one row per string
// key, one column per language, plus the reviewer note. The linguist-review
// loop ported from Bank Assist: a native speaker corrects cells in a
// spreadsheet; corrections come back as data edits to the JSON tables, never
// retyped Ge'ez in source. Two files because the audiences differ: strings
// are what customers are sent, ui_strings are the staff console's chrome.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { allStrings, allUiStrings, NOTES, UI_NOTES } from "../src/index";
import { buildSheet } from "./sheet";

const outDir = join(__dirname, "..", "review");
mkdirSync(outDir, { recursive: true });

function writeSheet(
  fileName: string,
  strings: Record<string, Record<string, string>>,
  notes: Record<string, string>,
) {
  const body = buildSheet(strings, notes);
  const outFile = join(outDir, fileName);
  writeFileSync(outFile, body, "utf-8");
  console.log(`Wrote ${Object.keys(strings.en).length} rows to ${outFile}`);
}

writeSheet("strings.tsv", allStrings(), NOTES);
writeSheet("ui_strings.tsv", allUiStrings(), UI_NOTES);
