// Checkable claims in the docs, checked.
//
// `docs/architecture.md` opens with a map of the repo's packages. By the time
// this test was written it listed six of ten — `csat`, `reports` and
// `retrieval` had each been added without it, silently, and a fourth
// (`tickets`) was about to be. A map that is wrong about a third of the repo
// is worse than no map: it is read as authoritative.
//
// It lives in this package for a practical reason rather than a conceptual
// one — `tenancy-guard.test.ts` already reads repo files as text here, so the
// path plumbing exists. If more doc claims become checkable, they earn their
// own home.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");

describe("docs/architecture.md", () => {
  it("lists every package that exists, and none that does not", () => {
    const onDisk = readdirSync(join(REPO, "packages"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    const doc = readFileSync(join(REPO, "docs", "architecture.md"), "utf8");
    // [a-z0-9-] not [a-z-]: `i18n` has digits in it, and the first version of
    // this regex silently dropped it — the parser guard below catches an empty
    // match, but not a nearly-right one.
    const documented = [...doc.matchAll(/^packages\/([a-z0-9-]+)\//gm)]
      .map((m) => m[1])
      .sort();

    // Guard the parser itself: a regex that silently matches nothing would
    // make this test pass against an empty document.
    expect(documented.length).toBeGreaterThan(3);
    expect([...new Set(documented)]).toEqual(onDisk);
  });
});
