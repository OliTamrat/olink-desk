# 0040 — A throttle must not white-screen the console

**Status:** accepted · 2026-08-17

## Context

Found by driving the customer pages in a loop against the production build,
while verifying something else entirely. Roughly one navigation in three
rendered:

```
Application error: a client-side exception has occurred.
```

The cause chained two things, neither of which is visible from an API test:

1. `/api/auth/me` answered **429** — the rate limiter (ADR 0037) doing its job
   against a client that had just fired two hundred requests.
2. `useMe()` handled **only 401**. Every other status had its body parsed
   straight into state, so `me` became the error object `{ error: "…" }` —
   truthy, with no `me.user` on it.

Every screen in the console asks `me.user.role` to decide what an agent may do.
One throttled request took the whole app down.

## Decision

**`useMe()` sets state only from a response that actually carries a user**, and
retries a transient failure up to three times with a short backoff.

```
401                     → redirect to /login          (unchanged)
ok, body has user+org   → set me
429 or 5xx              → back off and retry, max 3
anything else           → leave me null
```

`me === null` is a state the shell already renders — "still loading". A blip
degrades to that. It never degrades to a blank page.

## Why the fix is here and not in the limiter

Loosening `LIMITS.api` would have made this particular reproduction stop, and
would have left the defect. Any 500, any proxy's HTML error page, any restarting
instance produces the same white screen. The client contract — *a non-OK
response is not a user* — is the thing that was wrong.

The limits stay as ADR 0037 set them.

## What this says about verification

Two guards were green throughout: typecheck, and a full package suite. Neither
could see it, because the failure needed a real browser, a real rate limiter,
and enough requests to trip it. It was found by *driving the pages in a loop* —
the same method that has now found five defects in this codebase that no test
could reach.

The regression check is in the same shape: fire past the burst allowance, then
navigate, then assert the page is not an error screen.

## The sibling defect, same session

`tUi()` **throws** on an unknown key, and it is called during render — so one
invented key does not fall back to English, it unmounts the component tree.
`ui_cancel` was written into the erase panel's JSX and never added to the table;
typecheck was clean, the string table was 100% complete in all six languages,
and the panel vanished the instant it was opened.

`packages/i18n/test/call-sites.test.ts` now scans `apps/web/src` for literal
`tUi(…, "key")` calls and fails on any key absent from the table. Its mirror —
a key translated six ways and never used — was already covered. This was the
direction nothing was checking, which is the recurring shape of every miss here:
**the thing measuring the work was measuring something adjacent to it.**
