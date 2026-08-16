# ADR 0006 — Industry benchmark, primary surface, and the SLA model

- **Status:** Accepted
- **Date:** 2026-08-16
- **Decider:** Founder (Oli Tamrat) — "build it right from the beginning";
  surface decision in his words: "not phone first — a web based rich
  dashboard, but also responsive and mobile friendly"

## The benchmark

Olink Desk is built to the **Zendesk-class feature standard with Intercom's
conversation feel**: conversation-threaded tickets (not email cases), and
the eight pillars every industry-standard desk rests on — omnichannel with
one conversation identity, tenant security/audit/encrypted credentials,
full ticket lifecycle (assignment, queues, notes, tags), SLA policies on
business hours, queue routing, automation (macros then triggers), CSAT +
analytics, and a knowledge/AI layer. The AI layer is the fleet's unfair
advantage: Bank Assist is a six-language, retrieval-grounded, guardrailed
assistant Olink already owns — wiring it in front of Desk tickets later is
this market's only native-Amharic Answer-Bot equivalent.

## Primary surface

**Desktop-rich web dashboard first; responsive mobile second.** Information
density, multi-pane layouts and the wallboard are designed for a big
screen; the sub-820px layout (bottom tabs, single-pane inbox) remains a
first-class *companion*, not the design driver. This supersedes the
"phone-first" phrasing used while the mobile layout was being fixed.

## The SLA model (v1, shipped)

1. **Targets per priority** — the Zendesk-standard model. One `SlaPolicy`
   row per priority per org (URGENT 15m/4h, HIGH 1h/1bd, NORMAL 4h/3bd,
   LOW 1bd/5bd), seeded lazily on first use; every number is data, editable
   from Settings when that screen lands. **Channel overrides are approved
   but deferred** to the Settings slice — they belong at the policy layer
   and nothing structural blocks them.
2. **Business-hours clock** (`packages/sla`): Mon–Sat 08:30–17:30
   Africa/Addis_Ababa, Ethiopian public holidays (fixed dates every year,
   movable feasts listed per year — a test fails loudly when a new year's
   table is missing). The arithmetic runs on a **fixed UTC offset**
   because Ethiopia has no DST; a DST market needs a tz library, not a
   patch. Toggling `enabled: false` makes a policy 24/7. Degenerate
   calendars (no workdays) fail open to plain addition — an SLA that can
   never be met is a config error, not a promise.
3. **Clocks start at creation** (`channelReply` computes and stores both
   due dates); **re-prioritizing recomputes from creation** on the new
   policy. A met first response keeps its timestamp.
4. **Breach is DERIVED at read time** from the stored due dates — no cron
   in the truth path, so the wallboard and the rail can never show stale
   breach state. At-risk = past 80% of the window; the same thresholds
   color both surfaces. (A cron for breach *notifications* is future work
   and changes nothing about the truth.)

## Also in this slice

- Ticket lifecycle PATCH (status/priority/assignee/queue) with per-change
  audit rows; resolution timestamps stamped on entry, cleared on reopen.
- Queues API (list any staff; create SUPERVISOR/ADMIN) — routing *rules*
  arrive with the Settings screen.
- `/wallboard` for SUPERVISOR/ADMIN/AUDITOR: server-side aggregates,
  10-second poll, TV-sized numbers.
