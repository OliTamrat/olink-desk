# ADR 0003 — Full channel parity, six languages, USSD, and CI

- **Status:** Accepted (supersedes ADR 0002 §"Swahili did not port" and
  §"Adapters ship with their harness" — the rest of ADR 0002 stands)
- **Date:** 2026-08-14
- **Decider:** Founder (Oli Tamrat), direct instruction

## Context

ADR 0002 ported the Bank Assist channel framework with Telegram + web
implemented and the remaining adapters staged as `planned`, and excluded
Swahili per this repo's then-five-language guideline. The founder's direction
the same day: Desk carries the fleet's full channel set and full language set
from the start — all Bank Assist adapters ported now, Swahili included as the
sixth language (as it already ships in Bank Assist), USSD built as the next
channel — and the repo gets CI so verification never depends on a manual
local run.

## Decisions

1. **All Bank Assist adapters ported now** — Viber (`viber.ts`), the Meta
   trio in one module (`meta.ts` — one app, one callback, one signature
   scheme), and SMS as an aggregator contract (`sms.ts`). Each keeps its
   reference implementation's load-bearing quirks: Viber errors arrive as
   HTTP 200 and the auth token is the signature key; Meta's handshake echoes
   the challenge as bare text and `is_echo` messages are never threaded; SMS
   parses vendor field-name variants leniently, authenticates strictly, and
   splits replies into numbered billable segments capped at `MAX_PARTS`.
   The catalogue now reads `available` for every channel except web
   (`live`) — nothing is `planned`.
2. **Swahili is the sixth language** (`packages/i18n`), overriding the
   guideline's previous five-language scope; `PROJECT_GUIDELINES.md` is
   updated. SW is appended last in tables and never wins a detection tie —
   both mirroring Bank Assist. Its strings are first-pass drafts on the same
   pending-native-review footing as OM/TI/SO.
3. **USSD is a first-class channel** (`ussd.ts`, `Channel.USSD`,
   `ChannelAccountKind.USSD_GATEWAY`) — the channel Bank Assist has not
   built. USSD is synchronous: the gateway holds the session and the HTTP
   response body IS the next screen (`CON`/`END` prefixed, capped at
   `MAX_SCREEN`). The desk flow is one screen deep by design: dial-in → the
   greeting as prompt; typed message → ticket through the same
   `channelReply()` spine → `END` with the ticket number. A follow-up gets
   `message_received` (new string, shipped in all six languages), which
   deliberately does not promise a reply "here" — a USSD session cannot be
   re-entered. Like SMS it is a contract, not an integration: field-name
   variants accepted inbound, `X-USSD-Secret` compared constant-time,
   fails closed.
4. **CI on every push** (`.github/workflows/ci.yml`): pnpm install,
   Prisma generate + `db push` against a Postgres 16 service container,
   typecheck, build, and the full test suite. Turbo v2 strict env mode
   required declaring `DATABASE_URL`/`CHANNEL_CONFIG_KEY` in
   `turbo.json#globalEnv` — without it tasks silently lose the variables the
   DB suites need.
5. **Credential storage for registration-free channels** —
   `PUT /api/orgs/[org]/channels/[kind]` seals Meta/SMS/USSD configs;
   inbound webhook secrets are generated server-side when not supplied and
   returned exactly once. Telegram and Viber keep dedicated connect routes
   because those providers require a registration call with rollback.

## Consequences

- Olink Desk has channel-set parity with Bank Assist plus USSD: eight
  catalogue entries, all built, differing only in which credential or
  agreement each tenant still needs.
- The six-language golden rule now binds this repo explicitly: any
  customer-facing string change adds en/am/om/ti/so/sw in the same change
  and regenerates `packages/i18n/review/strings.tsv`.
- USSD's real gateway contract (Ethio Telecom / aggregator) may need a field
  mapping written from the vendor's spec — the same caveat SMS carries; the
  transport, authentication, threading and screen budget are done.
- CI is the gate: green on the branch is the verification, not a manual run
  on any one machine.
