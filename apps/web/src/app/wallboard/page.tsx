"use client";
// The supervisor wallboard — built for a TV or second monitor: big numbers,
// live colors, no interaction needed. Breach state is derived server-side
// from the stored SLA due dates on every poll (10s), so what the room sees
// is never stale.
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import {
  Badge,
  colors,
  ConsoleShell,
  tUi,
  ui,
  useConsoleLanguage,
  useMe,
} from "../../lib/console-ui";
import { cardColumn, cardFooter, CardHead, EmptyState, Figure, IconTile, stroke } from "../../lib/card";
import { duration } from "../../lib/tickets";
import { radius } from "../../lib/theme";

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

  // Every headline number drills into exactly the tickets behind it. On a
  // wallboard this matters more than anywhere else: the screen exists to make
  // somebody act, and "12 breached" that cannot be opened is just anxiety.
  // A queue row's filter. `none` is the unrouted bucket, and it must be a
  // real filter rather than "no queue param" — otherwise the unrouted row
  // opens every ticket in the workspace.
  const qHref = (queueId: string | null) =>
    `/inbox?view=open&queue=${queueId ?? "none"}`;
  const cellLink = {
    color: "inherit",
    textDecoration: "none",
    display: "block",
  } as const;

  // The same tile proportions as the dashboard: an icon tile, then the number,
  // then a small label UNDER it. The label used to sit above a centred figure,
  // which reads as a caption looking for its picture — and made four tiles in a
  // row look like four unrelated boxes rather than one instrument panel.
  const big = (
    label: string,
    value: number | string | null,
    color: string,
    href: string,
    icon: ReactNode,
  ) => (
    <Link
      href={href}
      style={{
        ...ui.card,
        padding: 18,
        textDecoration: "none",
        display: "block",
      }}
    >
      <IconTile tint={color}>{icon}</IconTile>
      <div
        style={{
          fontSize: 46,
          fontWeight: 800,
          lineHeight: 1,
          marginTop: 14,
          color,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value ?? "—"}
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: ".07em",
          textTransform: "uppercase",
          color: colors.textSecondary,
          marginTop: 8,
        }}
      >
        {label}
      </div>
    </Link>
  );

  return (
    <ConsoleShell lang={lang} onLang={setLang} me={me} active="wallboard" fullBleed>
      <header style={{ marginBottom: 20 }}>
        <h1 style={ui.h1}>{tUi(lang, "ui_nav_wallboard")}</h1>
      </header>

      {denied ? (
        <div style={ui.error}>403</div>
      ) : !data ? (
        <p style={{ color: colors.textSecondary }}>{tUi(lang, "ui_loading")}</p>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 16,
            // Sections size to their CONTENT. The previous version stretched
            // the queue row to `1fr` so the board would fill a television —
            // which on a quiet desk inflated a one-line panel into a 300px
            // void, and made the screen look emptier than leaving it short
            // ever did. A wallboard earns its size with type scale and
            // spacing, not by pulling empty boxes taller.
            alignContent: "start",
          }}
        >
          {/* The headline, when there is one. Four zeros in a row is not a
              status, it is the absence of one — and on a black screen it
              reads as a broken panel rather than as a calm desk. This says
              the good news in words, once, above the numbers. */}
          {data.totals.breached === 0 && data.totals.atRisk === 0 ? (
            <div
              data-wallboard-calm
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 18px",
                borderRadius: radius.lg,
                background: colors.successBg,
                border: `1px solid ${colors.successFaint}`,
                color: colors.success,
                fontSize: 17,
                fontWeight: 600,
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              {data.totals.open === 0
                ? tUi(lang, "ui_wb_all_clear")
                : tUi(lang, "ui_wb_on_time", { n: data.totals.open })}
            </div>
          ) : null}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: 16,
            }}
          >
            {big(
              tUi(lang, "ui_wb_open"),
              data.totals.open,
              colors.accent,
              "/inbox?view=open",
              <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
              </svg>,
            )}
            {big(
              tUi(lang, "ui_wb_new_today"),
              data.totals.newToday,
              colors.textPrimary,
              "/inbox?view=all&status=NEW",
              <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
                <path d="M12 5v14M5 12h14" />
              </svg>,
            )}
            {big(
              tUi(lang, "ui_wb_at_risk"),
              data.totals.atRisk,
              data.totals.atRisk > 0 ? colors.warn : colors.success,
              "/inbox?view=open&sla=at_risk",
              <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>,
            )}
            {big(
              tUi(lang, "ui_wb_breached"),
              data.totals.breached,
              data.totals.breached > 0 ? colors.danger : colors.success,
              "/inbox?view=open&sla=breached",
              <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
                <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                <path d="M12 9v4M12 17h.01" />
              </svg>,
            )}
          </div>

          {/* ------------------------------------------------- queues */}
          <section style={{ ...ui.card, overflowX: "auto", padding: 0 }}>
            {data.perQueue.filter((q) => q.queueId !== null || q.open > 0).length === 0 ? (
              // A header row with nothing beneath it is the shape of a broken
              // table — and one muted line at the top-left of a tall box is the
              // shape of a panel that failed to load. Centred, with a glyph and
              // room around it, the same emptiness reads as a choice.
              <EmptyState
                data-wallboard-noqueues="1"
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
                    <path d="M3 6h18M3 12h18M3 18h18" />
                  </svg>
                }
                title={tUi(lang, "ui_wb_no_queues")}
                hint={tUi(lang, "ui_wb_no_queues_hint")}
              />
            ) : (
              <div style={{ padding: 8 }}>

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
                      {/* Each cell drills to its OWN slice. Linking the whole
                          row to one filter would make four different numbers
                          open the same list, which teaches an agent that the
                          numbers are decoration. */}
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                        <Link href={qHref(q.queueId)} style={cellLink}>
                          {q.name ?? tUi(lang, "ui_no_queue")}
                        </Link>
                      </td>
                      <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums" }}>
                        <Link href={qHref(q.queueId)} style={cellLink}>
                          {q.open}
                        </Link>
                      </td>
                      <td style={{ padding: "10px 12px", fontVariantNumeric: "tabular-nums" }}>
                        <Link href={`${qHref(q.queueId)}&assignee=none`} style={cellLink}>
                          {q.unassigned}
                        </Link>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <Link href={`${qHref(q.queueId)}&sla=at_risk`} style={cellLink}>
                          {q.atRisk > 0 ? (
                            <Badge tone="warn">{q.atRisk}</Badge>
                          ) : (
                            <span style={{ color: colors.textMuted }}>0</span>
                          )}
                        </Link>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <Link href={`${qHref(q.queueId)}&sla=breached`} style={cellLink}>
                          {q.breached > 0 ? (
                            <Badge tone="warn">{q.breached}</Badge>
                          ) : (
                            <span style={{ color: colors.textMuted }}>0</span>
                          )}
                        </Link>
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
              </div>
            )}
          </section>

          {/* `stretch`, not `flex-start`. Two cards of different heights
              sitting side by side is the "cards are not aligned" the founder
              pointed at — and it is invisible to every check that reads their
              contents rather than their boxes. */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "stretch" }}>
            {/* ------------------------------------------- today medians */}
            <section style={{ ...ui.card, flex: "1 1 260px" }}>
              <CardHead
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                }
                title={tUi(lang, "ui_wb_today")}
                blurb={tUi(lang, "ui_wb_today_blurb")}
              />
              {/* Three stacked em-dashes is what a broken panel looks like. A
                  quiet desk has produced no medians yet, which is a different
                  fact and deserves the words for it — `Figure` is where that
                  distinction lives so no screen has to remember it. */}
              <div style={{ display: "grid", gap: 14 }}>
                <Figure
                  label={tUi(lang, "ui_wb_median_fr")}
                  empty={tUi(lang, "ui_wb_nothing_yet")}
                  value={
                    data.today.firstResponseMedianMinutes !== null
                      ? duration(data.today.firstResponseMedianMinutes * 60_000)
                      : null
                  }
                />
                {/* Satisfaction always carries its denominator: "4.0" from
                    one reply and from ninety are different facts. */}
                <Figure
                  label={tUi(lang, "ui_wb_csat")}
                  empty={tUi(lang, "ui_wb_nothing_yet")}
                  value={data.today.csatAverage !== null ? `${data.today.csatAverage}/5` : null}
                  note={
                    data.today.csatAverage !== null
                      ? tUi(lang, "ui_csat_responses", { n: data.today.csatResponses ?? 0 })
                      : undefined
                  }
                />
                <Figure
                  label={tUi(lang, "ui_wb_median_res")}
                  empty={tUi(lang, "ui_wb_nothing_yet")}
                  value={
                    data.today.resolveMedianMinutes !== null
                      ? duration(data.today.resolveMedianMinutes * 60_000)
                      : null
                  }
                />
              </div>
            </section>

            {/* --------------------------------------------------- agents */}
            <section style={{ ...ui.card, ...cardColumn, flex: "2 1 320px" }}>
              <CardHead
                icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
                  </svg>
                }
                title={tUi(lang, "ui_wb_agents")}
                blurb={tUi(lang, "ui_wb_agents_blurb")}
              />
              <div style={{ display: "grid", gap: 2 }}>
                {data.agents.map((a) => (
                  // Drills to that person's open work — the question a
                  // supervisor is asking when they read this list.
                  <Link
                    key={a.id}
                    href={`/inbox?view=open&assignee=${a.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      textDecoration: "none",
                      color: "inherit",
                      padding: "7px 0",
                      borderTop: `1px solid ${colors.border}`,
                    }}
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
                  </Link>
                ))}
              </div>
              {/* Pinned to the bottom, which is what fills the card once it is
                  stretched to match its neighbour — and it is the action a
                  supervisor looking at a one-name list actually wants. */}
              {me && ["ADMIN", "SUPERVISOR"].includes(me.user.role) ? (
                <div style={cardFooter}>
                  <Link
                    href="/settings"
                    style={{
                      color: colors.accent,
                      textDecoration: "none",
                      fontSize: 13.5,
                      fontWeight: 600,
                    }}
                  >
                    {tUi(lang, "ui_invite_teammate")} →
                  </Link>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      )}
    </ConsoleShell>
  );
}
