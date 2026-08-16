// How a review sheet is built, in one place.
//
// Shared by the exporter and by the test that asserts the committed sheets
// are current. A test with its own idea of the format would agree with itself
// and drift from the file a reviewer actually opens — the same reason the
// macro preview renders through `renderMacro` rather than a preview-only copy
// (ADR 0020).
import { SUPPORTED_LANGUAGES } from "../src/index";

const clean = (s: string) => s.replace(/\t/g, " ").replace(/\n/g, " / ");

export function buildSheet(
  strings: Record<string, Record<string, string>>,
  notes: Record<string, string>,
): string {
  const keys = Object.keys(strings.en);
  const header = ["key", ...SUPPORTED_LANGUAGES, "note"].join("\t");
  const rows = keys.map((key) =>
    [
      key,
      ...SUPPORTED_LANGUAGES.map((lang) => clean(strings[lang][key] ?? "")),
      clean(notes[key] ?? ""),
    ].join("\t"),
  );
  return [header, ...rows].join("\n") + "\n";
}
