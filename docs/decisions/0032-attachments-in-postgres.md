# ADR 0032 — Attachments and voice notes, with the bytes in Postgres

- **Status:** Accepted
- **Date:** 2026-08-17
- **Context:** Founder, in the same message as the new-ticket bug: "add attached
  files option… add [a] record a voice recording (for voice mail option)".

## Where the bytes live

Object storage is the textbook answer and it is the wrong *first* answer here.
A bucket means provisioning it, granting the Cloud Run runtime service account
object access, and a signed-URL path — real infrastructure to stand up before
anybody can attach a screenshot, and none of it is code this session could
write and verify.

So: **`Attachment.data` is a `Bytes` column, capped at 10 MB.** A support
desk's attachments are small and few — screenshots, PDFs, a minute of voice —
and this ships the feature with nothing to configure.

The cost is stated rather than discovered: **database size and backup weight
grow with attachments**, and `MAX_ATTACHMENT_BYTES` is what keeps that
predictable. When a desk outgrows it, `data` becomes a storage key and only
`attachments.ts` changes, because every caller already goes through it.

## Nothing the browser says about a file is believed

Three claims arrive with every upload and all three are re-derived:

- **The type is sniffed from the bytes.** `file.type` is a header anyone can
  set, and on a cheap Android it is often simply empty. An allowlist of magic
  numbers covers what a desk actually receives; everything else becomes
  `application/octet-stream`.
- **The size is measured from the bytes we hold.** The declared size is used
  only as a cheap pre-check so a 2 GB upload is refused before it is buffered.
- **The filename is stripped of paths and control characters.**
  `../../etc/passwd` must not survive even though nothing builds a path from it
  today — the day someone does is not the day to find out.

## Serving is the dangerous direction

Storing a hostile file is inert; handing it back is where it can execute.
Three things, none optional:

1. the **sniffed** type goes in the response header, never the claimed one;
2. `X-Content-Type-Options: nosniff`, so the browser cannot re-guess and undo
   the first;
3. only images and audio are `inline`. Everything else is `Content-Disposition:
   attachment` — the difference between a PDF viewer and arbitrary script
   running in this app's origin.

A browser check uploads an HTML file **declared as `image/png`** and asserts it
comes back as `application/octet-stream`, forced to download. That case is the
whole reason the other two rules exist.

## Voice notes are the same row

A voice note is a file that happened to be recorded here rather than chosen
from a disk, so it is the same table with `kind: VOICE` and a duration. Plain
`MediaRecorder` — in every browser this desk runs on, produces a Blob that goes
up the same multipart endpoint, no library.

Two details that are not obvious:

- **The microphone is requested on the press, not on page load.** A permission
  prompt that appears for no reason is one people deny.
- **The stream is stopped on unmount**, or the browser's recording indicator
  stays lit after the agent has moved to another ticket — and an agent who sees
  that once does not use the feature again.
- The file extension follows the container the browser actually produced
  (Safari records mp4, Chrome and Firefox webm), so a downloaded note opens in
  whatever the agent's machine associates with it.

`cleanAttachment` **refuses a `VOICE` whose bytes are not audio**. Otherwise
the player is handed a PNG on a row claiming to be playable, and the failure
surfaces at the moment somebody presses play.

## A failed upload is never a failed ticket

On the new-ticket form the files are *queued*, because there is no ticket to
attach them to until one exists. After creation they upload, and
`uploadPending` returns the errors rather than throwing: a ticket that was
created must not be reported as a failure because one of its five screenshots
was too big. The agent would log it again and the desk would have two.

## Verified

22 unit tests on sniffing, cleaning and filenames. 29 browser checks against
the production standalone build, including: bytes come back byte-identical, an
HTML file declared as PNG is neutralised, **another workspace gets 404 rather
than the file**, an anonymous request gets 401, an oversized file gets 413 with
the limit named, and a real recording made with Chromium's fake audio device
queues with a non-zero length.

The recorder check needs `--use-fake-device-for-media-stream`. Without it
headless Chromium has no microphone, `getUserMedia` rejects, and the button
correctly reports "no microphone" — which would let this suite pass on a
product that cannot record at all.

8 new strings in all six languages (436 keys each).

## Still open from that message

**AI-assisted drafting.** No LLM provider is configured anywhere in this repo.
The sibling Bank Assist runs Gemini over Vertex AI using the Cloud Run
revision's own service-account token — no API key to store or leak — and that
is the pattern to port. It needs the Vertex API enabled on the project and
`aiplatform.user` on the runtime service account before any of it can be
verified rather than assumed.
