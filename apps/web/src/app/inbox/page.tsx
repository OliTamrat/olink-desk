"use client";
// The agent workspace, v2 — the Zendesk agent-console shape (ADR 0006):
//
//   [app nav] [views + counts] [ TABLE of tickets                     ]
//   [app nav] [views + counts] [ properties | conversation | customer ]
//
// List and ticket are separate screens rather than side-by-side panes: an
// open ticket gets the whole width, which is what makes a three-column
// detail readable instead of three cramped strips.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

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
type SortKey = "updated" | "created" | "number" | "status" | "priority";

interface HistoryRow {
  id: string;
  number: number;
  subject: string | null;
  status: string;
  channel: string;
  createdAt: string;
}

const control = {
  padding: "6px 8px",
  borderRadius: 6,
  border: `1px solid ${colors.border}`,
  background: colors.surfaceRaised,
  color: colors.textBody,
  fontSize: 12,
  maxWidth: 170,
} as const;

const th = {
  textAlign: "start",
  padding: "9px 12px",
  fontSize: 12,
  fontWeight: 600,
  color: colors.textSecondary,
  borderBottom: `1px solid ${colors.border}`,
  whiteSpace: "nowrap",
  userSelect: "none",
} as const;

const td = {
  padding: "11px 12px",
  fontSize: 13,
  color: colors.textBody,
  borderBottom: `1px solid ${colors.border}`,
  verticalAlign: "middle",
} as const;

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

const statusTone = (s: string) =>
  s === "NEW" ? "info" : s === "PENDING" ? "warn" : s === "OPEN" ? "success" : "muted";

export default function InboxPage() {
  const [lang, setLang] = useConsoleLanguage();
  const me = useMe();
  const { isMobile, roomy } = useViewport();

  const [view, setView] = useState<ViewKey>("open");
  const [counts, setCounts] = useState<Record<ViewKey, number> | null>(null);
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [assignee, setAssignee] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  const [count, setCount] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [queues, setQueues] = useState<Array<{ id: string; name: string }>>([]);
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(timer);
  }, [q]);

  const query = useMemo(() => {
    const p = new URLSearchParams({ view, sort, dir });
    if (status) p.set("status", status);
    if (channel) p.set("channel", channel);
    if (assignee) p.set("assignee", assignee);
    if (debouncedQ) p.set("q", debouncedQ);
    return p.toString();
  }, [view, sort, dir, status, channel, assignee, debouncedQ]);

  const loadList = useCallback(async () => {
    const [listResp, countsResp] = await Promise.all([
      fetch(`/api/tickets?${query}`),
      fetch("/api/tickets/counts"),
    ]);
    if (listResp.ok) {
      const body = (await listResp.json()) as { tickets: TicketRow[]; count: number };
      setTickets(body.tickets);
      setCount(body.count);
    }
    if (countsResp.ok) setCounts((await countsResp.json()) as Record<ViewKey, number>);
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
    if (resp.ok) {
      const body = (await resp.json()) as { ticket: TicketDetail; history: HistoryRow[] };
      setDetail(body.ticket);
      setHistory(body.history ?? []);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else {
      setDetail(null);
      setHistory([]);
    }
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

  async function bulk(change: Record<string, unknown>) {
    if (picked.size === 0) return;
    const resp = await fetch("/api/tickets/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...picked], ...change }),
    });
    if (resp.ok) {
      setPicked(new Set());
      await loadList();
    }
  }

  async function send() {
    if (!selectedId || !reply.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const resp = await fetch(`/api/tickets/${selectedId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply.trim(), internal }),
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

  function toggleSort(key: SortKey) {
    if (sort === key) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(key);
      setDir("desc");
    }
  }

  const emptyText = () => {
    if (debouncedQ) return tUi(lang, "ui_empty_search");
    if (view === "mine") return tUi(lang, "ui_empty_mine");
    if (view === "unassigned") return tUi(lang, "ui_empty_unassigned");
    if (view === "solved") return tUi(lang, "ui_empty_solved");
    return tUi(lang, "ui_no_tickets");
  };

  const filtersActive = Boolean(status || channel || assignee || debouncedQ);
  const rows = tickets ?? [];
  const allPicked = rows.length > 0 && rows.every((t) => picked.has(t.id));

  // ------------------------------------------------ second sidebar layer
  const viewsPanel = isMobile ? null : (
    <nav>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: colors.textMuted,
          padding: "0 10px 10px",
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
            setPicked(new Set());
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
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
          <span>{tUi(lang, v.label)}</span>
          <span
            style={{ fontSize: 12, color: colors.textMuted, fontVariantNumeric: "tabular-nums" }}
          >
            {counts ? counts[v.key] : ""}
          </span>
        </button>
      ))}
    </nav>
  );

  // --------------------------------------------------------- ticket view
  if (selectedId && detail) {
    const sla = slaState(detail);

    const properties = (
      <div
        style={{
          ...ui.card,
          flex: `0 0 ${roomy ? 240 : 220}px`,
          alignSelf: "stretch",
          padding: 16,
          overflowY: "auto",
        }}
      >
        <RailHeading>{tUi(lang, "ui_properties")}</RailHeading>
        <div style={{ display: "grid", gap: 12 }}>
          <Labelled label={tUi(lang, "ui_assignee")}>
            <select
              aria-label={tUi(lang, "ui_assignee")}
              value={detail.assigneeId ?? ""}
              onChange={(e) => void patchTicket({ assigneeId: e.target.value || null })}
              style={{ ...control, maxWidth: "100%", width: "100%" }}
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
                style={{
                  background: "none",
                  border: "none",
                  padding: "4px 0 0",
                  color: colors.accent,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {tUi(lang, "ui_take_it")}
              </button>
            ) : null}
          </Labelled>
          <Labelled label={tUi(lang, "ui_status")}>
            <select
              aria-label={tUi(lang, "ui_status")}
              value={detail.status}
              onChange={(e) => void patchTicket({ status: e.target.value })}
              style={{ ...control, maxWidth: "100%", width: "100%" }}
            >
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {tUi(lang, statusKey(st))}
                </option>
              ))}
            </select>
          </Labelled>
          <Labelled label={tUi(lang, "ui_priority")}>
            <select
              aria-label={tUi(lang, "ui_priority")}
              value={detail.priority}
              onChange={(e) => void patchTicket({ priority: e.target.value })}
              style={{ ...control, maxWidth: "100%", width: "100%" }}
            >
              {PRIORITIES.map((pr) => (
                <option key={pr} value={pr}>
                  {tUi(lang, priorityKey(pr))}
                </option>
              ))}
            </select>
          </Labelled>
          <Labelled label={tUi(lang, "ui_queue")}>
            <select
              aria-label={tUi(lang, "ui_queue")}
              value={detail.queueId ?? ""}
              onChange={(e) => void patchTicket({ queueId: e.target.value || null })}
              style={{ ...control, maxWidth: "100%", width: "100%" }}
            >
              <option value="">{tUi(lang, "ui_no_queue")}</option>
              {queues.map((qq) => (
                <option key={qq.id} value={qq.id}>
                  {qq.name}
                </option>
              ))}
            </select>
          </Labelled>
          <Field
            label={tUi(lang, "ui_channel")}
            value={CHANNEL_LABELS[detail.channel] ?? detail.channel}
          />
          <Field label={tUi(lang, "ui_opened")} value={timeAgo(detail.createdAt)} />
        </div>
      </div>
    );

    const customer = (
      <aside
        style={{
          ...ui.card,
          flex: "0 0 260px",
          alignSelf: "stretch",
          padding: 16,
          overflowY: "auto",
        }}
      >
        <RailHeading>{tUi(lang, "ui_customer_details")}</RailHeading>
        <div style={{ display: "grid", gap: 6, marginBottom: 20 }}>
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
        <RailHeading>{tUi(lang, "ui_interaction_history")}</RailHeading>
        {history.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: colors.textMuted, lineHeight: 1.5 }}>
            {tUi(lang, "ui_no_history")}
          </p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {history.map((h) => (
              <button
                key={h.id}
                onClick={() => setSelectedId(h.id)}
                style={{
                  textAlign: "start",
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ fontSize: 12, color: colors.textSecondary }}>
                  #{h.number} · {timeAgo(h.createdAt)}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: colors.textBody,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h.subject ?? ""}
                </div>
              </button>
            ))}
          </div>
        )}
      </aside>
    );

    return (
      <ConsoleShell lang={lang} onLang={setLang} me={me} active="inbox" sidePanel={viewsPanel}>
        <button
          onClick={() => setSelectedId(null)}
          style={{ ...ui.buttonGhost, padding: "6px 10px", fontSize: 12, marginBottom: 12 }}
        >
          ← {tUi(lang, "ui_back_to_list")}
        </button>

        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "stretch",
            height: isMobile ? "auto" : "calc(100vh - 150px)",
          }}
        >
          {!isMobile ? properties : null}

          <div
            style={{
              ...ui.card,
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              padding: isMobile ? 14 : 20,
              height: isMobile ? "auto" : "100%",
            }}
          >
            <div style={{ paddingBottom: 12, borderBottom: `1px solid ${colors.border}` }}>
              <h2 style={{ ...ui.h2, marginBottom: 6 }}>
                {detail.subject ?? `#${detail.number}`}
              </h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: colors.textSecondary }}>
                  #{detail.number} · {CHANNEL_LABELS[detail.channel] ?? detail.channel}
                </span>
                <Badge tone={statusTone(detail.status)}>
                  {tUi(lang, statusKey(detail.status))}
                </Badge>
                {detail.firstRespondedAt ? (
                  <Badge tone="success">{tUi(lang, "ui_sla_met")}</Badge>
                ) : null}
                {sla ? (
                  <Badge tone={sla.tone}>{tUi(lang, sla.key, { t: duration(sla.ms) })}</Badge>
                ) : null}
              </div>
            </div>

            <div
              style={{ flex: 1, overflowY: "auto", padding: "14px 2px", display: "grid", gap: 10 }}
            >
              {detail.messages.map((m) => {
                const isNote = m.direction === "NOTE";
                const inbound = m.direction === "INBOUND";
                if (isNote) {
                  // An internal note is deliberately unlike either side of
                  // the conversation: full width, amber, labelled. An agent
                  // must never have to wonder whether the customer saw it.
                  return (
                    <div
                      key={m.id}
                      style={{
                        border: `1px solid ${colors.warn}55`,
                        background: colors.warnBg,
                        borderRadius: 10,
                        padding: "10px 12px",
                      }}
                    >
                      <div
                        style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}
                      >
                        <Badge tone="warn">{tUi(lang, "ui_note_badge")}</Badge>
                        <span style={{ fontSize: 11, color: colors.textMuted }}>
                          {m.authorUser?.name ?? ""} · {timeAgo(m.createdAt)}
                        </span>
                      </div>
                      <div
                        style={{ fontSize: 14, color: colors.textBody, whiteSpace: "pre-wrap" }}
                      >
                        {m.body}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={m.id} style={{ justifySelf: inbound ? "start" : "end", maxWidth: "78%" }}>
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

            {/* Composer: the mode must be unmistakable, so the whole box
                changes colour rather than a small tab. */}
            <div
              style={{
                borderTop: `1px solid ${colors.border}`,
                paddingTop: 10,
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", gap: 6 }}>
                {[false, true].map((mode) => (
                  <button
                    key={String(mode)}
                    onClick={() => setInternal(mode)}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 6,
                      border: `1px solid ${
                        internal === mode ? (mode ? colors.warn : colors.accent) : colors.border
                      }`,
                      background:
                        internal === mode
                          ? mode
                            ? colors.warnBg
                            : colors.surfaceHover
                          : "transparent",
                      color:
                        internal === mode
                          ? mode
                            ? colors.warn
                            : colors.textPrimary
                          : colors.textSecondary,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {tUi(lang, mode ? "ui_internal_note" : "ui_public_reply")}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={tUi(lang, internal ? "ui_note_placeholder" : "ui_reply_placeholder")}
                  rows={2}
                  style={{
                    ...ui.input,
                    resize: "vertical",
                    flex: 1,
                    borderColor: internal ? `${colors.warn}88` : colors.borderStrong,
                    background: internal ? colors.warnBg : colors.surfaceRaised,
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
                  }}
                />
                <button
                  onClick={send}
                  disabled={sending || !reply.trim()}
                  style={{
                    ...ui.button,
                    alignSelf: "flex-end",
                    background: internal ? colors.warn : colors.accent,
                    color: internal ? colors.bg : colors.onAccent,
                    opacity: sending || !reply.trim() ? 0.6 : 1,
                  }}
                >
                  {sending ? tUi(lang, "ui_sending") : tUi(lang, "ui_send")}
                </button>
              </div>
            </div>
          </div>

          {roomy && !isMobile ? customer : null}
        </div>
      </ConsoleShell>
    );
  }

  // ----------------------------------------------------------- list view
  const sortable = (key: SortKey, label: string) => (
    <th
      style={{ ...th, cursor: "pointer" }}
      onClick={() => toggleSort(key)}
      aria-sort={sort === key ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}
      {sort === key ? (dir === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );

  return (
    <ConsoleShell lang={lang} onLang={setLang} me={me} active="inbox" sidePanel={viewsPanel}>
      <header
        style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 12 }}
      >
        <h1 style={ui.h1}>{tUi(lang, `ui_view_${view}`)}</h1>
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

      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}
      >
        {isMobile ? (
          <select
            aria-label={tUi(lang, "ui_views")}
            value={view}
            onChange={(e) => setView(e.target.value as ViewKey)}
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

      {/* Bulk bar — appears only with a selection, so it never costs space. */}
      {picked.size > 0 ? (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 12,
            padding: "10px 14px",
            borderRadius: 10,
            background: colors.surfaceHover,
            border: `1px solid ${colors.accent}55`,
          }}
        >
          <strong style={{ fontSize: 13, color: colors.textPrimary }}>
            {tUi(lang, "ui_selected", { n: picked.size })}
          </strong>
          {meId ? (
            <button
              onClick={() => void bulk({ assigneeId: meId })}
              style={{ ...ui.buttonGhost, padding: "6px 10px", fontSize: 12 }}
            >
              {tUi(lang, "ui_assign_me")}
            </button>
          ) : null}
          <select
            aria-label="Bulk status"
            value=""
            onChange={(e) => e.target.value && void bulk({ status: e.target.value })}
            style={control}
          >
            <option value="">{tUi(lang, "ui_status")}…</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {tUi(lang, statusKey(s))}
              </option>
            ))}
          </select>
          <select
            aria-label="Bulk priority"
            value=""
            onChange={(e) => e.target.value && void bulk({ priority: e.target.value })}
            style={control}
          >
            <option value="">{tUi(lang, "ui_priority")}…</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {tUi(lang, priorityKey(p))}
              </option>
            ))}
          </select>
          <button
            onClick={() => setPicked(new Set())}
            style={{ ...ui.buttonGhost, padding: "6px 10px", fontSize: 12 }}
          >
            {tUi(lang, "ui_clear")}
          </button>
        </div>
      ) : null}

      <div style={{ ...ui.card, padding: 0, overflowX: "auto" }}>
        {rows.length === 0 ? (
          <p style={{ margin: 20, color: colors.textMuted, fontSize: 13 }}>{emptyText()}</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 36 }}>
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allPicked}
                    onChange={() =>
                      setPicked(allPicked ? new Set() : new Set(rows.map((t) => t.id)))
                    }
                  />
                </th>
                {sortable("status", tUi(lang, "ui_status"))}
                <th style={th}>{tUi(lang, "ui_subject")}</th>
                {!isMobile ? <th style={th}>{tUi(lang, "ui_requester")}</th> : null}
                {!isMobile ? <th style={th}>{tUi(lang, "ui_channel")}</th> : null}
                {sortable("updated", tUi(lang, "ui_requested"))}
                {!isMobile ? sortable("priority", tUi(lang, "ui_priority")) : null}
                {!isMobile ? <th style={th}>{tUi(lang, "ui_assignee")}</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const rowSla = slaState(t);
                return (
                  <tr
                    key={t.id}
                    style={{
                      cursor: "pointer",
                      background: picked.has(t.id) ? colors.surfaceHover : "transparent",
                    }}
                    onClick={() => setSelectedId(t.id)}
                  >
                    <td style={td} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select #${t.number}`}
                        checked={picked.has(t.id)}
                        onChange={() => {
                          const next = new Set(picked);
                          if (next.has(t.id)) next.delete(t.id);
                          else next.add(t.id);
                          setPicked(next);
                        }}
                      />
                    </td>
                    <td style={td}>
                      <Badge tone={statusTone(t.status)}>{tUi(lang, statusKey(t.status))}</Badge>
                    </td>
                    <td style={{ ...td, maxWidth: 420 }}>
                      <div
                        style={{
                          color: colors.textPrimary,
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t.subject ?? t.messages[0]?.body ?? ""}
                      </div>
                      {rowSla?.tone === "warn" ? (
                        <div style={{ marginTop: 4 }}>
                          <Badge tone="warn">
                            {tUi(lang, rowSla.key, { t: duration(rowSla.ms) })}
                          </Badge>
                        </div>
                      ) : null}
                    </td>
                    {!isMobile ? (
                      <td style={{ ...td, color: colors.textSecondary }}>
                        {t.contact?.name ?? tUi(lang, "ui_customer")}
                      </td>
                    ) : null}
                    {!isMobile ? (
                      <td style={{ ...td, color: colors.textSecondary }}>
                        {CHANNEL_LABELS[t.channel] ?? t.channel}
                      </td>
                    ) : null}
                    <td style={{ ...td, color: colors.textSecondary, whiteSpace: "nowrap" }}>
                      {timeAgo(t.updatedAt)}
                    </td>
                    {!isMobile ? (
                      <td style={{ ...td, color: colors.textSecondary }}>
                        {tUi(lang, priorityKey(t.priority))}
                      </td>
                    ) : null}
                    {!isMobile ? (
                      <td style={{ ...td, color: colors.textSecondary }}>
                        {t.assignee?.name ?? tUi(lang, "ui_unassigned")}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </ConsoleShell>
  );
}

function RailHeading({ children }: { children: ReactNode }) {
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

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
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
