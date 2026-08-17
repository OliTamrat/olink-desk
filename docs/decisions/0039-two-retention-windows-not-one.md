# 0039 — Two retention windows, and the audit one cannot be shorter

**Status:** accepted · 2026-08-17

## Context

A retention policy is usually presented as one number: *keep data for N days*.
That collapses two obligations which pull in opposite directions.

## Decision

`Organization` carries **`ticketRetentionDays`** and **`auditRetentionDays`**
separately. Both default to `null`, meaning keep forever. A policy where the
audit window is shorter than the content window is **refused**, not stored.

## Why two

Ticket content is personal data a tenant must **stop** holding. The audit log
is the record that it stopped — which a regulator or an auditor asks for
*after* the content is gone. One window means either keeping the words too long
or destroying the proof of their destruction.

`auditWindowTooShort()` is the rule, and it treats "keep content forever" as
requiring "keep audit forever": content held indefinitely with an audit window
of a year means that in two years the tenant holds the tickets and no record of
who touched them. That is the shape of an audit gap.

## The bounds, and why they are not round numbers for looks

**Minimum 30 days.** Desks reopen their own tickets — a customer replies to a
solved ticket days later, a supervisor audits last week, a dispute arrives about
a call. A shorter window destroys the evidence for questions the tenant is still
being asked. This is the one setting in the product where a mistyped value
cannot be undone by retyping it.

**Maximum 3650 days.** Past every retention schedule a bank, telecom or
government desk in this market operates under. Beyond it the honest setting is
*Keep forever*, which says what is meant instead of hiding it behind a number
nobody reaches.

**Default null.** A retention window is a deliberate act by an administrator who
knows their own regulator, never something a deploy quietly starts doing to a
tenant's history.

## Eligibility is `closedAt`, never `createdAt`

The window is a promise about how long a **finished** matter is kept. Keying on
`createdAt` would destroy the history of the longest-running, most-disputed
tickets on the desk — precisely the ones somebody is still arguing about. A
ticket with no `closedAt` is never eligible, however old.

## Validation runs against the pair that will BE, not the pair that was sent

`PUT /api/retention` merges the posted fields over the stored ones and validates
the result. A request that only shortens the audit window has to be checked
against the content window already in the database, or the ordering rule is
enforceable only when both arrive together — which is exactly when nobody gets
it wrong.

## The screen says when nothing is running

`GET /api/retention` reports `scheduled` from whether `CRON_SECRET` is set. A
window saved on a deployment with no scheduler is a promise to a customer that
nothing keeps, and the panel says so rather than letting the stored value imply
otherwise.
