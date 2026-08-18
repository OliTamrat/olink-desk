"use client";
// The card language, in one place.
//
// Every console surface was inventing its own card: a title here, a bare
// heading there, an empty state that was one muted line hugging the top of a
// 300px box. The result read as several products stapled together — which is
// the "dull and ugly" the founder named, and none of it was visible to a test
// asserting the DATA was right, because the data always was.
//
// The anatomy is Onekof PM's, kept whole: an icon tile as the marker every
// card wears, a title, a sentence saying what the card is FOR, then the body.
// Anything that renders a card uses these rather than restating them.
import { type CSSProperties, type ReactNode } from "react";

import { colors, radius } from "./theme";

/** Stroke props every glyph in the console shares, so icons look like a set. */
export const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** A rounded-square icon tile — the marker every card in this language wears. */
export function IconTile({
  children,
  tint,
  size = 40,
}: {
  children: ReactNode;
  tint?: string;
  size?: number;
}): ReactNode {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: radius.md,
        background: colors.surfaceHover,
        color: tint ?? colors.accent,
      }}
    >
      {children}
    </span>
  );
}

/**
 * A card's head: icon, title, and the sentence under it.
 *
 * The sentence is not decoration. It is the part of the reference card most
 * worth copying — it says what the card is for and what you can do with it,
 * so nobody has to click to find out whether clicking does anything.
 */
export function CardHead({
  icon,
  title,
  blurb,
  tint,
  right,
}: {
  icon: ReactNode;
  title: string;
  blurb?: string;
  tint?: string;
  right?: ReactNode;
}): ReactNode {
  return (
    <header style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: blurb ? 14 : 12 }}>
      <IconTile tint={tint}>{icon}</IconTile>
      <div style={{ minWidth: 0, flex: 1 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: colors.textPrimary }}>
          {title}
        </h2>
        {blurb ? (
          <p style={{ margin: "4px 0 0", fontSize: 13.5, lineHeight: 1.5, color: colors.textSecondary }}>
            {blurb}
          </p>
        ) : null}
      </div>
      {right ? <div style={{ flexShrink: 0 }}>{right}</div> : null}
    </header>
  );
}

/**
 * What a card shows when it has nothing to show.
 *
 * One muted line at the top-left of a tall box is the shape of a panel that
 * failed to load. An empty state has to look *chosen*: centred, with room
 * around it, a glyph, the fact in a sentence, and — where there is one — the
 * thing to do about it. The vertical padding is the whole point; without it
 * this is the same defect with nicer words in it.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  tone = "muted",
  ...rest
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
  /** `good` for "nothing is wrong", `muted` for "nothing is here yet". */
  tone?: "muted" | "good";
} & Record<`data-${string}`, string | undefined>): ReactNode {
  const tint = tone === "good" ? colors.success : colors.textMuted;
  return (
    <div
      {...rest}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 10,
        padding: "44px 20px",
      }}
    >
      {icon ? <IconTile tint={tint}>{icon}</IconTile> : null}
      <div style={{ fontSize: 15, fontWeight: 600, color: colors.textBody }}>{title}</div>
      {hint ? (
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: colors.textMuted, maxWidth: 380 }}>
          {hint}
        </div>
      ) : null}
      {action}
    </div>
  );
}

/**
 * A figure inside a card — a duration, a score, a median.
 *
 * `value` is null when the desk has not produced one yet, and that case gets
 * WORDS rather than an em-dash. Three stacked dashes is what a broken panel
 * looks like; "No replies yet today" is a desk that is simply quiet, and the
 * reader can tell those apart at a glance.
 */
export function Figure({
  label,
  value,
  empty,
  note,
}: {
  label: string;
  value: string | null;
  /** Shown in place of the number when there is nothing to report. */
  empty: string;
  note?: string;
}): ReactNode {
  return (
    <div>
      <div style={{ fontSize: 12.5, color: colors.textSecondary, marginBottom: 4 }}>{label}</div>
      {value === null ? (
        <div style={{ fontSize: 14, color: colors.textMuted, fontStyle: "italic" }}>{empty}</div>
      ) : (
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-.02em",
            color: colors.textPrimary,
            lineHeight: 1.1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </div>
      )}
      {note ? (
        <div style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 3 }}>{note}</div>
      ) : null}
    </div>
  );
}

/**
 * A card whose actions sit in a footer at the BOTTOM of it.
 *
 * This is what makes a grid of cards line up. Cards were laying title, meta
 * and buttons out as one wrapping flex row, so a longer title wrapped the
 * buttons under it on one card and not on its neighbour — and the row of
 * cards came out ragged, which is exactly the "cards are not aligned" the
 * founder pointed at. A column with `marginTop: auto` on the footer puts
 * every card's actions on the same line regardless of what is above them.
 */
export const cardColumn: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  boxSizing: "border-box",
};

export const cardFooter: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
  marginTop: "auto",
  paddingTop: 12,
  borderTop: `1px solid ${colors.border}`,
};
