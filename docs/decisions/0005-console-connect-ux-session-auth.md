# ADR 0005 — Channel connect is a console screen; admin routes take session auth

- **Status:** Accepted
- **Date:** 2026-08-15
- **Decider:** Founder (Oli Tamrat) — after a day lost to terminal-driven
  Telegram connects: "the other agent… all I did was add a token on each
  channel's token connect input field"

## Context

The channel backend (connect endpoints, sealed credential storage, webhook
registration with rollback) shipped before any screen existed on top of it.
Connecting Telegram therefore meant hand-built PowerShell against the API
with the `DESK_ADMIN_SECRET` header — which cost a full day of paste errors,
timing errors and photo-of-a-terminal debugging, for an operation Bank
Assist's admin panel does in ten seconds with an input field and a button.
The failure was sequencing, not architecture: the API was right, the missing
screen was the product.

## Decision

1. **Every channel connect/config operation is a console screen first.** The
   first slice ships `/login` and `/channels` (Telegram paste-token card +
   the honest catalogue). No feature that an operator must perform is done
   until its screen exists — an API alone is not an operator experience.
2. **The Channels screen diagnoses itself.** `GET
   /api/orgs/{org}/channels/telegram/status` asks Telegram directly (getMe +
   getWebhookInfo, token never returned) and the card renders: token valid /
   revoked, webhook registered / pointing elsewhere, Telegram's own last
   delivery error. The silent-bot failure class — a token revoked in
   BotFather after connect — is visible in the browser, not in `gcloud`
   logs. Telegram-unreachable reads as *unknown*, never as *invalid*.
3. **Org admin routes take session auth as the primary door**
   (`requireOrgAdmin`): a signed-in ADMIN whose session org matches the URL
   org. The `x-desk-admin` secret remains as a second door for automation
   and break-glass — constant-time, fail-closed, unchanged. The standalone
   `requireAdminSecret` guard is deleted; org-guard subsumes it.
4. **Console chrome is a second string table** (`ui_strings.json`, `tUi()`),
   all six languages in the same change, with its own reviewer TSV
   (`review/ui_strings.tsv`) — the golden rule applies to staff screens,
   not only customer messages (the Bank Assist admin_strings lesson).

## Consequences

- Connecting a bot after a BotFather revoke is: open Channels, paste, click.
  The revoke-after-connect trap is self-explaining on screen.
- The catalogue's names/blurbs/needs are still English-only literals in
  `catalogue.ts` — a known gap, tracked for the next i18n pass rather than
  silently regressing the golden rule (they predate this change).
- The web-channel embed, Viber connect and Meta/SMS/USSD config still lack
  screens; they follow the same pattern as the console grows.
