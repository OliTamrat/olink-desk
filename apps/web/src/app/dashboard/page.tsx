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
import { LIFECYCLE_INK } from "../../lib/theme";

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
        // view=all, explicitly: the bare endpoint defaults to the OPEN view,
        // which quietly made every derived number on this page a number
        // about open tickets only — "Resolved today" was permanently 0, the
        // Done drill-down was permanently empty, and the channel bars forgot
        // a ticket the moment it was solved.
        fetch("/api/tickets?view=all"),
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
  // Resolved today closes the loop the other three tiles open: open work,
  // new work, work owed a reply — and what actually got finished. A desk
  // whose first three numbers only ever grow reads as a treadmill.
  const resolvedToday = (tickets ?? []).filter(
    (t) =>
      ["RESOLVED", "CLOSED"].includes(t.status) &&
      new Date(t.updatedAt) >= todayStart,
  );
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
    // fullBleed, and effectively uncapped: the shell's 1440 is right for work
    // screens, but the founder circled the voids on both sides of a centred
    // dashboard and the complaint was the emptiness itself — so the overview
    // fills the display the way the wallboard does. 2400 is not a layout, it
    // is a fuse for ultrawide monitors, where a status bar three monitors of
    // glass wide stops being readable; no ordinary screen ever reaches it.
    <ConsoleShell lang={lang} onLang={setLang} me={me} active="dashboard" fullBleed>
      <style dangerouslySetInnerHTML={{ __html: dashCss }} />
      <div style={{ maxWidth: 2400, margin: "0 auto", width: "100%" }}>
      <header style={{ marginBottom: 22 }}>
        <h1 style={ui.h1}>{tUi(lang, "ui_nav_dashboard")}</h1>
        {me ? (
          <p style={ui.sub}>
            {tUi(lang, "ui_channels_subtitle", { org: me.organization.name })}
          </p>
        ) : null}
      </header>

      <div className="dash-zones">
      <div className="dash-main">
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
        {tile(
          tUi(lang, "ui_kpi_resolved_today"),
          tickets ? resolvedToday.length : null,
          LIFECYCLE_INK.DONE,
          "/inbox?view=solved",
          <svg width="20" height="20" viewBox="0 0 24 24" {...glyph}>
            <path d="M20 6 9 17l-5-5" />
          </svg>,
        )}
      </div>

      {/* The lifecycle overview: it is the shape of the whole desk, and the
          channel card under it is a detail of one corner. */}
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

      </div>

        {/* ────────────────────────────────────────────── the activity rail

            Deliberately NOT another card. The left zone is analysis — boxed,
            shadowed, computed; this column is the live feed, so it sits
            directly on the page with hairline rows and its own header, the
            way every desk product separates "numbers" from "what is
            happening". Two zones that look the same read as one wide mess;
            two zones with different textures read as a layout. */}
        <aside className="dash-side">
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 6,
              paddingBottom: 10,
              borderBottom: `2px solid ${colors.borderStrong}`,
            }}
          >
            <h2 style={ui.h2}>{tUi(lang, "ui_recent_tickets")}</h2>
            <Link
              href="/inbox?view=all"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: colors.accent,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              {tUi(lang, "ui_overview_see_all", {
                n: counts
                  ? Object.values(counts).reduce((a, b) => a + b, 0)
                  : (tickets ?? []).length,
              })} →
            </Link>
          </div>
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
            // minmax(0,1fr): a bare implicit track sizes to the widest
            // row's max-content — the full nowrap subject — and an auto track
            // may overflow its grid. This exact wrapper is what pushed the
            // whole dashboard 56px off the right of a 1440px screen.
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)" }}>
              {(tickets ?? []).slice(0, 10).map((t) => (
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
                    padding: "11px 4px",
                    textDecoration: "none",
                    borderBottom: `1px solid ${colors.border}`,
                  }}
                >
                  {/* Two lines, not one: in a 320–400px rail a single line
                      split between number, subject, badge and age left the
                      subject about fifteen characters — the one part a person
                      actually reads. The subject gets the full width; the
                      metadata goes underneath. */}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: colors.textBody,
                        fontSize: 14,
                        fontWeight: 500,
                      }}
                    >
                      {/* Subject first — it is the customer's own opening
                          words. messages[0] is the NEWEST message, which on a
                          fresh ticket is our own auto-acknowledgement, so
                          preferring it previewed the desk talking to itself. */}
                      {t.subject ?? t.messages[0]?.body ?? ""}
                    </span>
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 4,
                        fontSize: 12,
                        color: colors.textMuted,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      <span>#{t.number}</span>
                      <Badge tone={t.status === "NEW" ? "info" : t.status === "PENDING" ? "warn" : t.status === "OPEN" ? "success" : "muted"}>
                        {tUi(lang, statusKey(t.status))}
                      </Badge>
                      <span style={{ marginInlineStart: "auto" }}>{timeAgo(t.updatedAt)}</span>
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </aside>
      </div>
      </div>
    </ConsoleShell>
  );
}

/**
 * The two zones, as classes, because inline styles cannot express the media
 * query. One breakpoint only: below it the rail stacks under the analysis
 * column in source order, which is also reading order.
 *
 * `minmax(0, 1fr)` on the main track for the same reason as the row grids —
 * a plain 1fr is minmax(auto, 1fr), and `auto` lets a wide child (the status
 * bar, a long macro name) push the track instead of shrinking into it.
 */
const dashCss = `
.dash-zones { display: grid; grid-template-columns: minmax(0, 1fr); gap: 24px; align-items: start; }
.dash-side { min-width: 0; }
@media (min-width: 1280px) {
  .dash-zones { grid-template-columns: minmax(0, 1fr) minmax(320px, 400px); }
}
@media (min-width: 1900px) {
  /* The rail earns more of a big display than a phone-width strip: wider
     rows stop truncating Amharic subjects, and the analysis column keeps a
     measure a person can actually sweep. */
  .dash-zones { grid-template-columns: minmax(0, 1fr) minmax(400px, 520px); gap: 32px; }
}
@media (min-width: 1280px) {
  /* The feed follows its reader down a long page: analysis scrolls, the live
     column stays. 80px = the 56px bar plus the page's own top padding. */
  .dash-side { position: sticky; top: 80px; }
}
`;
