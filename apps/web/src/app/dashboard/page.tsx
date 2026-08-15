"use client";
// The overview: today's numbers and the freshest tickets, computed from the
// same tenant-scoped tickets API the inbox reads — one source of truth, so
// the tiles can never disagree with the list under them.
import Link from "next/link";
import { useEffect, useState } from "react";

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

export default function DashboardPage() {
  const [lang, setLang] = useConsoleLanguage();
  const me = useMe();
  const [tickets, setTickets] = useState<TicketRow[] | null>(null);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    const load = async () => {
      const resp = await fetch("/api/tickets");
      if (resp.ok && !cancelled) {
        const body = (await resp.json()) as { tickets: TicketRow[] };
        setTickets(body.tickets);
      }
    };
    void load();
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

  const tile = (label: string, value: number | null, accent?: string) => (
    <div style={{ ...ui.card, flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 8 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 34,
          fontWeight: 700,
          color: accent ?? colors.textPrimary,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value ?? "—"}
      </div>
    </div>
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

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        {tile(tUi(lang, "ui_kpi_open"), tickets ? open.length : null, colors.accent)}
        {tile(tUi(lang, "ui_kpi_new_today"), tickets ? newToday.length : null)}
        {tile(
          tUi(lang, "ui_kpi_awaiting"),
          tickets ? awaiting.length : null,
          awaiting.length > 0 ? colors.warn : colors.success,
        )}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <section style={{ ...ui.card, flex: "1 1 260px" }}>
          <h2 style={{ ...ui.h2, marginBottom: 14 }}>{tUi(lang, "ui_by_channel")}</h2>
          {tickets && byChannel.size === 0 ? (
            <p style={{ margin: 0, color: colors.textMuted, fontSize: 13 }}>
              {tUi(lang, "ui_no_tickets")}
            </p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {[...byChannel.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([channel, count]) => (
                  <div key={channel}>
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
                  </div>
                ))}
            </div>
          )}
        </section>

        <section style={{ ...ui.card, flex: "2 1 380px" }}>
          <h2 style={{ ...ui.h2, marginBottom: 14 }}>{tUi(lang, "ui_recent_tickets")}</h2>
          {tickets && tickets.length === 0 ? (
            <p style={{ margin: 0, color: colors.textMuted, fontSize: 13 }}>
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
                  href="/inbox"
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
                    {t.messages[0]?.body ?? t.subject ?? ""}
                  </span>
                  <Badge tone={t.status === "NEW" ? "info" : t.status === "PENDING" ? "warn" : t.status === "OPEN" ? "success" : "muted"}>
                    {tUi(lang, statusKey(t.status))}
                  </Badge>
                  <span style={{ color: colors.textMuted, fontSize: 12, width: 60, textAlign: "right" }}>
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
