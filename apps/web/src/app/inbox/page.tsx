"use client";
// The inbox: ticket list on the left, the selected ticket's timeline and
// reply box on the right. A reply goes out on the ticket's own channel via
// POST /api/tickets/[id]/reply — the outbound path that already existed.
import { useCallback, useEffect, useState } from "react";

import {
  Badge,
  colors,
  ConsoleShell,
  tUi,
  ui,
  useConsoleLanguage,
  useIsMobile,
  useMe,
} from "../../lib/console-ui";
import {
  CHANNEL_LABELS,
  statusKey,
  timeAgo,
  type TicketDetail,
  type TicketRow,
} from "../../lib/tickets";

const FILTERS = ["ALL", "NEW", "OPEN", "PENDING", "RESOLVED", "CLOSED"] as const;

export default function InboxPage() {
  const [lang, setLang] = useConsoleLanguage();
  const me = useMe();
  const isMobile = useIsMobile();
  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const q = filter === "ALL" ? "" : `?status=${filter}`;
    const resp = await fetch(`/api/tickets${q}`);
    if (resp.ok) {
      const body = (await resp.json()) as { tickets: TicketRow[] };
      setTickets(body.tickets);
    }
  }, [filter]);

  useEffect(() => {
    if (!me) return;
    void loadList();
    const timer = setInterval(loadList, 20_000);
    return () => clearInterval(timer);
  }, [me, loadList]);

  const loadDetail = useCallback(async (id: string) => {
    const resp = await fetch(`/api/tickets/${id}`);
    if (resp.ok) {
      const body = (await resp.json()) as { ticket: TicketDetail };
      setDetail(body.ticket);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  async function sendReply() {
    if (!selectedId || !reply.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const resp = await fetch(`/api/tickets/${selectedId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply.trim() }),
      });
      if (resp.ok) {
        setReply("");
        await Promise.all([loadDetail(selectedId), loadList()]);
      } else {
        const body = (await resp.json().catch(() => null)) as
          | { error?: string }
          | null;
        setSendError(
          tUi(lang, "ui_reply_failed", { error: body?.error ?? `HTTP ${resp.status}` }),
        );
      }
    } catch (err) {
      setSendError(tUi(lang, "ui_reply_failed", { error: String(err) }));
    } finally {
      setSending(false);
    }
  }

  const statusTone = (s: string) =>
    s === "NEW" ? "info" : s === "PENDING" ? "warn" : s === "OPEN" ? "success" : "muted";

  return (
    <ConsoleShell lang={lang} onLang={setLang} me={me} active="inbox">
      <header style={{ marginBottom: 18 }}>
        <h1 style={ui.h1}>{tUi(lang, "ui_nav_inbox")}</h1>
      </header>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              ...ui.buttonGhost,
              padding: "6px 12px",
              fontSize: 13,
              borderColor: filter === f ? colors.accent : colors.border,
              color: filter === f ? colors.textPrimary : colors.textSecondary,
              background: filter === f ? colors.surfaceHover : "transparent",
            }}
          >
            {f === "ALL" ? tUi(lang, "ui_all") : tUi(lang, statusKey(f))}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "stretch",
          minHeight: isMobile ? 0 : 480,
        }}
      >
        {/* ------------------------------------------------ ticket list
            (on mobile: hidden while a ticket is open) */}
        <div
          style={{
            ...ui.card,
            padding: 8,
            flex: isMobile ? "1 1 auto" : "0 0 320px",
            maxHeight: "72vh",
            overflowY: "auto",
            display: isMobile && selectedId ? "none" : "block",
            minWidth: 0,
          }}
        >
          {tickets && tickets.length === 0 ? (
            <p style={{ margin: 12, color: colors.textMuted, fontSize: 13 }}>
              {filter === "ALL" ? tUi(lang, "ui_no_tickets") : tUi(lang, "ui_inbox_empty")}
            </p>
          ) : (
            (tickets ?? []).map((t) => {
              const selected = t.id === selectedId;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "start",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "none",
                    cursor: "pointer",
                    background: selected ? colors.surfaceHover : "transparent",
                    fontFamily: "inherit",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontSize: 13, color: colors.textSecondary, fontVariantNumeric: "tabular-nums" }}>
                      #{t.number} · {CHANNEL_LABELS[t.channel] ?? t.channel}
                    </span>
                    <span style={{ fontSize: 12, color: colors.textMuted }}>
                      {timeAgo(t.updatedAt)}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: colors.textBody,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      marginBottom: 6,
                    }}
                  >
                    {t.messages[0]?.body ?? t.subject ?? ""}
                  </div>
                  <Badge tone={statusTone(t.status)}>{tUi(lang, statusKey(t.status))}</Badge>
                </button>
              );
            })
          )}
        </div>

        {/* --------------------------------------------- timeline + reply
            (on mobile: the only pane while a ticket is open) */}
        <div
          style={{
            ...ui.card,
            flex: 1,
            minWidth: 0,
            display: isMobile && !selectedId ? "none" : "flex",
            flexDirection: "column",
            maxHeight: "72vh",
            padding: isMobile ? 14 : 22,
          }}
        >
          {!detail ? (
            <p style={{ margin: "auto", color: colors.textMuted, fontSize: 14 }}>
              {tUi(lang, "ui_select_ticket")}
            </p>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  paddingBottom: 12,
                  borderBottom: `1px solid ${colors.border}`,
                  flexWrap: "wrap",
                }}
              >
                {isMobile ? (
                  <button
                    onClick={() => setSelectedId(null)}
                    style={{ ...ui.buttonGhost, padding: "6px 10px" }}
                  >
                    ← {tUi(lang, "ui_back")}
                  </button>
                ) : null}
                <h2 style={ui.h2}>
                  #{detail.number} · {CHANNEL_LABELS[detail.channel] ?? detail.channel}
                </h2>
                <Badge tone={statusTone(detail.status)}>
                  {tUi(lang, statusKey(detail.status))}
                </Badge>
                <span style={{ marginLeft: "auto", fontSize: 13, color: colors.textSecondary }}>
                  {detail.contact?.name ?? tUi(lang, "ui_customer")}
                  {detail.contact?.phone ? ` · ${detail.contact.phone}` : ""}
                </span>
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: "14px 2px", display: "grid", gap: 10 }}>
                {detail.messages.map((m) => {
                  const inbound = m.direction === "INBOUND";
                  return (
                    <div
                      key={m.id}
                      style={{
                        justifySelf: inbound ? "start" : "end",
                        maxWidth: "78%",
                      }}
                    >
                      <div
                        style={{
                          padding: "9px 13px",
                          borderRadius: 12,
                          borderTopLeftRadius: inbound ? 4 : 12,
                          borderBottomRightRadius: inbound ? 12 : 4,
                          background: inbound ? colors.surfaceRaised : colors.accentStrong,
                          color: inbound ? colors.textBody : colors.onAccent,
                          fontSize: 14,
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {m.body}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: colors.textMuted,
                          marginTop: 3,
                          textAlign: inbound ? "start" : "end",
                        }}
                      >
                        {inbound
                          ? detail.contact?.name ?? tUi(lang, "ui_customer")
                          : m.authorUser?.name ?? "Olink Desk"}
                        {" · "}
                        {timeAgo(m.createdAt)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {sendError ? (
                <div style={{ ...ui.error, marginBottom: 10 }}>{sendError}</div>
              ) : null}
              <div style={{ display: "flex", gap: 8, paddingTop: 10, borderTop: `1px solid ${colors.border}` }}>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={tUi(lang, "ui_reply_placeholder")}
                  rows={2}
                  style={{ ...ui.input, resize: "vertical", flex: 1 }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void sendReply();
                  }}
                />
                <button
                  onClick={sendReply}
                  disabled={sending || !reply.trim()}
                  style={{
                    ...ui.button,
                    alignSelf: "flex-end",
                    opacity: sending || !reply.trim() ? 0.6 : 1,
                  }}
                >
                  {sending ? tUi(lang, "ui_sending") : tUi(lang, "ui_send")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </ConsoleShell>
  );
}
