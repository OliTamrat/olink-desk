"use client";
// Reports: how did we do, and is it better or worse than last time.
//
// The wallboard answers "right now". This is the screen that gets quoted in a
// board pack, so every number here either carries the count it rests on or
// refuses to appear — and a change is only shown when the base is big enough
// for it to mean anything (packages/reports/src/stats.ts).
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  colors,
  ConsoleShell,
  tUi,
  ui,
  useConsoleLanguage,
  useMe,
} from "../../lib/console-ui";
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
  if (minutes === null) return "—";
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
    href?: string,
  ) => {
    const body = (
      <>
        <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 8 }}>
          {tUi(lang, labelKey)}
        </div>
        <div
          style={{
            fontSize: 30,
            fontWeight: 700,
            color: colors.textPrimary,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1.1,
          }}
        >
          {render(m.current.value)}
        </div>
        {/* The denominator is never optional: a median over 2 tickets and
            over 200 are different facts wearing the same number. */}
        <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>
          {tUi(lang, "ui_rep_of_n", { n: m.current.n })}
        </div>
        <div style={{ fontSize: 12, marginTop: 8 }}>{deltaLine(m.delta, lowerIsBetter)}</div>
      </>
    );
    return href ? (
      <Link
        href={href}
        style={{ ...ui.card, flex: 1, minWidth: 190, textDecoration: "none", display: "block" }}
      >
        {body}
      </Link>
    ) : (
      <div style={{ ...ui.card, flex: 1, minWidth: 190 }}>{body}</div>
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
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {metricCard("ui_rep_volume", data.metrics.volume, (v) => String(v ?? 0), false, "/inbox?view=all")}
            {metricCard("ui_rep_first_response", data.metrics.firstResponse, duration, true, "/inbox?view=open&awaiting=1")}
            {metricCard("ui_rep_resolution", data.metrics.resolution, duration, true, "/inbox?view=solved")}
            {metricCard(
              "ui_rep_on_time",
              data.metrics.onTime,
              (v) => (v === null ? "—" : `${Math.round(v * 100)}%`),
              false,
              "/inbox?view=open&sla=breached",
            )}
            {/* `ui_satisfaction`, not the wallboard's `ui_wb_csat`: that key
                reads "Satisfaction today", which is wrong on a 30- or 90-day
                report. Caught in a screenshot, not by any assertion. */}
            {metricCard(
              "ui_satisfaction",
              data.metrics.csat,
              (v) => (v === null ? "—" : `${v}/5`),
              false,
            )}
          </div>

          {/* Volume over time. Every day in the window is drawn, including
              the empty ones — a chart built only from days that had tickets
              turns a quiet week into a flat line at the busy level. */}
          <section style={ui.card}>
            <h2 style={{ ...ui.h2, marginBottom: 14 }}>{tUi(lang, "ui_rep_volume")}</h2>
            {(() => {
              const max = Math.max(...data.volume.map((d) => d.count), 1);
              return (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 2,
                    height: 120,
                    overflowX: "auto",
                  }}
                >
                  {data.volume.map((d) => (
                    <div
                      key={d.date}
                      title={`${d.date}: ${d.count}`}
                      style={{
                        flex: 1,
                        minWidth: 3,
                        height: `${Math.max((d.count / max) * 100, d.count > 0 ? 4 : 1)}%`,
                        background: d.count > 0 ? colors.accent : colors.border,
                        borderRadius: 2,
                      }}
                    />
                  ))}
                </div>
              );
            })()}
          </section>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
            <section style={{ ...ui.card, flex: "1 1 300px" }}>
              <h2 style={{ ...ui.h2, marginBottom: 14 }}>{tUi(lang, "ui_rep_topics")}</h2>
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
              <h2 style={{ ...ui.h2, marginBottom: 14 }}>{tUi(lang, "ui_by_channel")}</h2>
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
              <h2 style={{ ...ui.h2, marginBottom: 14 }}>{tUi(lang, "ui_rep_languages")}</h2>
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
