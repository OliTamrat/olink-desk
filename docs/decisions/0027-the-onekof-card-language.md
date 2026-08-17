# ADR 0027 — The Onekof card language, and a validated chart palette

- **Status:** Accepted
- **Date:** 2026-08-17
- **Context:** Founder, with a screenshot of Onekof PM's mobile dashboard:
  "be inspired by one of our own Onekof PM designs — the card design, text and
  overall a mobile version approach."

## What was worth copying

The reference card is doing five things, and four of them are language rather
than layout:

1. **An icon tile** — a rounded square with a tinted ground — as the marker
   every card wears. Cheap, and it makes a column of cards scannable.
2. **A sentence under the title** saying what the card is FOR *and what you can
   do with it*: "Click anywhere to drill down." This is the strongest idea in
   the screenshot. Nobody should have to click to find out whether clicking
   does anything.
3. **A hero total** with a small-caps label under it.
4. **Rows carrying `count · share`** with a chevron, where **empty states stay
   in the list, dimmed**. "Waiting on customer 0" is information — it says the
   desk has that state and nothing is in it. Dropping empty rows makes the list
   change shape as work moves through it, which is exactly when somebody is
   reading it.
5. **A drill-down card** that names the state and its count, says what the list
   is, and offers Clear.

All five are now in the dashboard. The tiles also take the reference's
proportions — icon, then a large number, then a small label **under** it. Ours
had the label above, which reads as a caption looking for its picture.

## What was not copied: the donut

A ring is a poor part-to-whole reading. Angles are harder to compare than
lengths, and on a 390px phone the circle is small while a bar is the full width
of the card. **The precise reading in Onekof's own card already happens in the
list beside the ring** — every row carries its count and share — so the ring is
carrying shape, not numbers.

Same anatomy, better geometry: one horizontal stacked bar, full width, with the
list kept whole. Stated here rather than done quietly, because it is a
departure from a reference the founder chose.

## The palette was computed, not chosen

Four lifecycle hues, run through the palette validator against **both real
surfaces** in the exact stack order — order is what the adjacent-pair
colour-blindness check reads.

The obvious first set (blue, green, amber, violet, slate) failed **three ways**:
outside the lightness band for a dark surface, slate below the chroma floor so
it reads grey, and — the one that matters — **violet against blue at ΔE 1.3
under deuteranopia**, which is invisible. No amount of looking at the screen
would have found the third.

The shipped set is `#2563eb → #0d9488 → #d97706 → #9333ea`, passing all five
checks on `#121216` and `#ffffff`.

**RESOLVED and CLOSED are one "Done" segment.** Both mean "not on anybody's
desk", and splitting them makes a four-hue chart into five — past the point
where adjacent hues stay separable. They remain separate statuses everywhere a
ticket is actually worked.

**The hues live in `theme.ts`, not in the screen.** The no-raw-hex guard caught
them there and was right to: a colour validated once should not sit somewhere a
second person can add a fifth without re-running the checks.

## Shares add up to 100

Largest-remainder, not independent rounding. Four numbers each rounded on their
own routinely sum to 99 or 101, and a panel whose percentages do not add up is
one nobody trusts with the counts either. The remainder never goes to a state
with no tickets in it — an empty state showing 1% sends the reader looking for
a ticket that is not there.

The counts come from a **grouped query over the whole workspace**, not from the
page of tickets the list happened to return: a share computed from a truncated
list is a wrong number that looks right.

## Two mobile defects only the screenshot found

Both passed every automated check before they were looked at:

1. **The tiles were one per row at 390px.** `minmax(210px, 1fr)` fits one
   column inside a phone's gutters, so four glanceable numbers became a scroll.
   150px gives the reference's 2×2 and still reflows to a row of four on a
   desk.
2. **The status badge in Recent tickets was crushed** by a flex line with no
   `flexShrink: 0` on it. It produced **no document overflow** — the text was
   cut off inside its own row — so the existing overflow check could not see
   it.

The second is the third time this session that a check measured something
adjacent to the thing. Its replacement compares a row's right edge against its
card's.

## Verified

25 browser checks against the production standalone build, **driven on a phone
first** since that is the layout that was asked for: the hero number is the
workspace's real total, the shares on screen sum to 100, the widest segment is
the biggest count, the drill-down lists the tickets the API agrees are in that
state, an emptied state keeps its row and loses its segment, and nothing in the
card is invisible against its own background in either theme.

7 new strings in all six languages.
