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
  duration,
  priorityKey,
  statusKey,
  timeAgo,
  type TicketDetail,
  type TicketRow,
} from "../../lib/tickets";

const FILTERS = ["ALL", "NEW", "OPEN", "PENDING", "RESOLVED", "CLOSED"] as const;

const railSelect = {
  padding: "6px 8px",
  borderRadius: 6,
  border: `1px solid ${colors.border}`,
  background: colors.surfaceRaised,
  color: colors.textBody,
  fontSize: 12,
  maxWidth: 150,
} as const;

// The SLA chips: what is promised, and how much clock is left. Amber past
// 80% of the window, red past due — same thresholds as the wallboard.
function slaChips(detail: TicketDetail, lang: string) {
  const chips: Array<{ tone: "success" | "info" | "warn"; text: string }> = [];
  const now = Date.now();
  const closedish = detail.status === "RESOLVED" || detail.status === "CLOSED";
  const chip = (dueIso: string | null, key: "ui_sla_first_due" | "ui_sla_resolve_due") => {
    if (!dueIso) return;
    const due = new Date(dueIso).getTime();
    const created = new Date(detail.createdAt).getTime();
    if (now >= due) {
      chips.push({ tone: "warn", text: tUi(lang, "ui_sla_overdue", { t: duration(now - due) }) });
    } else {
      const progress = (now - created) / Math.max(1, due - created);
      chips.push({
        tone: progress >= 0.8 ? "warn" : "info",
        text: tUi(lang, key, { t: duration(due - now) }),
      });
    }
  };
  if (!closedish) {
    if (detail.firstRespondedAt) {
      chips.push({ tone: "success", text: tUi(lang, "ui_sla_met") });
    } else {
      chip(detail.firstResponseDueAt, "ui_sla_first_due");
    }
    chip(detail.resolveDueAt, "ui_sla_resolve_due");
  }
  return chips.map((c, i) => (
    <Badge key={i} tone={c.tone}>
      {c.text}
    </Badge>
  ));
}

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
  const [queues, setQueues] = useState<Array<{ id: string; name: string }>>([]);
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);
  const [meId, setMeId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!me) return;
    void (async () => {
      const [qResp, uResp, meResp] = await Promise.all([
        fetch("/api/queues"),
        fetch("/api/users"),
        fetch("/api/auth/me"),
      ]);
      if (qResp.ok) setQueues(((await qResp.json()) as { queues: typeof queues }).queues);
      if (uResp.ok) setStaff(((await uResp.json()) as { users: typeof staff }).users);
      if (meResp.ok) {
        const body = (await meResp.json()) as { user: { id: string } };
        setMeId(body.user.id);
      }
    })();
  }, [me]);

  // One PATCH covers every rail control; the response is the fresh ticket.
  async function patchTicket(change: Record<string, unknown>) {
    if (!selectedId) return;
    const resp = await fetch(`/api/tickets/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(change),
    });
    if (resp.ok) await Promise.all([loadDetail(selectedId), loadList()]);
  }

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

              {/* -------------------------------------------- ticket rail */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "center",
                  padding: "10px 0",
                  borderBottom: `1px solid ${colors.border}`,
                }}
              >
                {(["NEW", "OPEN", "PENDING", "RESOLVED", "CLOSED"] as const).some(
                  (s) => s === detail.status,
                ) ? (
                  <select
                    aria-label={tUi(lang, "ui_status")}
                    value={detail.status}
                    onChange={(e) => void patchTicket({ status: e.target.value })}
                    style={railSelect}
                  >
                    {["NEW", "OPEN", "PENDING", "RESOLVED", "CLOSED"].map((st) => (
                      <option key={st} value={st}>
                        {tUi(lang, statusKey(st))}
                      </option>
                    ))}
                  </select>
                ) : null}
                <select
                  aria-label={tUi(lang, "ui_priority")}
                  value={detail.priority}
                  onChange={(e) => void patchTicket({ priority: e.target.value })}
                  style={railSelect}
                >
                  {["LOW", "NORMAL", "HIGH", "URGENT"].map((pr) => (
                    <option key={pr} value={pr}>
                      {tUi(lang, priorityKey(pr))}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={tUi(lang, "ui_assignee")}
                  value={detail.assigneeId ?? ""}
                  onChange={(e) =>
                    void patchTicket({ assigneeId: e.target.value || null })
                  }
                  style={railSelect}
                >
                  <option value="">{tUi(lang, "ui_unassigned")}</option>
                  {staff.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                {meId && detail.assigneeId !== meId ? (
                  <button
                    onClick={() => void patchTicket({ assigneeId: meId })}
                    style={{ ...ui.buttonGhost, padding: "6px 10px", fontSize: 12 }}
                  >
                    {tUi(lang, "ui_assign_me")}
                  </button>
                ) : null}
                <select
                  aria-label={tUi(lang, "ui_queue")}
                  value={detail.queueId ?? ""}
                  onChange={(e) =>
                    void patchTicket({ queueId: e.target.value || null })
                  }
                  style={railSelect}
                >
                  <option value="">{tUi(lang, "ui_no_queue")}</option>
                  {queues.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.name}
                    </option>
                  ))}
                </select>
                {slaChips(detail, lang)}
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
