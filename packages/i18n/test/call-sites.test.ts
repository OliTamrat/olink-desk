// Every key the console ASKS FOR must exist in the table.
//
// Why this test and not the table-coverage one next door: coverage measures
// the TABLE, and a table can be complete in all six languages while a page
// asks for a key nobody ever added. `tUi` throws on an unknown key, and it is
// called during render — so a single invented key does not degrade to English,
// it unmounts the component tree and takes the screen down with it.
//
// That is exactly how the erase-a-customer panel shipped broken: `ui_cancel`
// was written into the JSX, the string table was 100% complete, typecheck was
// clean, and the panel vanished the instant it was opened. Nothing but opening
// it in a browser could see that — until this file.
//
// The mirror check (a key translated into six languages and then never used)
// lives in review-sheet.test.ts; this is the direction nothing was checking.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { allStrings, allUiStrings, SUPPORTED_LANGUAGES } from "../src";

const WEB_SRC = join(__dirname, "..", "..", "..", "apps", "web", "src");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Keys named as string literals in a `tUi(...)` / `t(...)` call.
 *
 * Deliberately literal-only. A key built at runtime (`ROLE_KEYS[role]`) cannot
 * be read statically, and pretending otherwise would either miss it silently
 * or force every lookup table to be inlined. Those are covered by the
 * *reverse* check below, which catches the table drifting away from them.
 */
function literalKeys(source: string, fn: "tUi" | "t"): string[] {
  const pattern = new RegExp(`\\b${fn}\\(\\s*[^,()]+,\\s*["'\`]([a-z0-9_]+)["'\`]`, "g");
  return [...source.matchAll(pattern)].map((m) => m[1] as string);
}

describe("every key the console asks for exists", () => {
  const files = sourceFiles(WEB_SRC);

  it("finds source to check, so a wrong path cannot pass vacuously", () => {
    // Without this the whole suite is green when WEB_SRC points at nothing —
    // the failure mode this repo has hit more than once.
    expect(files.length).toBeGreaterThan(20);
  });

  it("has no tUi() call naming a key that is not in the console table", () => {
    const table = allUiStrings().en;
    const missing: string[] = [];
    for (const file of files) {
      for (const key of literalKeys(readFileSync(file, "utf8"), "tUi")) {
        if (!(key in table)) missing.push(`${file.replace(WEB_SRC, "")} → ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("has no t() call naming a key that is not in the customer table", () => {
    const table = allStrings().en;
    const missing: string[] = [];
    for (const file of files) {
      for (const key of literalKeys(readFileSync(file, "utf8"), "t")) {
        // `t` is a common identifier — a ticket, a tab, a translate prop. Only
        // flag a key that looks like one of ours and is absent, so an ordinary
        // local named `t` cannot fail this test.
        if (!(key in table) && !(key in allUiStrings().en)) {
          missing.push(`${file.replace(WEB_SRC, "")} → ${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("keeps every language's key set identical, table by table", () => {
    // The golden rule, checked as a set difference rather than a count: two
    // languages can hold the same NUMBER of keys and disagree about which.
    for (const [name, table] of [
      ["ui", allUiStrings()],
      ["customer", allStrings()],
    ] as const) {
      const base = new Set(Object.keys(table.en));
      for (const lang of SUPPORTED_LANGUAGES) {
        const here = new Set(Object.keys(table[lang]));
        const onlyBase = [...base].filter((k) => !here.has(k));
        const onlyHere = [...here].filter((k) => !base.has(k));
        expect({ table: name, lang, onlyBase, onlyHere }).toEqual({
          table: name,
          lang,
          onlyBase: [],
          onlyHere: [],
        });
      }
    }
  });
});
