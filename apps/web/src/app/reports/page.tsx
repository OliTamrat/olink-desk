"use client";
// Reports: how did we do, and is it better or worse than last time.
//
// The wallboard answers "right now". This is the screen that gets quoted in a
// board pack, so every number here either carries the count it rests on or
// refuses to appear — and a change is only shown when the base is big enough
// for it to mean anything (packages/reports/src/stats.ts).
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import {
  colors,
  ConsoleShell,
  tUi,
  ui,
  useConsoleLanguage,
  useMe,
} from "../../lib/console-ui";
import { CardHead, EmptyState, IconTile, stroke } from "../../lib/card";
import { CHANNEL_LABELS } from "../../lib/tickets";

const RANGES = [7, 30, 90] as const;

interface Measure {
  value: number | null;
  n: number;
}
interface Delta {
  change: number | null;
  reason: "ok" | "no_previous" | "no_current" | "too_few";
}
interface Metric {
  current: Measure;
  previous: Measure;
  delta: Delta;
}
interface ReportData {
  range: { days: number };
  volume: Array<{ date: string; count: number }>;
  metrics: {
    firstResponse: Metric;
    resolution: Metric;
    onTime: Metric;
    csat: Metric;
    volume: Metric;
  };
  byChannel: Array<{ key: string; count: number }>;
  byLanguage: Array<{ key: string; count: number }>;
  topTags: Array<{ slug: string; name: string; count: number }>;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  am: "አማርኛ",
  om: "Afaan Oromoo",
  ti: "ትግርኛ",
  so: "Soomaali",
  sw: "Kiswahili",
};

/** Minutes as something a person reads at a glance. */
function duration(minutes: number | null): string {
  // Never an em-dash. A metric the desk has not produced yet is a fact about
  // a quiet week, and rendering it identically to a broken panel is how the
  // wallboard came to read as broken — see ADR 0028.
  if (minutes === null) return "";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h}h ${minutes % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export default function ReportsPage() {
  const [lang, setLang] = useConsoleLanguage();
  const me = useMe();
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<ReportData | null>(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    const resp = await fetch(`/api/reports?days=${days}`);
    if (resp.status === 403) {
      setDenied(true);
      return;
    }
    if (resp.ok) setData((await resp.json()) as ReportData);
  }, [days]);

  useEffect(() => {
    if (!me) return;
    void load();
  }, [me, load]);

  // A change is rendered in WORDS, with its direction named. An arrow and a
  // percentage alone are read as a trend even when the base cannot support
  // one, which is exactly what `delta` refuses to produce.
  const deltaLine = (d: Delta, lowerIsBetter: boolean) => {
    if (d.reason === "too_few") {
      return <span style={{ color: colors.textMuted }}>{tUi(lang, "ui_delta_too_few")}</span>;
    }
    if (d.change === null) {
      return (
        <span style={{ color: colors.textMuted }}>{tUi(lang, "ui_delta_no_previous")}</span>
      );
    }
    const improved = lowerIsBetter ? d.change < 0 : d.change > 0;
    const pct = `${Math.abs(Math.round(d.change * 100))}%`;
    return (
      <span style={{ color: improved ? colors.success : colors.warn }}>
        {tUi(lang, improved ? "ui_delta_better" : "ui_delta_worse", { pct })}
      </span>
    );
  };

  const metricCard = (
    labelKey: string,
    m: Metric,
    render: (v: number | null) => string,
    lowerIsBetter: boolean,
    icon: ReactNode,
    href?: string,
  ) => {
    const text = render(m.current.value);
    const body = (
      <>
        <IconTile size={34}>{icon}</IconTile>
        {/* Words when there is no figure. Four em-dashes across a row of
            tiles reads as a report that failed to load, which is the exact
            defect ADR 0028 removed from the wallboard — the same page had it
            and nobody had screenshotted it yet. */}
        {text ? (
          <div
            style={{
              fontSize: 30,
              fontWeight: 700,
              color: colors.textPrimary,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.1,
              marginTop: 12,
            }}
          >
            {text}
          </div>
        ) : (
          <div
            style={{
              fontSize: 14.5,
              color: colors.textMuted,
              fontStyle: "italic",
              marginTop: 14,
              lineHeight: 1.3,
            }}
          >
            {tUi(lang, "ui_rep_nothing_yet")}
          </div>
        )}
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: colors.textSecondary,
            marginTop: 8,
          }}
        >
          {tUi(lang, labelKey)}
        </div>
        {/* The denominator is never optional: a median over 2 tickets and
            over 200 are different facts wearing the same number. Suppressed
            when there is no figure — "of 0" under "Nothing yet" is the same
            sentence twice. */}
        {text ? (
          <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 3 }}>
            {tUi(lang, "ui_rep_of_n", { n: m.current.n })}
          </div>
        ) : null}
        <div style={{ fontSize: 12, marginTop: 8 }}>{deltaLine(m.delta, lowerIsBetter)}</div>
      </>
    );
    const shell = {
      ...ui.card,
      padding: 18,
      // Every tile the same height regardless of whether it carries a figure,
      // a denominator, or neither.
      height: "100%",
      boxSizing: "border-box" as const,
    };
    return href ? (
      <Link href={href} style={{ ...shell, textDecoration: "none", display: "block" }}>
        {body}
      </Link>
    ) : (
      <div style={shell}>{body}</div>
    );
  };

  // A horizontal bar list where every row drills to the tickets behind it.
  const barList = (
    rows: Array<{ key: string; label: string; count: number; href: string }>,
    emptyKey: string,
  ) => {
    if (rows.length === 0) {
      return (
        <p style={{ margin: 0, color: colors.textMuted, fontSize: 13 }}>
          {tUi(lang, emptyKey)}
        </p>
      );
    }
    const max = Math.max(...rows.map((r) => r.count), 1);
    return (
      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((r) => (
          <Link key={r.key} href={r.href} style={{ display: "block", textDecoration: "none" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
                marginBottom: 4,
              }}
            >
              <span style={{ color: colors.textBody }}>{r.label}</span>
              <span
                style={{ color: colors.textSecondary, fontVariantNumeric: "tabular-nums" }}
              >
                {r.count}
              </span>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 999,
                background: colors.surfaceHover,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${(r.count / max) * 100}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: colors.accent,
                }}
              />
            </div>
          </Link>
        ))}
      </div>
    );
  };

  return (
    <ConsoleShell lang={lang} onLang={setLang} me={me} active="reports">
      <header style={{ marginBottom: 18 }}>
        <h1 style={ui.h1}>{tUi(lang, "ui_reports_title")}</h1>
        <p style={{ ...ui.sub, maxWidth: 640 }}>{tUi(lang, "ui_reports_subtitle")}</p>
      </header>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setDays(r)}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: `1px solid ${days === r ? colors.accent : colors.border}`,
              background: days === r ? colors.surfaceHover : "transparent",
              color: days === r ? colors.textPrimary : colors.textSecondary,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {tUi(lang, `ui_range_${r}`)}
          </button>
        ))}
      </div>

      {denied ? (
        <div style={ui.error}>403</div>
      ) : !data ? (
        <p style={{ color: colors.textSecondary }}>{tUi(lang, "ui_loading")}</p>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: 16,
              alignItems: "stretch",
            }}
          >
            {metricCard(
              "ui_rep_volume", data.metrics.volume, (v) => String(v ?? 0), false,
              <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
              </svg>,
              "/inbox?view=all",
            )}
            {metricCard(
              "ui_rep_first_response", data.metrics.firstResponse, duration, true,
              <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
                <path d="M3 20V4l18 8-18 8Z" />
              </svg>,
              "/inbox?view=open&awaiting=1",
            )}
            {metricCard(
              "ui_rep_resolution", data.metrics.resolution, duration, true,
              <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
                <circle cx="12" cy="12" r="9" />
                <path d="m8.5 12 2.5 2.5 4.5-5" />
              </svg>,
              "/inbox?view=solved",
            )}
            {metricCard(
              "ui_rep_on_time",
              data.metrics.onTime,
              (v) => (v === null ? "" : `${Math.round(v * 100)}%`),
              false,
              <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>,
              "/inbox?view=open&sla=breached",
            )}
            {/* `ui_satisfaction`, not the wallboard's `ui_wb_csat`: that key
                reads "Satisfaction today", which is wrong on a 30- or 90-day
                report. Caught in a screenshot, not by any assertion. */}
            {metricCard(
              "ui_satisfaction",
              data.metrics.csat,
              (v) => (v === null ? "" : `${v}/5`),
              false,
              <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
                <path d="M12 3.5 14.6 9l6 .9-4.3 4.2 1 6-5.3-2.8L6.7 20l1-6L3.4 9.9 9.4 9 12 3.5Z" />
              </svg>,
            )}
          </div>

          {/* Volume over time. Every day in the window is drawn, including
              the empty ones — a chart built only from days that had tickets
              turns a quiet week into a flat line at the busy level. */}
          <section style={ui.card}>
            {(() => {
              const max = Math.max(...data.volume.map((d) => d.count), 1);
              const total = data.volume.reduce((a, d) => a + d.count, 0);
              const busiest = data.volume.reduce(
                (a, d) => (d.count > a.count ? d : a),
                data.volume[0] ?? { date: "", count: 0 },
              );
              // A date the reader recognises, in their own locale, without a
              // year — the range pills above already say which window this is.
              const day = (iso: string) =>
                new Date(`${iso}T00:00:00Z`).toLocaleDateString(lang === "en" ? undefined : lang, {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                });
              return (
                <>
                  <CardHead
                    icon={
                      <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
                        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
                      </svg>
                    }
                    title={tUi(lang, "ui_rep_volume")}
                    blurb={tUi(lang, "ui_rep_volume_blurb")}
                  />
                  {total === 0 ? (
                    <EmptyState
                      data-report-novolume="1"
                      icon={
                        <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
                          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
                        </svg>
                      }
                      title={tUi(lang, "ui_rep_no_volume")}
                      hint={tUi(lang, "ui_rep_no_volume_hint")}
                    />
                  ) : (
                    <>
                      {/* The busiest day, named. A single bar at one end of a
                          ninety-slot chart is unreadable as a number; the
                          sentence carries the reading and the bars carry the
                          shape. */}
                      <p style={{ margin: "0 0 12px", fontSize: 13.5, color: colors.textBody }}>
                        {tUi(lang, "ui_rep_volume_peak", {
                          n: busiest.count,
                          date: day(busiest.date),
                        })}
                      </p>
                      <div style={{ position: "relative" }}>
                        {/* A y-max label and a baseline. Without them the bar
                            heights are decoration — there is nothing to read
                            them against. */}
                        <div
                          style={{
                            position: "absolute",
                            insetInlineStart: 0,
                            top: -2,
                            fontSize: 11,
                            color: colors.textMuted,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {max}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-end",
                            gap: 2,
                            height: 120,
                            paddingInlineStart: 26,
                            borderBottom: `1px solid ${colors.border}`,
                          }}
                        >
                          {data.volume.map((d) => (
                            <div
                              key={d.date}
                              title={`${day(d.date)}: ${d.count}`}
                              style={{
                                flex: 1,
                                minWidth: 2,
                                height: `${Math.max((d.count / max) * 100, d.count > 0 ? 4 : 1)}%`,
                                background: d.count > 0 ? colors.accent : colors.border,
                                borderRadius: 2,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                      {/* Both ends of the window named, so the chart says
                          WHEN as well as how much. */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 11.5,
                          color: colors.textMuted,
                          marginTop: 6,
                          paddingInlineStart: 26,
                        }}
                      >
                        <span>{day(data.volume[0]?.date ?? "")}</span>
                        <span>{day(data.volume[data.volume.length - 1]?.date ?? "")}</span>
                      </div>
                    </>
                  )}
                </>
              );
            })()}
          </section>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "stretch" }}>
            <section style={{ ...ui.card, flex: "1 1 300px" }}>
              <CardHead
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
                    <path d="M20.6 13.4 12 4.8V2H8.8L3 7.8V11l8.6 8.6a2 2 0 0 0 2.8 0l6.2-6.2a2 2 0 0 0 0-2.8Z" />
                    <path d="M7 8h.01" />
                  </svg>
                }
                title={tUi(lang, "ui_rep_topics")}
              />
              {barList(
                data.topTags.map((t) => ({
                  key: t.slug,
                  label: t.name,
                  count: t.count,
                  href: `/inbox?view=all&tag=${encodeURIComponent(t.slug)}`,
                })),
                "ui_rep_no_tags",
              )}
            </section>

            <section style={{ ...ui.card, flex: "1 1 240px" }}>
              <CardHead
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
                  </svg>
                }
                title={tUi(lang, "ui_by_channel")}
              />
              {barList(
                data.byChannel.map((c) => ({
                  key: c.key,
                  label: CHANNEL_LABELS[c.key] ?? c.key,
                  count: c.count,
                  href: `/inbox?view=all&channel=${c.key}`,
                })),
                "ui_no_data",
              )}
            </section>

            <section style={{ ...ui.card, flex: "1 1 240px" }}>
              <CardHead
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
                  </svg>
                }
                title={tUi(lang, "ui_rep_languages")}
              />
              {barList(
                data.byLanguage.map((l) => ({
                  key: l.key,
                  // In its own script — a manager reading this recognises
                  // ትግርኛ far faster than "ti".
                  label: LANGUAGE_NAMES[l.key] ?? l.key,
                  count: l.count,
                  href: `/inbox?view=all`,
                })),
                "ui_no_data",
              )}
            </section>
          </div>
        </div>
      )}
    </ConsoleShell>
  );
}
