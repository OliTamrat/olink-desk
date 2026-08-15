// Writes review/strings.tsv and review/ui_strings.tsv — one row per string
// key, one column per language, plus the reviewer note. The linguist-review
// loop ported from Bank Assist: a native speaker corrects cells in a
// spreadsheet; corrections come back as data edits to the JSON tables, never
// retyped Ge'ez in source. Two files because the audiences differ: strings
// are what customers are sent, ui_strings are the staff console's chrome.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  allStrings,
  allUiStrings,
  NOTES,
  SUPPORTED_LANGUAGES,
  UI_NOTES,
} from "../src/index";

const outDir = join(__dirname, "..", "review");
mkdirSync(outDir, { recursive: true });

const clean = (s: string) => s.replace(/\t/g, " ").replace(/\n/g, " / ");

function writeSheet(
  fileName: string,
  strings: Record<string, Record<string, string>>,
  notes: Record<string, string>,
) {
  const keys = Object.keys(strings.en);
  const header = ["key", ...SUPPORTED_LANGUAGES, "note"].join("\t");
  const rows = keys.map((key) =>
    [
      key,
      ...SUPPORTED_LANGUAGES.map((lang) => clean(strings[lang][key] ?? "")),
      clean(notes[key] ?? ""),
    ].join("\t"),
  );
  const outFile = join(outDir, fileName);
  writeFileSync(outFile, [header, ...rows].join("\n") + "\n", "utf-8");
  console.log(`Wrote ${rows.length} rows to ${outFile}`);
}

writeSheet("strings.tsv", allStrings(), NOTES);
writeSheet("ui_strings.tsv", allUiStrings(), UI_NOTES);
