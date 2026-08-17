"use client";
// The lifecycle overview — the shape of the desk's work, and a way into any
// part of it.
//
// Built from Onekof PM's own card anatomy: an icon tile, a title, a sentence
// saying what the card is FOR, a hero total, a compact visual, and a list of
// rows carrying count · share with a chevron that drills down. Empty states
// stay in the list, dimmed.
//
// **The one thing not carried across is the donut.** A ring is a poor
// part-to-whole reading — angles are harder to compare than lengths, and on a
// 390px phone the circle is small while a bar is the full width of the card.
// The precise reading in Onekof's own card happens in the LIST beside the
// ring, which is kept here in full. So: same anatomy, better geometry.
import Link from "next/link";
import { type ReactNode } from "react";

import { composition, type LifecycleKey, type StatusCounts } from "@olink-desk/reports";
import type { Language } from "@olink-desk/i18n";

import { IconTile, stroke } from "./card";
import { colors, LIFECYCLE_INK, radius } from "./theme";

// The tile and the glyph set now live in `card.tsx` with the rest of the card
// language. Re-exported because this module was where they started and the
// dashboard still reaches for them here.
export { IconTile };

export function StatusOverview({
  lang,
  counts,
  selected,
  onSelect,
  t,
}: {
  lang: Language;
  counts: StatusCounts;
  selected: LifecycleKey | null;
  onSelect: (k: LifecycleKey | null) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}): ReactNode {
  const { total, slices } = composition(counts);
  const chartId = "status-overview";

  return (
    <section style={{ ...cardStyle }} data-status-overview aria-labelledby={`${chartId}-title`}>
      <header style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 4 }}>
        <IconTile>
          <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
            <path d="M4 6h10M4 12h10M4 18h10" />
            <path d="m18 5 2 2 3-3" />
          </svg>
        </IconTile>
        <div style={{ minWidth: 0 }}>
          <h2 id={`${chartId}-title`} style={{ margin: 0, fontSize: 19, fontWeight: 700, color: colors.textPrimary }}>
            {t("ui_overview_title")}
          </h2>
        </div>
      </header>
      {/* The sentence under the title is the part of Onekof's card most worth
          copying: it says what the card is for AND what you can do with it,
          so nobody has to click to find out whether clicking does anything. */}
      <p style={{ margin: "0 0 18px", fontSize: 14, lineHeight: 1.5, color: colors.textSecondary }}>
        {t("ui_overview_blurb")}
      </p>

      {/* Hero figure: the one number the card leads with. */}
      <div style={{ marginBottom: 12 }}>
        <div
          data-overview-total
          style={{
            fontSize: 44,
            fontWeight: 700,
            lineHeight: 1,
            color: colors.textPrimary,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {total}
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            color: colors.textMuted,
            marginTop: 6,
          }}
        >
          {t("ui_overview_total")}
        </div>
      </div>

      {/* One stacked bar, full width. 2px surface gaps between segments and
          rounded ends on the outermost pair — the segments must not read as
          one continuous smear when two neighbouring hues are close. */}
      <div
        role="img"
        aria-label={slices
          .filter((s) => s.count > 0)
          .map((s) => `${t(s.label)} ${s.count} (${s.percent}%)`)
          .join(", ")}
        style={{
          display: "flex",
          gap: 2,
          height: 10,
          borderRadius: 999,
          overflow: "hidden",
          background: colors.surfaceHover,
          marginBottom: 18,
        }}
      >
        {slices
          .filter((s) => s.count > 0)
          .map((s) => (
            <span
              key={s.key}
              data-segment={s.key}
              title={`${t(s.label)} · ${s.count} · ${s.percent}%`}
              style={{
                flex: `${s.count} 0 0`,
                minWidth: 3,
                background: LIFECYCLE_INK[s.key],
                borderRadius: 4,
                // Dim the rest when one row is selected, so the selection is
                // visible on the bar and not only in the list.
                opacity: selected && selected !== s.key ? 0.35 : 1,
                transition: "opacity .15s ease",
              }}
            />
          ))}
      </div>

      <div style={{ display: "grid" }} data-overview-rows>
        {slices.map((s) => {
          const empty = s.count === 0;
          const on = selected === s.key;
          return (
            <button
              key={s.key}
              data-overview-row={s.key}
              aria-pressed={on}
              disabled={empty}
              onClick={() => onSelect(on ? null : s.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                textAlign: "start",
                padding: "10px 10px",
                borderRadius: radius.sm + 2,
                border: "none",
                background: on ? colors.surfaceHover : "transparent",
                // An empty state stays in the list — "Pending 0" is
                // information — but it is not a destination, so it is dimmed
                // and not clickable.
                cursor: empty ? "default" : "pointer",
                fontFamily: "inherit",
                fontSize: 14.5,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: LIFECYCLE_INK[s.key],
                  opacity: empty ? 0.35 : 1,
                }}
              />
              {/* Text wears text tokens, never the series colour. The dot
                  beside it carries identity. */}
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  color: empty ? colors.textMuted : colors.textPrimary,
                  fontWeight: on ? 600 : 500,
                }}
              >
                {t(s.label)}
              </span>
              <span
                style={{
                  color: empty ? colors.textMuted : colors.textSecondary,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                {s.count} · {s.percent}%
              </span>
              <span aria-hidden style={{ color: colors.textMuted, width: 14, flexShrink: 0 }}>
                {empty ? null : on ? "⌄" : "›"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The drill-down that answers the row somebody just tapped.
 *
 * Onekof's version, kept whole: the state and its count as a title, a line
 * saying what the list is, and a Clear that puts the card away. The link out
 * to the full filtered list is what stops this becoming a second inbox.
 */
export function StatusDrilldown({
  t,
  slice,
  rows,
  onClear,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  slice: { key: LifecycleKey; label: string; count: number; href: string };
  rows: Array<{ id: string; number: number; subject: string | null }>;
  onClear: () => void;
}): ReactNode {
  return (
    <section style={cardStyle} data-status-drilldown={slice.key}>
      <header
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
          <IconTile tint={LIFECYCLE_INK[slice.key]}>
            <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
              <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
            </svg>
          </IconTile>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: colors.textPrimary }}>
            {t(slice.label)} · {slice.count}
          </h2>
        </div>
        <button
          onClick={onClear}
          data-drilldown-clear
          style={{
            border: "none",
            background: "none",
            color: colors.accent,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 14,
            fontWeight: 600,
            padding: 4,
          }}
        >
          {t("ui_overview_clear")}
        </button>
      </header>
      <p style={{ margin: "0 0 14px", fontSize: 14, color: colors.textSecondary }}>
        {t("ui_overview_recent")}
      </p>
      <div
        aria-hidden
        style={{
          height: 3,
          width: 96,
          borderRadius: 999,
          background: LIFECYCLE_INK[slice.key],
          marginBottom: 12,
        }}
      />
      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13.5, color: colors.textMuted }}>
          {t("ui_no_tickets")}
        </p>
      ) : (
        <div style={{ display: "grid" }}>
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/inbox?ticket=${r.id}`}
              style={{
                display: "flex",
                gap: 10,
                padding: "10px 0",
                textDecoration: "none",
                borderTop: `1px solid ${colors.border}`,
                fontSize: 14,
              }}
            >
              <span
                style={{
                  color: colors.textMuted,
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                #{r.number}
              </span>
              <span
                style={{
                  color: colors.textBody,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {r.subject ?? ""}
              </span>
            </Link>
          ))}
        </div>
      )}
      <Link
        href={slice.href}
        style={{
          display: "inline-block",
          marginTop: 14,
          color: colors.accent,
          textDecoration: "none",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {t("ui_overview_see_all", { n: slice.count })} →
      </Link>
    </section>
  );
}

const cardStyle = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.lg,
  padding: 20,
  boxSizing: "border-box",
} as const;
