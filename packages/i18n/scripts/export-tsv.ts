// Writes review/strings.tsv — one row per string key, one column per
// language, plus the reviewer note. The linguist-review loop ported from
// Bank Assist: a native speaker corrects cells in a spreadsheet; corrections
// come back as data edits to strings.json, never retyped Ge'ez in source.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { allStrings, NOTES, SUPPORTED_LANGUAGES } from "../src/index";

const outDir = join(__dirname, "..", "review");
const outFile = join(outDir, "strings.tsv");

const strings = allStrings();
const keys = Object.keys(strings.en);

const clean = (s: string) => s.replace(/\t/g, " ").replace(/\n/g, " / ");

const header = ["key", ...SUPPORTED_LANGUAGES, "note"].join("\t");
const rows = keys.map((key) =>
  [
    key,
    ...SUPPORTED_LANGUAGES.map((lang) => clean(strings[lang][key] ?? "")),
    clean(NOTES[key] ?? ""),
  ].join("\t"),
);

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, [header, ...rows].join("\n") + "\n", "utf-8");
console.log(`Wrote ${rows.length} rows to ${outFile}`);
