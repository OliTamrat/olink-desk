import { describe, expect, it } from "vitest";

import { csvCell, csvFile, csvRow, exportFilename } from "../src/csv";

describe("formula injection", () => {
  // A customer's own name reaches this file unchanged from whatever they
  // typed on Telegram. Every one of these is a cell that executes when a
  // supervisor opens the export in Excel.
  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "=cmd|'/c calc'!A1"])(
    "disarms %s",
    (hostile) => {
      expect(csvCell(hostile)).toBe(`"'${hostile}"`);
    },
  );

  it("disarms a leading tab or carriage return", () => {
    // Spreadsheets strip leading whitespace before deciding whether a cell is
    // a formula, so \t= is still a formula. A regex that only listed = + - @
    // would pass every test above and let this one through.
    expect(csvCell("\t=1+1")).toBe(`"'\t=1+1"`);
    expect(csvCell("\r=1+1")).toBe(`"'\r=1+1"`);
  });

  it("leaves an ordinary name alone", () => {
    expect(csvCell("Abebe Bekele")).toBe(`"Abebe Bekele"`);
  });

  it("leaves a hyphen mid-string alone", () => {
    // Only the LEADING character decides. Over-quoting "Addis-Ababa" would
    // put a stray apostrophe in front of a normal value.
    expect(csvCell("Addis-Ababa")).toBe(`"Addis-Ababa"`);
  });

  it("does not mangle a phone number that starts with +", () => {
    // +251911234567 IS formula-leading, so it is prefixed. That is correct
    // and deliberate: the alternative is Excel evaluating it to a number and
    // dropping the country code, which loses the data outright.
    expect(csvCell("+251911234567")).toBe(`"'+251911234567"`);
  });
});

describe("quoting", () => {
  it("doubles an embedded quote", () => {
    expect(csvCell('he said "no"')).toBe(`"he said ""no"""`);
  });

  it("keeps a newline inside the quoted field", () => {
    expect(csvCell("line one\nline two")).toBe(`"line one\nline two"`);
  });

  it("keeps a comma inside the quoted field", () => {
    expect(csvRow(["a,b", "c"])).toBe(`"a,b","c"`);
  });

  it("writes null and undefined as empty, not as the words", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("writes a Date as ISO rather than a locale string", () => {
    expect(csvCell(new Date("2026-08-17T12:00:00Z"))).toBe(
      `"2026-08-17T12:00:00.000Z"`,
    );
  });

  it("preserves Ge'ez text unchanged", () => {
    expect(csvCell("ሰላም")).toBe(`"ሰላም"`);
  });
});

describe("csvFile", () => {
  it("uses CRLF and ends with one", () => {
    expect(csvFile(["a", "b"], [[1, 2]])).toBe(`"a","b"\r\n"1","2"\r\n`);
  });

  it("writes a header even with no rows", () => {
    // An empty export must still be a readable file that names its columns,
    // not a zero-byte download that looks like a failure.
    expect(csvFile(["a"], [])).toBe(`"a"\r\n`);
  });
});

describe("exportFilename", () => {
  const now = new Date("2026-08-17T12:00:00Z");

  it("slugs the tenant name and dates the file", () => {
    expect(exportFilename("Dashen Bank", "audit", now)).toBe(
      "dashen-bank-audit-2026-08-17.csv",
    );
  });

  it("strips a path separator out of a tenant-controlled name", () => {
    // The name is typed at registration. A slash here would let the header
    // name a path; a quote would end the Content-Disposition value early and
    // let the remainder be read as further header parameters.
    expect(exportFilename('../../etc "x"', "audit", now)).toBe(
      "etc-x-audit-2026-08-17.csv",
    );
  });

  it("falls back rather than producing a nameless file", () => {
    // A tenant named entirely in Ge'ez slugs to nothing, which would produce
    // "-audit-….csv". Non-Latin names are the norm in this market.
    expect(exportFilename("ኦሊንክ", "audit", now)).toBe(
      "olink-desk-audit-2026-08-17.csv",
    );
  });
});
