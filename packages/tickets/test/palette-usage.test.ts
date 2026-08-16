// Two rules about colour that no amount of care enforces on its own, both
// checked against the real source rather than trusted.
//
// The accent moved from purple to blue in one commit. It moved everywhere it
// was a token — and would have stayed purple in the two places a token cannot
// reach, which are also the two most visible places a stranger sees the
// product: the launcher button on a customer's own website, and whatever
// literal somebody types next.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..", "..", "..", "apps", "web", "src");
const THEME = join(WEB, "lib", "theme.ts");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory()
      ? walk(full)
      : /\.tsx?$/.test(name)
        ? [full]
        : [];
  });
}

// SVG path data is full of hex-looking runs and colour words; strip the
// attributes that legitimately carry them before looking for literals.
function strippable(src: string): string {
  return src
    .replace(/\bd="[^"]*"/g, "")
    .replace(/viewBox="[^"]*"/g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("colour lives in the token file", () => {
  const files = walk(WEB).filter((f) => f !== THEME);

  it("no screen carries a raw hex colour", () => {
    const offenders: string[] = [];
    for (const f of files) {
      // The embed loader is the documented exception: it is JavaScript that
      // runs on a THIRD-PARTY page and cannot see our custom properties, so
      // its colours must be literals. It is held to the palette instead, by
      // the test below.
      if (f.includes(join("channels", "web"))) continue;
      for (const [, hex] of strippable(readFileSync(f, "utf-8")).matchAll(
        /["'`(,;:\s](#[0-9a-fA-F]{3,8})\b/g,
      )) {
        offenders.push(`${f.replace(WEB, "")}: ${hex}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the embed launcher uses the real accent, not a colour frozen in a string", () => {
    const theme = readFileSync(THEME, "utf-8");
    const dark = theme.slice(theme.indexOf("  dark: {"), theme.indexOf("\n  },"));
    const accent = /accent:\s*"(#[0-9a-fA-F]{6})"/.exec(dark)?.[1];
    const solid = /accentSolid:\s*"(#[0-9a-fA-F]{6})"/.exec(dark)?.[1];
    expect(accent, "dark accent not found").toBeTruthy();
    expect(solid, "dark accentSolid not found").toBeTruthy();

    const loader = readFileSync(
      join(WEB, "app", "api", "channels", "web", "[org]", "embed", "route.ts"),
      "utf-8",
    );
    // The gradient a visitor to a bank's website actually sees. It sat on the
    // old purple for the whole of this change until this test was written.
    expect(loader).toContain(`${accent},${solid}`);
  });
});
