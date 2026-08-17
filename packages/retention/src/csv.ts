// CSV, written out rather than pulled in.
//
// The whole format is quoting and one security rule, and a dependency would
// be more code than this file to audit for the one property that matters.

/**
 * Characters that make a spreadsheet treat a cell as a formula rather than
 * text. A customer called `=cmd|'/c calc'!A1` is a name in our database and
 * an execution in somebody's Excel — the export is the moment those two
 * meanings diverge, and it is the export's job to close it.
 *
 * `\t` and `\r` are here because Excel and LibreOffice strip leading
 * whitespace before deciding, so a cell starting `\t=` is still a formula.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * One cell, quoted and disarmed.
 *
 * The apostrophe prefix is the standard neutraliser: spreadsheets read it as
 * "the rest of this is text" and do not display it. It is applied BEFORE
 * quoting, so it survives into the file rather than being eaten by it.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_LEAD.test(text)) text = `'${text}`;
  // A quote inside a quoted field is written doubled — the only escape the
  // format has. Newlines need no escape once the field is quoted.
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvRow(values: readonly unknown[]): string {
  return values.map(csvCell).join(",");
}

/**
 * A whole file. CRLF line endings because that is what the format specifies
 * and what Excel on Windows — the reader this is actually for — expects.
 */
export function csvFile(
  header: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  return [csvRow(header), ...rows.map(csvRow)].join("\r\n") + "\r\n";
}

/**
 * A filename a browser will save and a filesystem will accept.
 *
 * Built from a tenant's own name, which can contain anything — including a
 * slash, which would make the browser write outside the download directory
 * on some platforms, and a quote, which would end the Content-Disposition
 * header early and let the rest be read as header parameters.
 */
export function exportFilename(
  organizationName: string,
  kind: string,
  now: Date,
): string {
  const slug =
    organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "olink-desk";
  const day = now.toISOString().slice(0, 10);
  return `${slug}-${kind}-${day}.csv`;
}
