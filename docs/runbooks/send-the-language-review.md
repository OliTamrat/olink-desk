# Send the language review out

**Status: OPEN.** Afaan Oromo, Tigrinya, Somali and Swahili are first-pass
drafts. They have never been read by a native speaker.

This is the last item standing between the product and a claim it makes on
every screen — six languages, end to end.

## What to send

`packages/i18n/review/ui_strings.tsv` — 489 strings the staff console and the
widget say, one row per key, with columns:

| | |
|---|---|
| `key` | the identifier. **Do not translate or edit.** |
| `en` | the authored English |
| `am` `om` `ti` `so` `sw` | the drafts to review |
| `note` | what the string is for and what a translation must preserve |

`packages/i18n/review/strings.tsv` is a second, much smaller file (5 rows) —
what the desk sends a *customer* automatically. Send both; that one matters
more per row than anything in the big file, because a customer reads it
without a member of staff in between.

## The Windows trap: do not double-click the TSV

Excel opens a double-clicked `.tsv` with the system ANSI codepage, not UTF-8.
Amharic and Tigrinya arrive as mojibake, the reviewer "corrects" text that was
never wrong, and the corrections come back unusable. Somali and Swahili survive
because they are Latin — so the file looks *mostly* fine, which is worse than
looking broken.

Two safe routes.

**Route A — import, don't open.** In Excel: **Data → From Text/CSV** → pick the
file → set **File Origin: 65001: Unicode (UTF-8)** and **Delimiter: Tab** →
Load. Verify a Ge'ez row renders before sending it on.

**Route B — convert it first (PowerShell), and send an .xlsx.** Better, because
it removes the reviewer's chance to get the import wrong. Needs the
`ImportExcel` module:

```powershell
Install-Module ImportExcel -Scope CurrentUser
```

Then, from the repo root:

```powershell
$rows = Import-Csv packages/i18n/review/ui_strings.tsv -Delimiter "`t" -Encoding UTF8
$rows | Export-Excel .\olink-desk-language-review.xlsx -WorksheetName "Console" -AutoSize -FreezeTopRow -BoldTopRow
$cust = Import-Csv packages/i18n/review/strings.tsv -Delimiter "`t" -Encoding UTF8
$cust | Export-Excel .\olink-desk-language-review.xlsx -WorksheetName "Customer" -AutoSize -FreezeTopRow -BoldTopRow -Append
```

> The delimiter is a **backtick-t inside double quotes** — `` "`t" ``. A literal
> `"\t"` is two characters to PowerShell and silently produces one column.
> Check the result has 8 columns before sending.

**On PowerShell 5.1**, `Import-Csv -Encoding UTF8` reads BOM-less UTF-8
correctly, but if the Ge'ez looks wrong, read the file explicitly instead:

```powershell
$text = [System.IO.File]::ReadAllText("packages/i18n/review/ui_strings.tsv", [System.Text.Encoding]::UTF8)
$rows = $text | ConvertFrom-Csv -Delimiter "`t"
```

## What to tell the reviewer

Three things, and the third is the one that gets missed:

1. **Edit only the language column for your language.** Leave `key`, `en` and
   `note` alone — `key` is code, and a changed one silently drops the string.
2. **Read the `note` column first.** It says what the string is for and what
   must survive translation — which placeholder means what, which words are
   proper nouns (Telegram, Olink Desk, Fayda) and stay untranslated, and where
   a mistranslation is dangerous rather than untidy.
3. **The retention and erasure group describes permanent destruction of a
   customer's data.** Nothing there may read as reversible or soft. Prefer the
   plainest everyday verb for "delete" in your language over a technical or
   legal one — the reader is a desk manager, not a lawyer. A sentence that
   reads as reversible in Afaan Oromo is a data-loss incident, not a typo.

Also worth saying plainly: **compose in the language, don't translate the
English.** The drafts were machine-composed and read like it in places. Short
sentences, everyday spoken register, common words over literary ones.

## Getting corrections back in

Save the reviewed sheet back to TSV (UTF-8, tab-delimited) and hand it to me —
the import is a code change, not a paste, because every key has to still exist
and every language column has to stay complete. `pnpm test` fails if a key is
dropped or a language falls behind, which is the safety net.

## What is deliberately not in the file

Generated prose — the AI-drafted replies — is not in any table. It is written
per request by the model and there is no row to edit. A reviewer flagging one
of those sentences is giving feedback on the **prompt**, and the fix is an
instruction, not a translation. Say so in the brief, or the reviewer will hunt
for a row that does not exist.
