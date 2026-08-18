"use client";
// The overview: today's numbers and the freshest tickets, computed from the
// same tenant-scoped tickets API the inbox reads — one source of truth, so
// the tiles can never disagree with the list under them.
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import {
  Badge,
  colors,
  ConsoleShell,
  tUi,
  ui,
  useConsoleLanguage,
  useMe,
} from "../../lib/console-ui";
import { CHANNEL_LABELS, statusKey, timeAgo, type TicketRow } from "../../lib/tickets";
import {
  IconTile,
  StatusDrilldown,
  StatusOverview,
} from "../../lib/status-overview";
import { composition, type LifecycleKey } from "@olink-desk/reports";

const glyph = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

interface SetupStep {
  key: string;
  done: boolean;
  href: string;
}
interface SetupState {
  steps: SetupStep[];
  complete: boolean;
  dismissed: boolean;
  canDismiss: boolean;
}

export default function DashboardPage() {
  const [lang, setLang] = useConsoleLanguage();
  const me = useMe();
  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [drill, setDrill] = useState<LifecycleKey | null>(null);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    const load = async () => {
      const [list, counted] = await Promise.all([
        fetch("/api/tickets"),
        // The overview counts the WHOLE workspace, not the page of tickets
        // the list happens to return — a share computed from a truncated list
        // is a wrong number that looks right.
        fetch("/api/tickets/counts"),
      ]);
      if (list.ok && !cancelled) {
        const body = (await list.json()) as { tickets: TicketRow[] };
        setTickets(body.tickets);
      }
      if (counted.ok && !cancelled) {
        const body = (await counted.json()) as { byStatus?: Record<string, number> };
        setCounts(body.byStatus ?? {});
      }
    };
    void load();
    // The checklist reads real workspace state, so it is refreshed with the
    // tiles rather than cached: connecting a channel in another tab should
    // tick a step here without a reload.
    void (async () => {
      const resp = await fetch("/api/onboarding");
      if (resp.ok && !cancelled) setSetup((await resp.json()) as SetupState);
    })();
    const timer = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [me]);

  const open = (tickets ?? []).filter((t) =>
    ["NEW", "OPEN", "PENDING"].includes(t.status),
  );
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const newToday = (tickets ?? []).filter(
    (t) => new Date(t.createdAt) >= todayStart,
  );
  const awaiting = open.filter((t) => !t.firstRespondedAt);
  const byChannel = new Map<string, number>();
  for (const t of tickets ?? []) {
    byChannel.set(t.channel, (byChannel.get(t.channel) ?? 0) + 1);
  }
  const maxChannel = Math.max(1, ...byChannel.values());

  // Drill-down: a number on a dashboard is a question ("which five?"), and
  // the only useful answer is the list itself. Every tile carries the filter
  // that produced it, so the count and the list can never disagree.
  // The Onekof tile proportions: an icon tile at the top, then a large
  // number, then a small label UNDER it. The label used to sit above the
  // number, which reads as a caption looking for its picture; below, the
  // number is the thing and the label names it.
  const tile = (
    label: string,
    value: number | null,
    accent: string | undefined,
    href: string,
    icon: ReactNode,
  ) => (
    <Link
      href={href}
      style={{ ...ui.card, textDecoration: "none", display: "block", padding: 18 }}
    >
      <IconTile tint={accent}>{icon}</IconTile>
      <div
        style={{
          fontSize: 34,
          fontWeight: 700,
          // Same reason as the page title: at display size Inter's default
          // tracking is loose, and a number is the one thing on a dashboard
          // somebody reads at a glance from across a desk.
          letterSpacing: "-.02em",
          color: colors.textPrimary,
          lineHeight: 1,
          marginTop: 16,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value ?? "—"}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: colors.textSecondary, marginTop: 8 }}>
        {label}
      </div>
    </Link>
  );

  return (
    <ConsoleShell lang={lang} onLang={setLang} me={me} active="dashboard">
      <header style={{ marginBottom: 22 }}>
        <h1 style={ui.h1}>{tUi(lang, "ui_nav_dashboard")}</h1>
        {me ? (
          <p style={ui.sub}>
            {tUi(lang, "ui_channels_subtitle", { org: me.organization.name })}
          </p>
        ) : null}
      </header>

      {/* The setup checklist. Every step is derived from real workspace data
          by /api/onboarding — there is no "mark as done" anywhere, so it
          cannot claim a desk is configured when it is not. It sits ABOVE the
          tiles because on a new workspace the tiles are all zero and this is
          the only thing on the page worth reading. */}
      {setup && !setup.dismissed && !setup.complete ? (
        <section style={{ ...ui.card, marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 14,
            }}
          >
            <div>
              <h2 style={ui.h2}>{tUi(lang, "ui_setup_title")}</h2>
              <p style={{ ...ui.sub, fontSize: 13 }}>
                {tUi(lang, "ui_setup_progress", {
                  done: setup.steps.filter((x) => x.done).length,
                  total: setup.steps.length,
                })}
              </p>
            </div>
            {setup.canDismiss ? (
              <button
                style={{ ...ui.buttonGhost, fontSize: 12, padding: "6px 12px" }}
                onClick={async () => {
                  await fetch("/api/onboarding", { method: "POST" });
                  setSetup({ ...setup, dismissed: true });
                }}
              >
                {tUi(lang, "ui_setup_dismiss")}
              </button>
            ) : null}
          </div>

          {/* A thin progress rail rather than a percentage: five steps is a
              short enough list that a number adds nothing a glance does not. */}
          <div
            style={{
              height: 3,
              borderRadius: 999,
              background: colors.border,
              overflow: "hidden",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(setup.steps.filter((x) => x.done).length / setup.steps.length) * 100}%`,
                background: colors.accent,
              }}
            />
          </div>

          <div style={{ display: "grid", gap: 4 }}>
            {setup.steps.map((step) => (
              <Link
                key={step.key}
                href={step.href}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "10px 8px",
                  borderRadius: 8,
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    flexShrink: 0,
                    width: 18,
                    height: 18,
                    marginTop: 1,
                    borderRadius: "50%",
                    border: `1.5px solid ${step.done ? colors.success : colors.borderStrong}`,
                    background: step.done ? colors.success : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {step.done ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                      stroke={colors.bg} strokeWidth="3.5" strokeLinecap="round"
                      strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  ) : null}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 14,
                      fontWeight: 600,
                      color: step.done ? colors.textMuted : colors.textPrimary,
                      textDecoration: step.done ? "line-through" : "none",
                    }}
                  >
                    {tUi(lang, `ui_step_${step.key}`)}
                  </span>
                  {/* The reason stays visible on a done step too: it is the
                      part that teaches, and hiding it turns the finished list
                      into a row of ticks that explain nothing. */}
                  <span
                    style={{
                      display: "block",
                      fontSize: 12.5,
                      color: colors.textMuted,
                      marginTop: 2,
                    }}
                  >
                    {tUi(lang, `ui_step_${step.key}_why`)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* GRID, not wrapping flex. With `flex: 1` and wrap, the last row
          stretches its survivors to full width — so three tiles on one line
          and one on the next gives a lone tile four times the size of its
          neighbours. `auto-fit` + `minmax` reflows to an even grid at every
          width instead. */}
      <div
        style={{
          display: "grid",
          // 150px, not 210: at 390px minus the page gutters, 210 fits ONE
          // column, so four glanceable numbers became a scroll. 150 gives the
          // 2×2 the reference uses on a phone and still reflows to a row of
          // four on a desk.
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 16,
          marginBottom: 16,
        }}
      >
        {tile(
          tUi(lang, "ui_kpi_open"),
          tickets ? open.length : null,
          colors.accent,
          "/inbox?view=open",
          <svg width="20" height="20" viewBox="0 0 24 24" {...glyph}>
            <path d="M22 12h-6l-2 3h-4l-2-3H2" />
            <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          </svg>,
        )}
        {tile(
          tUi(lang, "ui_kpi_new_today"),
          tickets ? newToday.length : null,
          colors.success,
          "/inbox?view=all&status=NEW",
          <svg width="20" height="20" viewBox="0 0 24 24" {...glyph}>
            <path d="M12 5v14M5 12h14" />
          </svg>,
        )}
        {tile(
          tUi(lang, "ui_kpi_awaiting"),
          tickets ? awaiting.length : null,
          awaiting.length > 0 ? colors.warn : colors.success,
          "/inbox?view=open&awaiting=1",
          <svg width="20" height="20" viewBox="0 0 24 24" {...glyph}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>,
        )}
      </div>

      {/* `alignItems: flex-start` let these two find their own heights, so
          their bottom edges never lined up and the pair read as two loose
          cards rather than a row. Stretched, they end level. The 1:1.6 split
          gives the recent-ticket list the room its lines actually need while
          keeping the channel bars wide enough to compare. */}
      {/* The lifecycle overview, above the two panels: it is the shape of the
          whole desk, and the panels under it are details of one corner. */}
      {counts ? (
        <div style={{ display: "grid", gap: 16, marginBottom: 16 }}>
          <StatusOverview
            lang={lang}
            counts={counts}
            selected={drill}
            onSelect={setDrill}
            t={(k, p) => tUi(lang, k, p)}
          />
          {drill
            ? (() => {
                const slice = composition(counts).slices.find((s) => s.key === drill);
                if (!slice) return null;
                const inSlice = (t: TicketRow) =>
                  drill === "DONE"
                    ? ["RESOLVED", "CLOSED"].includes(t.status)
                    : t.status === drill;
                return (
                  <StatusDrilldown
                    t={(k, p) => tUi(lang, k, p)}
                    slice={slice}
                    rows={(tickets ?? []).filter(inSlice).slice(0, 6)}
                    onClear={() => setDrill(null)}
                  />
                );
              })()
            : null}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 16,
          alignItems: "stretch",
        }}
      >
        {/* A floor on the height, so a card that is LOADING still has the
            shape of a card. Without it the first paint is two title strips
            with nothing under them, which reads as a broken page rather than
            as one still fetching — and it is the first thing anybody sees. */}
        <section style={{ ...ui.card, display: "flex", flexDirection: "column", minHeight: 200 }}>
          <h2 style={{ ...ui.h2, marginBottom: 14 }}>{tUi(lang, "ui_by_channel")}</h2>
          {tickets && byChannel.size === 0 ? (
            // Centred in the remaining space rather than clinging to the
            // heading: an empty card that collapses to a title strip is what
            // made this row read as broken rather than as new.
            <p
              style={{
                margin: 0,
                flex: 1,
                display: "grid",
                placeItems: "center",
                minHeight: 120,
                color: colors.textMuted,
                fontSize: 13,
              }}
            >
              {tUi(lang, "ui_no_tickets")}
            </p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {[...byChannel.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([channel, count]) => (
                  // Each bar drills into the tickets that channel produced.
                  <Link
                    key={channel}
                    href={`/inbox?view=all&channel=${channel}`}
                    style={{ display: "block", textDecoration: "none" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 13,
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ color: colors.textBody }}>
                        {CHANNEL_LABELS[channel] ?? channel}
                      </span>
                      <span style={{ color: colors.textSecondary, fontVariantNumeric: "tabular-nums" }}>
                        {count}
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
                          width: `${(count / maxChannel) * 100}%`,
                          height: "100%",
                          borderRadius: 999,
                          background: colors.accent,
                        }}
                      />
                    </div>
                  </Link>
                ))}
            </div>
          )}
        </section>

        <section
          style={{
            ...ui.card,
            display: "flex",
            flexDirection: "column",
            minHeight: 200,
          }}
        >
          <h2 style={{ ...ui.h2, marginBottom: 14 }}>{tUi(lang, "ui_recent_tickets")}</h2>
          {tickets && tickets.length === 0 ? (
            <p
              style={{
                margin: 0,
                flex: 1,
                display: "grid",
                placeItems: "center",
                minHeight: 120,
                textAlign: "center",
                color: colors.textMuted,
                fontSize: 13,
              }}
            >
              {tUi(lang, "ui_no_tickets")}{" "}
              <Link href="/channels" style={{ color: colors.accent }}>
                {tUi(lang, "ui_channels_title")} →
              </Link>
            </p>
          ) : (
            <div style={{ display: "grid" }}>
              {(tickets ?? []).slice(0, 8).map((t, i) => (
                <Link
                  key={t.id}
                  // Drills to THIS ticket, not the inbox in general: landing
                  // an agent on a list to find the row they just clicked is
                  // the drill-down not happening.
                  href={`/inbox?view=all&ticket=${t.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 4px",
                    textDecoration: "none",
                    borderTop: i === 0 ? "none" : `1px solid ${colors.border}`,
                  }}
                >
                  <span
                    style={{
                      color: colors.textMuted,
                      fontSize: 13,
                      fontVariantNumeric: "tabular-nums",
                      width: 44,
                    }}
                  >
                    #{t.number}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: colors.textBody,
                      fontSize: 14,
                    }}
                  >
                    {/* Subject first — it is the customer's own opening
                        words. messages[0] is the NEWEST message, which on a
                        fresh ticket is our own auto-acknowledgement, so
                        preferring it previewed the desk talking to itself.
                        Same bug the inbox list had; this surface was missed. */}
                    {t.subject ?? t.messages[0]?.body ?? ""}
                  </span>
                  {/* `flexShrink: 0` on both, or the flex line squeezes them
                      to nothing on a phone and the status badge is clipped
                      mid-word. It produced no document overflow — the text was
                      cut off INSIDE the row — so only looking at it found it. */}
                  <span style={{ flexShrink: 0 }}>
                    <Badge tone={t.status === "NEW" ? "info" : t.status === "PENDING" ? "warn" : t.status === "OPEN" ? "success" : "muted"}>
                      {tUi(lang, statusKey(t.status))}
                    </Badge>
                  </span>
                  <span
                    style={{
                      color: colors.textMuted,
                      fontSize: 12,
                      width: 60,
                      flexShrink: 0,
                      textAlign: "right",
                    }}
                  >
                    {timeAgo(t.updatedAt)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </ConsoleShell>
  );
}
