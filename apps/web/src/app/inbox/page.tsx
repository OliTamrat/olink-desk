"use client";
// The agent workspace — the industry-standard shape (ADR 0006): saved
// views on the left, a filtered+searchable ticket list with a live count,
// the conversation in the middle, and a customer/ticket context rail on the
// right. Desktop-rich first: panes collapse into controls as width drops,
// and below 820px it is one pane at a time.
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Badge,
  colors,
  ConsoleShell,
  tUi,
  ui,
  useConsoleLanguage,
  useMe,
  useViewport,
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

const VIEWS = [
  { key: "mine", label: "ui_view_mine" },
  { key: "unassigned", label: "ui_view_unassigned" },
  { key: "open", label: "ui_view_open" },
  { key: "solved", label: "ui_view_solved" },
  { key: "all", label: "ui_view_all" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

const STATUSES = ["NEW", "OPEN", "PENDING", "RESOLVED", "CLOSED"] as const;
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

const control = {
  padding: "6px 8px",
  borderRadius: 6,
  border: `1px solid ${colors.border}`,
  background: colors.surfaceRaised,
  color: colors.textBody,
  fontSize: 12,
  maxWidth: 170,
} as const;

/** SLA state for a ticket, shared by the list badge and the header chips. */
function slaState(t: {
  status: string;
  createdAt: string;
  firstRespondedAt?: string | null;
  firstResponseDueAt?: string | null;
  resolveDueAt?: string | null;
}): { tone: "success" | "info" | "warn"; key: string; ms: number } | null {
  if (t.status === "RESOLVED" || t.status === "CLOSED") return null;
  const now = Date.now();
  const created = new Date(t.createdAt).getTime();
  const pick =
    !t.firstRespondedAt && t.firstResponseDueAt
      ? { due: t.firstResponseDueAt, key: "ui_sla_first_due" }
      : t.resolveDueAt
        ? { due: t.resolveDueAt, key: "ui_sla_resolve_due" }
        : null;
  if (!pick) return null;
  const due = new Date(pick.due).getTime();
  if (now >= due) return { tone: "warn", key: "ui_sla_overdue", ms: now - due };
  const progress = (now - created) / Math.max(1, due - created);
  return { tone: progress >= 0.8 ? "warn" : "info", key: pick.key, ms: due - now };
}

export default function InboxPage() {
  const [lang, setLang] = useConsoleLanguage();
  const me = useMe();
  const { isMobile, roomy, wide } = useViewport();

  const [view, setView] = useState<ViewKey>("open");
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [assignee, setAssignee] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  const [count, setCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [queues, setQueues] = useState<Array<{ id: string; name: string }>>([]);
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);
  const [meId, setMeId] = useState<string | null>(null);

  // Typing must not hammer the database: the search term settles first.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(timer);
  }, [q]);

  const query = useMemo(() => {
    const p = new URLSearchParams({ view });
    if (status) p.set("status", status);
    if (channel) p.set("channel", channel);
    if (assignee) p.set("assignee", assignee);
    if (debouncedQ) p.set("q", debouncedQ);
    return p.toString();
  }, [view, status, channel, assignee, debouncedQ]);

  const loadList = useCallback(async () => {
    const resp = await fetch(`/api/tickets?${query}`);
    if (resp.ok) {
      const body = (await resp.json()) as { tickets: TicketRow[]; count: number };
      setTickets(body.tickets);
      setCount(body.count);
    }
  }, [query]);

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
      if (meResp.ok) setMeId(((await meResp.json()) as { user: { id: string } }).user.id);
    })();
  }, [me]);

  const loadDetail = useCallback(async (id: string) => {
    const resp = await fetch(`/api/tickets/${id}`);
    if (resp.ok) setDetail(((await resp.json()) as { ticket: TicketDetail }).ticket);
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  async function patchTicket(change: Record<string, unknown>) {
    if (!selectedId) return;
    const resp = await fetch(`/api/tickets/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(change),
    });
    if (resp.ok) await Promise.all([loadDetail(selectedId), loadList()]);
  }

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
        const body = (await resp.json().catch(() => null)) as { error?: string } | null;
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

  const emptyText = () => {
    if (debouncedQ) return tUi(lang, "ui_empty_search");
    if (view === "mine") return tUi(lang, "ui_empty_mine");
    if (view === "unassigned") return tUi(lang, "ui_empty_unassigned");
    if (view === "solved") return tUi(lang, "ui_empty_solved");
    return tUi(lang, "ui_no_tickets");
  };

  const filtersActive = Boolean(status || channel || assignee || debouncedQ);
  const showList = !isMobile || !selectedId;
  const showConversation = !isMobile || Boolean(selectedId);
  const sla = detail ? slaState(detail) : null;

  // --------------------------------------------------------------- panes
  const viewsRail = (
    <nav style={{ ...ui.card, padding: 8, flex: "0 0 190px", alignSelf: "stretch" }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: colors.textMuted,
          padding: "6px 10px 8px",
        }}
      >
        {tUi(lang, "ui_views")}
      </div>
      {VIEWS.map((v) => (
        <button
          key={v.key}
          onClick={() => {
            setView(v.key);
            setSelectedId(null);
          }}
          style={{
            display: "block",
            width: "100%",
            textAlign: "start",
            padding: "8px 10px",
            marginBottom: 2,
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: view === v.key ? 600 : 500,
            color: view === v.key ? colors.textPrimary : colors.textSecondary,
            background: view === v.key ? colors.surfaceHover : "transparent",
            borderLeft: `2px solid ${view === v.key ? colors.accent : "transparent"}`,
          }}
        >
          {tUi(lang, v.label)}
        </button>
      ))}
    </nav>
  );

  const ticketList = (
    <div
      style={{
        ...ui.card,
        padding: 0,
        flex: isMobile ? "1 1 auto" : `0 0 ${roomy ? 340 : 300}px`,
        overflowY: "auto",
        display: showList ? "block" : "none",
        minWidth: 0,
        height: isMobile ? "auto" : "100%",
      }}
    >
      {tickets && tickets.length === 0 ? (
        <p style={{ margin: 16, color: colors.textMuted, fontSize: 13, lineHeight: 1.5 }}>
          {emptyText()}
        </p>
      ) : (
        (tickets ?? []).map((t, i) => {
          const selected = t.id === selectedId;
          const rowSla = slaState(t);
          return (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "start",
                padding: "11px 14px",
                border: "none",
                borderTop: i === 0 ? "none" : `1px solid ${colors.border}`,
                borderLeft: `3px solid ${selected ? colors.accent : "transparent"}`,
                cursor: "pointer",
                background: selected ? colors.surfaceHover : "transparent",
                fontFamily: "inherit",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: colors.textSecondary, fontVariantNumeric: "tabular-nums" }}>
                  #{t.number} · {CHANNEL_LABELS[t.channel] ?? t.channel}
                </span>
                <span style={{ fontSize: 11, color: colors.textMuted }}>{timeAgo(t.updatedAt)}</span>
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: colors.textPrimary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  marginBottom: 2,
                }}
              >
                {t.subject ?? t.messages[0]?.body ?? ""}
              </div>
              {t.messages[0] ? (
                <div
                  style={{
                    fontSize: 12,
                    color: colors.textMuted,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    marginBottom: 7,
                  }}
                >
                  {t.messages[0].direction === "OUTBOUND" ? "↩ " : ""}
                  {t.messages[0].body}
                </div>
              ) : (
                <div style={{ marginBottom: 7 }} />
              )}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <Badge tone={statusTone(t.status)}>{tUi(lang, statusKey(t.status))}</Badge>
                {rowSla?.tone === "warn" ? (
                  <Badge tone="warn">{tUi(lang, rowSla.key, { t: duration(rowSla.ms) })}</Badge>
                ) : null}
                <span style={{ fontSize: 11, color: colors.textMuted, marginInlineStart: "auto" }}>
                  {t.assignee?.name ?? tUi(lang, "ui_unassigned")}
                </span>
              </div>
            </button>
          );
        })
      )}
    </div>
  );

  const contextRail =
    detail && roomy ? (
      <aside style={{ ...ui.card, flex: "0 0 260px", alignSelf: "stretch", padding: 16, overflowY: "auto" }}>
        <RailHeading>{tUi(lang, "ui_customer_details")}</RailHeading>
        <div style={{ display: "grid", gap: 6, marginBottom: 18 }}>
          <div style={{ fontSize: 15, color: colors.textPrimary, fontWeight: 600 }}>
            {detail.contact?.name ?? tUi(lang, "ui_customer")}
          </div>
          {detail.contact?.phone ? (
            <Field label={tUi(lang, "ui_phone")} value={detail.contact.phone} />
          ) : null}
          {detail.contact?.email ? (
            <Field label={tUi(lang, "ui_email")} value={detail.contact.email} />
          ) : null}
          <Field label={tUi(lang, "ui_language")} value={(detail.language ?? "").toUpperCase()} />
        </div>

        <RailHeading>{tUi(lang, "ui_ticket_details")}</RailHeading>
        <div style={{ display: "grid", gap: 6 }}>
          <Field
            label={tUi(lang, "ui_channel")}
            value={CHANNEL_LABELS[detail.channel] ?? detail.channel}
          />
          <Field label={tUi(lang, "ui_opened")} value={timeAgo(detail.createdAt)} />
          <Field label={tUi(lang, "ui_priority")} value={tUi(lang, priorityKey(detail.priority))} />
          <Field
            label={tUi(lang, "ui_queue")}
            value={queues.find((qq) => qq.id === detail.queueId)?.name ?? tUi(lang, "ui_no_queue")}
          />
          <Field
            label={tUi(lang, "ui_assignee")}
            value={staff.find((s) => s.id === detail.assigneeId)?.name ?? tUi(lang, "ui_unassigned")}
          />
        </div>
      </aside>
    ) : null;

  const conversation = (
    <div
      style={{
        ...ui.card,
        flex: 1,
        minWidth: isMobile ? 0 : 340,
        display: showConversation ? "flex" : "none",
        flexDirection: "column",
        height: isMobile ? "auto" : "100%",
        maxHeight: isMobile ? "74vh" : "100%",
        padding: isMobile ? 14 : 20,
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
            <Badge tone={statusTone(detail.status)}>{tUi(lang, statusKey(detail.status))}</Badge>
            {detail.firstRespondedAt ? (
              <Badge tone="success">{tUi(lang, "ui_sla_met")}</Badge>
            ) : null}
            {sla ? <Badge tone={sla.tone}>{tUi(lang, sla.key, { t: duration(sla.ms) })}</Badge> : null}
            {!roomy ? (
              <span style={{ marginInlineStart: "auto", fontSize: 13, color: colors.textSecondary }}>
                {detail.contact?.name ?? tUi(lang, "ui_customer")}
              </span>
            ) : null}
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              padding: "10px 0",
              borderBottom: `1px solid ${colors.border}`,
            }}
          >
            <select
              aria-label={tUi(lang, "ui_status")}
              value={detail.status}
              onChange={(e) => void patchTicket({ status: e.target.value })}
              style={control}
            >
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {tUi(lang, statusKey(st))}
                </option>
              ))}
            </select>
            <select
              aria-label={tUi(lang, "ui_priority")}
              value={detail.priority}
              onChange={(e) => void patchTicket({ priority: e.target.value })}
              style={control}
            >
              {PRIORITIES.map((pr) => (
                <option key={pr} value={pr}>
                  {tUi(lang, priorityKey(pr))}
                </option>
              ))}
            </select>
            <select
              aria-label={tUi(lang, "ui_assignee")}
              value={detail.assigneeId ?? ""}
              onChange={(e) => void patchTicket({ assigneeId: e.target.value || null })}
              style={control}
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
              onChange={(e) => void patchTicket({ queueId: e.target.value || null })}
              style={control}
            >
              <option value="">{tUi(lang, "ui_no_queue")}</option>
              {queues.map((qq) => (
                <option key={qq.id} value={qq.id}>
                  {qq.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "14px 2px", display: "grid", gap: 10 }}>
            {detail.messages.map((m) => {
              const inbound = m.direction === "INBOUND";
              return (
                <div key={m.id} style={{ justifySelf: inbound ? "start" : "end", maxWidth: "80%" }}>
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
                      ? (detail.contact?.name ?? tUi(lang, "ui_customer"))
                      : (m.authorUser?.name ?? "Olink Desk")}
                    {" · "}
                    {timeAgo(m.createdAt)}
                  </div>
                </div>
              );
            })}
          </div>

          {sendError ? <div style={{ ...ui.error, marginBottom: 10 }}>{sendError}</div> : null}
          <div
            style={{
              display: "flex",
              gap: 8,
              paddingTop: 10,
              borderTop: `1px solid ${colors.border}`,
            }}
          >
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
  );

  return (
    <ConsoleShell lang={lang} onLang={setLang} me={me} active="inbox">
      <header
        style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 14 }}
      >
        <h1 style={ui.h1}>{tUi(lang, "ui_nav_inbox")}</h1>
        <span
          style={{ color: colors.textSecondary, fontSize: 14, fontVariantNumeric: "tabular-nums" }}
        >
          {tUi(lang, "ui_count_tickets", { n: count })}
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tUi(lang, "ui_search_tickets")}
          style={{
            ...ui.input,
            marginInlineStart: "auto",
            maxWidth: 300,
            fontSize: 14,
            padding: "8px 12px",
          }}
        />
      </header>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        {!wide ? (
          <select
            aria-label={tUi(lang, "ui_views")}
            value={view}
            onChange={(e) => {
              setView(e.target.value as ViewKey);
              setSelectedId(null);
            }}
            style={{ ...control, maxWidth: 190 }}
          >
            {VIEWS.map((v) => (
              <option key={v.key} value={v.key}>
                {tUi(lang, v.label)}
              </option>
            ))}
          </select>
        ) : null}
        <select
          aria-label={tUi(lang, "ui_status")}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={control}
        >
          <option value="">{tUi(lang, "ui_all")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {tUi(lang, statusKey(s))}
            </option>
          ))}
        </select>
        <select
          aria-label={tUi(lang, "ui_channel")}
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          style={control}
        >
          <option value="">{tUi(lang, "ui_all_channels")}</option>
          {Object.entries(CHANNEL_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label={tUi(lang, "ui_assignee")}
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          style={control}
        >
          <option value="">{tUi(lang, "ui_anyone")}</option>
          <option value="none">{tUi(lang, "ui_unassigned")}</option>
          {staff.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        {filtersActive ? (
          <button
            onClick={() => {
              setStatus("");
              setChannel("");
              setAssignee("");
              setQ("");
            }}
            style={{ ...ui.buttonGhost, padding: "6px 10px", fontSize: 12 }}
          >
            {tUi(lang, "ui_clear")}
          </button>
        ) : null}
      </div>

      {/* The workspace fills the viewport and scrolls INSIDE its panes —
          a desk app, not a document that runs out halfway down the page. */}
      <div
        style={{
          display: "flex",
          gap: 14,
          alignItems: "stretch",
          height: isMobile ? "auto" : "calc(100vh - 210px)",
          minHeight: isMobile ? 0 : 420,
        }}
      >
        {wide && !isMobile ? viewsRail : null}
        {ticketList}
        {conversation}
        {!isMobile ? contextRail : null}
      </div>
    </ConsoleShell>
  );
}

function RailHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        margin: "0 0 10px",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        color: colors.textMuted,
      }}
    >
      {children}
    </h3>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
      <span style={{ color: colors.textMuted }}>{label}</span>
      <span style={{ color: colors.textBody, textAlign: "end", overflowWrap: "anywhere" }}>
        {value}
      </span>
    </div>
  );
}
