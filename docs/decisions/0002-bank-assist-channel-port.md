# ADR 0002 — Port the Bank Assist omnichannel framework

- **Status:** Accepted
- **Date:** 2026-08-14
- **Decider:** Founder (Oli Tamrat), plan approved before implementation

## Context

`olink-bank-assist` carries a proven omnichannel bot framework: seven channel
adapters (web widget, Telegram, Viber, WhatsApp, Messenger, Instagram, SMS),
each ~40–200 lines of pure transport, with every shared step — conversation
identity, first-contact behavior, reply delivery — owned by one function
(`_channel_reply`). It also carries hardened webhook security patterns, a
six-language string-table + linguist-review workflow, and a rules-first
language detector. Olink Desk needs channels from Month 1 (build plan:
Telegram bot MVP + web channel) and per ADR 0001 ports proven modules by copy,
never by shared library.

## Decision

**Port the framework by copy and reimplementation in TypeScript, preserving
the architecture and the hardened behaviors; adapt the domain from
conversations-with-a-bot to conversations-threaded-onto-tickets.**

### What ported, and where it landed

| Bank Assist | Olink Desk | Notes |
|---|---|---|
| `_channel_reply()` shared spine | `packages/channels/src/reply.ts` (`channelReply`) | Adapter = transport only; all shared behavior in one tested place |
| `Conversation (bank, channel, external_user_id)` | `Conversation` model (Prisma), unique per `(organizationId, channel, externalUserId)` | The channel-side identity a webhook can actually see |
| First-contact disclaimer tied to conversation-row-new | Ticket-opened auto-ack tied to **ticket**-row-new | Same principle: never key on per-channel "chat opened" events — they are unreliable across channels |
| `channels.py` honest catalogue | `packages/channels/src/catalogue.ts` | Status reflects THIS product: only built adapters read `available`; the rest are `planned` with their `needs` listed |
| Telegram adapter (secret-token header, `/start` as command, non-text ignored, send-never-raises, connect = commit-token-then-setWebhook with rollback) | `packages/channels/src/telegram.ts` | Behavior-for-behavior port |
| Constant-time secret comparison, fail closed | `secretsMatch()` in `crypto.ts` | Applies to every channel credential and the interim admin guard |
| String tables + `t()` + TSV review loop | `packages/i18n` | `{lang: {key}}` JSON, interpolating `t()`, English fallback per key, `export:tsv` with reviewer notes |
| `classifier.detect_language` | `detectLanguage()` in `packages/i18n` | Ethiopic → am with the Tigrinya ኣ-series tell; Latin languages by elimination with a 3-word prose floor; sticky conversation language |
| "Chat text is never logged" | Audit rows carry channel/ids only | `ticket.opened_from_channel` metadata holds no message body |
| Webhook idempotency | `TicketMessage.externalId` dedup, checked before any write | A redelivered update creates no second message, ticket, or ack |

### Decisions made in the translation

1. **Ticket threading rule.** Bank Assist has one eternal conversation per
   person. Desk is ticket-based: an inbound message threads onto the
   conversation's newest ticket in NEW/OPEN/PENDING, else opens a new one.
   RESOLVED deliberately does not accept appends — a reply after resolution is
   a new matter (or a human reopen decision), not a silent append to a closed
   timeline.
2. **Conversation ≠ Contact.** A Telegram chat id is not an identity Desk can
   call back. `Conversation.contactId` is optional and attached later — the
   Bank Assist contact-capture model, kept compatible with Desk's
   phone-number-first `Contact`.
3. **Credentials in `ChannelAccount.config`, sealed.** Bank Assist stores
   tokens as tenant columns; Desk keeps the existing `ChannelAccount` design
   and implements the schema's "encrypted at the application layer" promise:
   AES-256-GCM under `CHANNEL_CONFIG_KEY`, failing closed both directions.
4. **Swahili did not port.** Bank Assist is six languages; Desk's guidelines
   fix scope at en/am/om/ti/so ("No other languages"). The `sw` column,
   word list, and detection branch were deliberately left behind.
5. **Ticket numbers by optimistic retry.** Per-org human-facing numbers are
   allocated max+1 with retry on the `[organizationId, number]` unique
   violation — no locks, safe under pgBouncer transaction mode (fleet gotcha:
   no SAVEPOINTs).
6. **Outbound acks are recorded only when the channel accepted them.** A
   timeline row the customer never received would mislead the agent reading
   it. A send failure is logged and swallowed — a channel outage must never
   5xx the webhook (the channel would retry the update).
7. **Interim admin guard.** Channel-admin routes (connect, catalogue) are
   gated by `DESK_ADMIN_SECRET` (constant-time, 503 when unset) until the
   Onekof auth/RBAC port lands. The guard must not outlive that port.
8. **Adapters ship with their harness, not ahead of it.** Only Telegram and
   web are implemented now; Viber, the Meta trio, and SMS enter as `planned`
   catalogue entries carrying their real procurement prerequisites. Marking
   them `available` before their adapters exist here would be the greyed-out-
   logo dishonesty the catalogue pattern exists to prevent — even though the
   reference implementations sit finished in Bank Assist.

### What deliberately did not port

- **BM25 retrieval, the LLM answer pipeline, and its guardrails** — Desk is a
  human-agent product; messages route to people, not to a generated answer.
  If AI-assisted replies come later, the Bank Assist safety doctrine
  (tool-output-is-truth, allowlists, declared outcomes) is the template, and
  that will be its own ADR.
- **The teller/LiveKit live-call stack** — voice is out of scope by ADR 0001.
- **TOTP/MFA, admin panel, curated answers, content-gap analytics** — later
  phases; noted here so the reuse map stays known.

## Consequences

- Adding a channel is: an enum value, a `ChannelAccountKind`, a transport
  adapter, a catalogue status flip, and a contract test — `channelReply` does
  not change. Viber/Meta/SMS ports are mechanical translations of finished
  Bank Assist reference adapters.
- The AM/OM/TI/SO strings are drafts composed from Bank Assist's reviewed
  sentence patterns; `packages/i18n/review/strings.tsv` is the review sheet.
  Native review before pilot, per the fleet's multilingual golden rule.
- This is a copy, not a shared library (ADR 0001): drift from Bank Assist is
  accepted. If a third product ports this framework, extracting a fleet
  package becomes a real question and its own ADR.
