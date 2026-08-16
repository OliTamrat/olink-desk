// The connect form and the route that receives it must agree on field names.
//
// They are written in two files by two different hands, and a mismatch fails
// in the worst available way: the form looks complete, the operator fills it
// in, and the API answers `400 "senderId is required"` about a box that is
// sitting right there full of text. Or worse, an OPTIONAL field is misspelled,
// nothing complains, and the channel saves in a state that can never send.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..", "..", "..", "apps", "web", "src");
const SETUP_SRC = readFileSync(join(WEB, "lib", "channel-setup.ts"), "utf-8");
const ROUTE_SRC = readFileSync(
  join(WEB, "app", "api", "orgs", "[org]", "channels", "[kind]", "route.ts"),
  "utf-8",
);

/** `kind` → the fields the API insists on. */
function apiRequirements(): Record<string, string[]> {
  const body = ROUTE_SRC.slice(ROUTE_SRC.indexOf("const STORABLE"), ROUTE_SRC.indexOf("export async function PUT"));
  const out: Record<string, string[]> = {};
  // Keys are quoted only when they contain a dash — `email:` and `ussd:` are
  // bare. Matching only the quoted form silently skipped exactly the two
  // channels this work exists to connect.
  for (const m of body.matchAll(/"?([\w-]+)"?:\s*\{[\s\S]*?required:\s*\[([^\]]*)\]/g)) {
    out[m[1]] = [...m[2].matchAll(/"(\w+)"/g)].map((x) => x[1]);
  }
  return out;
}

/** `kind` → the fields the form offers, and which of those are optional. */
function formFields(): Record<string, { all: string[]; required: string[] }> {
  const out: Record<string, { all: string[]; required: string[] }> = {};
  for (const block of SETUP_SRC.split(/\n    \{\n/).slice(1)) {
    const kind = /kind:\s*"([\w-]+)"/.exec(block)?.[1];
    if (!kind) continue;
    const all: string[] = [];
    const required: string[] = [];
    for (const f of block.matchAll(/\{[^{}]*?name:\s*"(\w+)"[^{}]*?\}/g)) {
      all.push(f[1]);
      if (!/optional:\s*true/.test(f[0])) required.push(f[1]);
    }
    out[kind] = { all, required };
  }
  return out;
}

const API = apiRequirements();
const FORM = formFields();

describe("the connect form matches the route that receives it", () => {
  it("parsed both sides rather than nothing", () => {
    // Without this, a regex that stopped matching makes every assertion below
    // vacuously true — the test measuring nothing and reporting green.
    expect(Object.keys(API).length).toBeGreaterThanOrEqual(7);
    expect(Object.keys(FORM).length).toBeGreaterThanOrEqual(7);
  });

  it("every kind the form offers is one the API will accept", () => {
    for (const kind of Object.keys(FORM)) {
      expect(API[kind], `${kind} is not in STORABLE`).toBeDefined();
    }
  });

  it("every field the API requires has a box to type it into", () => {
    for (const [kind, needed] of Object.entries(API)) {
      if (!FORM[kind]) continue; // Telegram and Viber connect elsewhere.
      for (const field of needed) {
        expect(FORM[kind].all, `${kind}.${field} has no field in the form`).toContain(field);
      }
    }
  });

  it("no required box is marked optional, and no optional one is forced", () => {
    for (const [kind, spec] of Object.entries(FORM)) {
      const needed = API[kind] ?? [];
      expect(spec.required.slice().sort(), `${kind}`).toEqual(needed.slice().sort());
    }
  });
});
