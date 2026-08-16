# ADR 0022 — Light, dark, and blue

- **Status:** Accepted
- **Date:** 2026-08-16
- **Context:** Founder: the console should work on white as well as black, with
  an appearance control users pick from — and "purple is not my goto colour, I
  prefer tech savvy blue for buttons."

## 444 call sites, none of them edited

`colors.*` used to be hex. It is now a map of **CSS custom property
references** — `colors.bg` is the string `var(--bg)`. Every screen already
wrote `colors.textMuted`, so redefining the variable under a theme selector
re-themes the whole console without touching a single component.

The alternative — resolving a theme's hex in React — would need every consumer
to re-render on a theme change and would paint the wrong colour on first load.
Custom properties change with a single attribute on `<html>`, before React
exists.

Two things had to move for that to work:

- **Nine alpha concatenations.** `` `${colors.warn}55` `` produces
  `var(--warn)55`, which is not a colour. They are now named tokens
  (`warnFaint`, `dangerFaint`, …) spelled out per theme rather than composed
  with `color-mix()` — this console's users are on cheap Android handsets whose
  Chrome predates it, and a border that silently computes to `transparent` on
  an old browser is exactly the degradation nobody reports.
- **Shadows.** A dark theme separates a popover from the page with a heavy
  black drop; on white that same drop reads as dirt. `shadow` and
  `shadowStrong` carry whole `box-shadow` values, so blur and offset can
  differ per theme too.

## The three-state stylesheet, and why one state is not enough

1. Bare `:root` carries **light**. A colour whose only definition lives inside
   a media query has no value at all when that query does not match.
2. `prefers-color-scheme: dark` supplies dark for anyone who has chosen
   nothing — guarded by `:not([data-theme="light"])`, so an explicit light
   choice survives a dark OS.
3. `[data-theme="dark"]` supplies it again, so an explicit dark choice
   survives a light OS.

**Both directions, or the toggle only works one way** — the usual half-fix,
and the reason the drive checks light-on-dark-device *and* dark-on-light-device
rather than one of them.

`color-scheme` rides with each block so the browser's own surfaces follow:
scrollbars, the overscroll gutter, form-control defaults. A light scrollbar
down the side of a black console is the tell that this was forgotten.

## No flash, which no screenshot can prove

A blocking script in `<head>` stamps the attribute before first paint. React
cannot do this job — it sets the attribute after hydration, which is a white
flash on every navigation for a dark-theme user.

That property is invisible to any check that runs after load, so the drive
reads the attribute at **DOMContentLoaded** instead. It also forces
`suppressHydrationWarning` on `<html>`: the script legitimately changes an
attribute the server did not render.

## Two accents, because one blue cannot do both jobs

`accent` is the interactive colour drawn **as** text, icons and rules on the
page. `accentSolid` is what a filled control is painted **with**, carrying
`onAccent` on top.

In the light theme they are the same `#1d4ed8`. In the dark theme they cannot
be: a blue readable as text on near-black (`#5b9dff`, 7.3:1) carries white at
only 3.2:1, so a button label on it fails. The fill is `#2563eb`, where white
clears 5.1:1. Three places were painting text on the bright tint — the primary
button, the quick-add button, and the avatar's initials — and the last of those
had a gradient whose light end could never have passed.

## Checked by arithmetic, not by eye

A theme is the one change whose defects are invisible to the person making it:
I read every screen on one monitor, and "looks fine" is not a measurement.
`packages/tickets/test/contrast.test.ts` implements WCAG relative luminance,
proves it against the reference points (21:1 black on white, 1:1 self), then
holds **both** palettes to it — every rung of the text ladder on every surface
it is drawn on, every status colour on its own tint, the button pairing, and
the card edge.

It immediately failed on something I had eyeballed as fine: the light theme's
border at `#e3e7ed` came in at **1.16** against the page — a card edge you
cannot see. `#d7dee7` was chosen by measuring candidates, not by squinting.

Light themes fail differently from dark ones, which is the argument for testing
both rather than assuming the second follows the first.

## The two places a token cannot reach

Both are the most visible surfaces a stranger meets, and the accent would have
stayed purple in both:

- **The embed launcher.** JavaScript served to a third-party page; it cannot
  see our custom properties, so its colours must be literals. A test asserts
  the literal gradient matches the dark palette's real accent pair.
- **`app/page.tsx`.** The one screen that predated the token file and never
  joined it — `#555`, `#fff`, `#1d4ed8`, and `system-ui` instead of the font
  token. A test now fails on any raw hex outside `theme.ts`.

Both tests were confirmed to fail on the thing they exist to catch before being
trusted.

## The widget does not follow the visitor's OS

It renders in an iframe the embed loader creates on somebody else's website,
and that loader's border and background are literals it cannot theme. A visitor
on a light machine would get a pale panel inside a dark frame on a bank's
homepage. `pinnedThemeCss("dark")` emits the dark block from the page itself,
after the head stylesheet, so it wins on order — server-rendered, so still no
flash.

The console's light/dark choice is for **staff, on our own origin**. The
widget's appearance belongs to the tenant, and giving tenants that knob is
separate work.

## Verified

19 browser checks against the production standalone build. Beyond the theme
switching itself: that no text anywhere in the light theme is invisible against
its own background — the check that catches a token resolving to nothing, since
`var(--x)` with no `--x` inherits, and inherited text on a same-coloured
background is text you cannot read.

4 new strings in all six languages. `ui_appearance_system` is deliberately
"Match my device" rather than "System" or "Automatic": many users here have
never seen an OS setting named that way, and the point is that it changes by
itself at dusk.
