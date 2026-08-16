"use client";
// The supervisor wallboard — built for a TV or second monitor: big numbers,
// live colors, no interaction needed. Breach state is derived server-side
// from the stored SLA due dates on every poll (10s), so what the room sees
// is never stale.
import { useCallback, useEffect, useState } from "react";

import {
  Badge,
  colors,
  ConsoleShell,
  tUi,
  ui,
  useConsoleLanguage,
  useMe,
} from "../../lib/console-ui";
import { duration } from "../../lib/tickets";

interface QueueRow {
  queueId: string | null;
  name: string | null;
  open: number;
  unassigned: number;
  atRisk: number;
  breached: number;
  oldestWaitMinutes: number | null;
}

interface WallboardData {
  totals: { open: number; atRisk: number; breached: number; newToday: number };
  perQueue: QueueRow[];
  agents: Array<{ id: string; name: string; role: string; openAssigned: number }>;
  today: {
    firstResponseMedianMinutes: number | null;
    resolveMedianMinutes: number | null;
    csatAverage: number | null;
    csatResponses: number;
  };
}

export default function WallboardPage() {
  const [lang, setLang] = useConsoleLanguage();
  const me = useMe();
  const [data, setData] = useState<WallboardData | null>(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    const resp = await fetch("/api/wallboard");
    if (resp.status === 403) {
      setDenied(true);
      return;
    }
    if (resp.ok) setData((await resp.json()) as WallboardData);
  }, []);

  useEffect(() => {
    if (!me) return;
    void load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [me, load]);

  const big = (label: string, value: number | string | null, color: string) => (
    <div style={{ ...ui.card, flex: 1, minWidth: 150, textAlign: "center" }}>
      <div style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 10 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 52,
          fontWeight: 800,
          lineHeight: 1,
          color,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value ?? "—"}
      </div>
    </div>
  );

  return (
    <ConsoleShell lang={lang} onLang={setLang} me={me} active="wallboard">
      <header style={{ marginBottom: 20 }}>
        <h1 style={ui.h1}>{tUi(lang, "ui_nav_wallboard")}</h1>
      </header>

      {denied ? (
        <div style={ui.error}>403</div>
      ) : !data ? (
        <p style={{ color: colors.textSecondary }}>{tUi(lang, "ui_loading")}</p>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {big(tUi(lang, "ui_wb_open"), data.totals.open, colors.accent)}
            {big(tUi(lang, "ui_wb_new_today"), data.totals.newToday, colors.textPrimary)}
            {big(
              tUi(lang, "ui_wb_at_risk"),
              data.totals.atRisk,
              data.totals.atRisk > 0 ? colors.warn : colors.success,
            )}
            {big(
              tUi(lang, "ui_wb_breached"),
              data.totals.breached,
              data.totals.breached > 0 ? colors.danger : colors.success,
            )}
          </div>

          {/* ------------------------------------------------- queues */}
          <section style={{ ...ui.card, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
              <thead>
                <tr>
                  {[
                    tUi(lang, "ui_queue"),
                    tUi(lang, "ui_wb_open"),
                    tUi(lang, "ui_unassigned"),
                    tUi(lang, "ui_wb_at_risk"),
                    tUi(lang, "ui_wb_breached"),
                    tUi(lang, "ui_wb_oldest"),
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "start",
                        padding: "8px 12px",
                        color: colors.textSecondary,
                        fontSize: 13,
                        fontWeight: 600,
                        borderBottom: `1px solid ${colors.border}`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.perQueue
                  .filter((q) => q.queueId !== null || q.open > 0)
                  .map((q) => (
                    <tr key={q.queueId ?? "none"}>
                      <td style={{ padding: "10px 12px", color: colors.textPrimary, fontWeight: 600 }}>
                        {q.name ?? tUi(lang, "ui_no_queue")}
                      </td>
                      <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums" }}>
                        {q.open}
                      </td>
                      <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums" }}>
                        {q.unassigned}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {q.atRisk > 0 ? (
                          <Badge tone="warn">{q.atRisk}</Badge>
                        ) : (
                          <span style={{ color: colors.textMuted }}>0</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {q.breached > 0 ? (
                          <Badge tone="warn">{q.breached}</Badge>
                        ) : (
                          <span style={{ color: colors.textMuted }}>0</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px", color: colors.textSecondary }}>
                        {q.oldestWaitMinutes !== null
                          ? duration(q.oldestWaitMinutes * 60_000)
                          : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
            {/* ------------------------------------------- today medians */}
            <section style={{ ...ui.card, flex: "1 1 240px" }}>
              <h2 style={{ ...ui.h2, marginBottom: 14 }}>
                {tUi(lang, "ui_kpi_new_today")}
              </h2>
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, color: colors.textSecondary }}>
                    {tUi(lang, "ui_wb_median_fr")}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: colors.textPrimary }}>
                    {data.today.firstResponseMedianMinutes !== null
                      ? duration(data.today.firstResponseMedianMinutes * 60_000)
                      : "—"}
                  </div>
                </div>
                {/* Satisfaction always carries its denominator: "4.0" from
                    one reply and from ninety are different facts. */}
                <div>
                  <div style={{ fontSize: 13, color: colors.textSecondary }}>
                    {tUi(lang, "ui_wb_csat")}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: colors.textPrimary }}>
                    {data.today.csatAverage !== null ? `${data.today.csatAverage}/5` : "—"}
                  </div>
                  <div style={{ fontSize: 12, color: colors.textMuted }}>
                    {tUi(lang, "ui_csat_responses", { n: data.today.csatResponses ?? 0 })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: colors.textSecondary }}>
                    {tUi(lang, "ui_wb_median_res")}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: colors.textPrimary }}>
                    {data.today.resolveMedianMinutes !== null
                      ? duration(data.today.resolveMedianMinutes * 60_000)
                      : "—"}
                  </div>
                </div>
              </div>
            </section>

            {/* --------------------------------------------------- agents */}
            <section style={{ ...ui.card, flex: "2 1 320px" }}>
              <h2 style={{ ...ui.h2, marginBottom: 14 }}>{tUi(lang, "ui_wb_agents")}</h2>
              <div style={{ display: "grid", gap: 8 }}>
                {data.agents.map((a) => (
                  <div
                    key={a.id}
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: colors.surfaceHover,
                        color: colors.textBody,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {a.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span style={{ flex: 1, color: colors.textBody, fontSize: 14 }}>
                      {a.name}
                    </span>
                    <Badge tone={a.openAssigned > 0 ? "info" : "muted"}>
                      {a.openAssigned}
                    </Badge>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </ConsoleShell>
  );
}
