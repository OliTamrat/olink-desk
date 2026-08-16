"use client";
// The agent workspace, v2 — the Zendesk agent-console shape (ADR 0006):
//
//   [app nav] [views + counts] [ TABLE of tickets                     ]
//   [app nav] [views + counts] [ properties | conversation | customer ]
//
// List and ticket are separate screens rather than side-by-side panes: an
// open ticket gets the whole width, which is what makes a three-column
// detail readable instead of three cramped strips.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
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

// Language names in their own script — what an agent recognises at a glance.
const LANG_NAMES: Record<string, string> = {
  en: "English",
  am: "አማርኛ",
  om: "Afaan Oromoo",
  ti: "ትግርኛ",
  so: "Soomaali",
  sw: "Kiswahili",
};

const STATUSES = ["NEW", "OPEN", "PENDING", "RESOLVED", "CLOSED"] as const;
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
type SortKey = "updated" | "created" | "number" | "status" | "priority";

interface MacroRow {
  id: string;
  title: string;
  category: string | null;
  isActive: boolean;
}

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

function InboxWorkspace() {
  const [lang, setLang] = useConsoleLanguage();
  const me = useMe();
  const { isMobile, roomy } = useViewport();

  // Drill-down: every number on the dashboard and the wallboard links here
  // with its filters in the URL. Reading them as the INITIAL state (rather
  // than syncing both ways) keeps the link shareable and the back button
  // honest, without the filter controls fighting the address bar on every
  // keystroke.
  const params = useSearchParams();
  const initial = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const v = params.get(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  };

  const [view, setView] = useState<ViewKey>(
    initial("view", VIEWS.map((v) => v.key), "open"),
  );
  const [counts, setCounts] = useState<Record<ViewKey, number> | null>(null);
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [channel, setChannel] = useState(params.get("channel") ?? "");
  const [assignee, setAssignee] = useState(params.get("assignee") ?? "");
  // Seeded from the URL like every other filter. This was missed at first —
  // the top bar's search navigated here with ?q=… and the list ignored it,
  // so the search "worked" and returned everything. A drill-down that lands
  // unfiltered is worse than no drill-down: it looks like an answer.
  const [q, setQ] = useState(params.get("q") ?? "");
  const [debouncedQ, setDebouncedQ] = useState(params.get("q") ?? "");
  const [sort, setSort] = useState<SortKey>("updated");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  const [count, setCount] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // An alert links straight to its ticket, so a ticket id in the URL opens
  // the ticket rather than dropping the agent on a list to find it again.
  const [selectedId, setSelectedId] = useState<string | null>(params.get("ticket"));
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [queues, setQueues] = useState<Array<{ id: string; name: string }>>([]);
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([]);
  const [meId, setMeId] = useState<string | null>(null);

  // Filters that arrive ONLY from a drill-down. They have no control of
  // their own — a link is the only way in — so they are surfaced as a
  // removable chip and cleared with the rest.
  const [queue, setQueue] = useState(params.get("queue") ?? "");
  const [tag, setTag] = useState(params.get("tag") ?? "");
  const [tagDraft, setTagDraft] = useState("");
  // Bulk macro: a preview must exist before anything is sent, so the review
  // state and the send state are separate. `bulkPreview` being non-null IS
  // the "we have looked at this" gate.
  const [bulkMacroId, setBulkMacroId] = useState("");
  const [bulkPreview, setBulkPreview] = useState<{
    preview: Array<{
      language: string;
      count: number;
      fellBack: number;
      fallbackFrom: string[];
      sample: string;
    }>;
    total: number;
    undeliverable: Array<{ number: number; reason: string }>;
  } | null>(null);
  // Naming an anonymous requester. Kept beside the ticket rather than in the
  // customer directory: the moment an agent learns who somebody is, is while
  // reading what they wrote.
  const [identifying, setIdentifying] = useState(false);
  const [identifyPhone, setIdentifyPhone] = useState("");
  const [identifyName, setIdentifyName] = useState("");
  const [identifyError, setIdentifyError] = useState("");
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  // Re-read the URL whenever it CHANGES, not only on mount.
  //
  // Next reuses a mounted page across a client-side navigation to the same
  // route, so reading the params once as initial state meant an in-app
  // drill-down did nothing at all: clicking a tag while a ticket was open
  // left the ticket open and the filter unapplied. Since nothing here pushes
  // state back INTO the url, this stays one-way and the filter controls never
  // fight the address bar — the reason the initial-only version was chosen.
  const search = params.toString();
  useEffect(() => {
    const next = new URLSearchParams(search);
    const pick = (k: string) => next.get(k) ?? "";
    setView((prev) => {
      const v = next.get("view");
      return v && VIEWS.some((x) => x.key === v) ? (v as ViewKey) : prev;
    });
    setStatus(pick("status"));
    setChannel(pick("channel"));
    setAssignee(pick("assignee"));
    setQueue(pick("queue"));
    setSla(pick("sla"));
    setTag(pick("tag"));
    setAwaiting(next.get("awaiting") === "1");
    setQ(pick("q"));
    setDebouncedQ(pick("q"));
    // A drill-down to a LIST must close whatever ticket was open, or the
    // agent lands on the ticket they were already reading and concludes the
    // link is broken. A drill-down to a ticket names one instead.
    setSelectedId(next.get("ticket"));
  }, [search]);
  const [sla, setSla] = useState(params.get("sla") ?? "");
  const [awaiting, setAwaiting] = useState(params.get("awaiting") === "1");

  // Macros. Loaded once for the session — the list is small and an agent
  // opening the picker must not wait on a round trip mid-conversation.
  const [macros, setMacros] = useState<MacroRow[]>([]);
  const [macroOpen, setMacroOpen] = useState(false);
  const [macroQ, setMacroQ] = useState("");
  const [macroNote, setMacroNote] = useState<string | null>(null);
  const [macroWarn, setMacroWarn] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

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
    if (queue) p.set("queue", queue);
    if (tag) p.set("tag", tag);
    if (sla) p.set("sla", sla);
    if (awaiting) p.set("awaiting", "1");
    return p.toString();
  }, [view, sort, dir, status, channel, assignee, debouncedQ, queue, sla, awaiting, tag]);

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

  useEffect(() => {
    void (async () => {
      try {
        const resp = await fetch("/api/macros");
        if (!resp.ok) return;
        const data = (await resp.json()) as { macros?: MacroRow[] };
        setMacros((data.macros ?? []).filter((m) => m.isActive));
      } catch {
        // A macro list that will not load must not break replying: the
        // composer still works, the shortcut is simply absent.
      }
    })();
  }, []);

  // Insert a macro into the composer. It NEVER sends — the agent presses
  // send. The rendered text comes back in the CUSTOMER's language, and if
  // the macro had no body in it, the warning is shown here, before sending,
  // rather than discovered in the customer's reply.
  async function applyMacro(macro: MacroRow) {
    if (!selectedId) return;
    setMacroOpen(false);
    setMacroQ("");
    try {
      const resp = await fetch(`/api/tickets/${selectedId}/macro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ macroId: macro.id }),
      });
      const data = (await resp.json()) as {
        text?: string;
        language?: string;
        fellBack?: boolean;
        requestedLanguage?: string;
        setStatus?: string | null;
        error?: string;
      };
      if (!resp.ok || !data.text) {
        setSendError(
          tUi(lang, "ui_reply_failed", { error: data.error ?? `HTTP ${resp.status}` }),
        );
        return;
      }
      // A macro is a public reply by definition; applying one while the
      // composer sits in note mode would silently turn the bank's words
      // into an internal note nobody sends.
      setInternal(false);
      setReply(data.text);
      setPendingStatus(data.setStatus ?? null);
      setMacroNote(
        tUi(lang, "ui_macro_inserted_in", { lang: LANG_NAMES[data.language ?? "en"] ?? "" }),
      );
      setMacroWarn(
        data.fellBack
          ? tUi(lang, "ui_macro_fallback_warning", {
              want: LANG_NAMES[data.requestedLanguage ?? "en"] ?? "",
              got: LANG_NAMES[data.language ?? "en"] ?? "",
            })
          : null,
      );
    } catch (err) {
      setSendError(tUi(lang, "ui_reply_failed", { error: String(err) }));
    }
  }

  async function identifyCustomer() {
    setIdentifyError("");
    // Find-or-create first: if this number is already on file the ticket must
    // join THAT record, not spawn a second one for the same person.
    const made = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: identifyPhone, name: identifyName }),
    });
    const data = (await made.json()) as { error?: string; contact?: { id: string } };
    if (!made.ok || !data.contact) {
      setIdentifyError(data.error ?? String(made.status));
      return;
    }
    await fetch(`/api/tickets/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: data.contact.id }),
    });
    setIdentifying(false);
    setIdentifyPhone("");
    setIdentifyName("");
    if (selectedId) await loadDetail(selectedId);
    await loadList();
  }

  async function previewBulkMacro(macroId: string) {
    setBulkMacroId(macroId);
    setBulkResult(null);
    const resp = await fetch("/api/tickets/bulk/macro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...picked], macroId }),
    });
    if (!resp.ok) return;
    setBulkPreview(await resp.json());
  }

  async function commitBulkMacro() {
    if (!bulkPreview || !bulkMacroId) return;
    setBulkSending(true);
    try {
      const resp = await fetch("/api/tickets/bulk/macro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...picked], macroId: bulkMacroId, commit: true }),
      });
      const data = (await resp.json()) as {
        sent: number;
        failed: Array<{ number: number }>;
      };
      // A partial send is reported as a partial send. "40 sent" when 37 were
      // is the failure this wording exists to prevent.
      setBulkResult(
        data.failed.length > 0
          ? tUi(lang, "ui_bulk_macro_partial", {
              sent: data.sent,
              failed: data.failed.length,
            })
          : tUi(lang, "ui_bulk_macro_sent", { n: data.sent }),
      );
      setBulkPreview(null);
      setBulkMacroId("");
      setPicked(new Set());
      await loadList();
    } finally {
      setBulkSending(false);
    }
  }

  async function addTag() {
    const name = tagDraft.trim();
    if (!selectedId || !name) return;
    const resp = await fetch(`/api/tickets/${selectedId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!resp.ok) {
      const body = (await resp.json().catch(() => null)) as { error?: string } | null;
      setSendError(tUi(lang, "ui_tag_failed", { error: body?.error ?? `HTTP ${resp.status}` }));
      return;
    }
    setTagDraft("");
    await Promise.all([loadDetail(selectedId), loadList()]);
  }

  async function removeTag(tagId: string) {
    if (!selectedId) return;
    await fetch(`/api/tickets/${selectedId}/tags?tagId=${encodeURIComponent(tagId)}`, {
      method: "DELETE",
    });
    await Promise.all([loadDetail(selectedId), loadList()]);
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
        setMacroNote(null);
        setMacroWarn(null);
        // A macro's status change is applied only once the customer has
        // actually received the reply — a ticket must never read RESOLVED
        // because someone opened a draft and walked away.
        if (pendingStatus && !internal) {
          await patchTicket({ status: pendingStatus });
        }
        setPendingStatus(null);
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

  const filtersActive = Boolean(status || channel || assignee || debouncedQ) || queue !== "" || sla !== "" || awaiting || tag !== "";
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
          {/* Satisfaction. Three distinct states, never collapsed into one:
              a score, a survey still unanswered, and no survey at all. Showing
              "Not rated" for a ticket nobody was asked about would read as a
              customer who declined. */}
          {/* Tags. Each one is a LINK to the tickets that share it — the
              founder's drill-down rule applied to the one field whose whole
              purpose is grouping. A tag you cannot click is a label; a tag
              you can click is a report. */}
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
              {tUi(lang, "ui_tags")}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
              {(detail.tags ?? []).length === 0 ? (
                <span style={{ fontSize: 12.5, color: colors.textMuted }}>
                  {tUi(lang, "ui_tag_none")}
                </span>
              ) : (
                (detail.tags ?? []).map((tg) => (
                  <span
                    key={tg.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "3px 4px 3px 8px",
                      borderRadius: 999,
                      border: `1px solid ${colors.border}`,
                      background: colors.surfaceRaised,
                      fontSize: 12,
                    }}
                  >
                    <Link
                      href={`/inbox?view=all&tag=${encodeURIComponent(tg.slug)}`}
                      style={{ color: colors.textBody, textDecoration: "none" }}
                    >
                      {tg.name}
                    </Link>
                    <button
                      aria-label={tUi(lang, "ui_tag_remove")}
                      onClick={() => void removeTag(tg.id)}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: colors.textMuted,
                        cursor: "pointer",
                        fontSize: 13,
                        lineHeight: 1,
                        padding: "0 3px",
                        fontFamily: "inherit",
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addTag();
                }
              }}
              placeholder={tUi(lang, "ui_tag_add")}
              style={{ ...ui.input, fontSize: 13, padding: "6px 9px" }}
            />
          </div>

          <Field
            label={tUi(lang, "ui_satisfaction")}
            value={
              typeof detail.csatScore === "number"
                ? `${"★".repeat(detail.csatScore)}${"☆".repeat(5 - detail.csatScore)}  ${detail.csatScore}/5`
                : detail.csatSentAt
                  ? tUi(lang, "ui_csat_awaiting")
                  : tUi(lang, "ui_csat_none")
            }
          />
        </div>
      </div>
    );

    const customer = (
      <aside
        style={{
          ...ui.card,
          width: "100%",
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
          {/* Drill-down: the rail says who they are, their record says what
              else they have been dealing with. */}
          {detail.contactId ? (
            <Link
              href={`/customers/${detail.contactId}`}
              style={{ fontSize: 12, color: colors.accent, textDecoration: "none" }}
            >
              {tUi(lang, "ui_customer_open_record")} →
            </Link>
          ) : null}
          <Field label={tUi(lang, "ui_language")} value={(detail.language ?? "").toUpperCase()} />
          {/* Almost every ticket arrives anonymous — a widget session id and a
              Telegram chat id are channel identities, not people — so this is
              where a stranger becomes a customer with a history. It also
              teaches the CONVERSATION who they are, so the next message from
              them already knows. */}
          {!detail.contact ? (
            <div style={{ marginTop: 4 }}>
              <button
                style={{ ...ui.buttonGhost, width: "100%", fontSize: 12 }}
                onClick={() => setIdentifying(true)}
              >
                {tUi(lang, "ui_identify_customer")}
              </button>
              <p style={{ margin: "6px 0 0", fontSize: 11, color: colors.textMuted, lineHeight: 1.5 }}>
                {tUi(lang, "ui_identify_hint")}
              </p>
            </div>
          ) : null}
          {identifying && !detail.contact ? (
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              <input
                style={{ ...ui.input, fontSize: 13 }}
                value={identifyPhone}
                onChange={(e) => setIdentifyPhone(e.target.value)}
                placeholder="0911 234 567"
                aria-label={tUi(lang, "ui_customer_phone")}
              />
              <input
                style={{ ...ui.input, fontSize: 13 }}
                value={identifyName}
                onChange={(e) => setIdentifyName(e.target.value)}
                placeholder={tUi(lang, "ui_customer_name")}
                aria-label={tUi(lang, "ui_customer_name")}
              />
              <button
                style={{ ...ui.button, fontSize: 12 }}
                onClick={() => void identifyCustomer()}
              >
                {tUi(lang, "ui_save")}
              </button>
              {identifyError ? (
                <div style={{ ...ui.error, fontSize: 12 }}>{identifyError}</div>
              ) : null}
            </div>
          ) : null}
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
      <ConsoleShell
        lang={lang}
        onLang={setLang}
        me={me}
        active="inbox"
        sidePanel={viewsPanel}
        // The customer column used to be DROPPED below `roomy`, so on a
        // laptop it did not move — it vanished, with no way to ask for it
        // back. As the shell's context panel it docks when there is room
        // and slides over when there is not.
        context={customer}
      >
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
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
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
                {macros.length > 0 && (
                  <div style={{ position: "relative", marginLeft: "auto" }}>
                    <button
                      onClick={() => setMacroOpen(!macroOpen)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 6,
                        border: `1px solid ${macroOpen ? colors.accent : colors.border}`,
                        background: macroOpen ? colors.surfaceHover : "transparent",
                        color: macroOpen ? colors.textPrimary : colors.textSecondary,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {tUi(lang, "ui_macro_apply")}
                    </button>
                    {macroOpen && (
                      <div
                        style={{
                          position: "absolute",
                          bottom: "calc(100% + 6px)",
                          right: 0,
                          width: 300,
                          maxHeight: 300,
                          overflowY: "auto",
                          background: colors.surface,
                          border: `1px solid ${colors.borderStrong}`,
                          borderRadius: 8,
                          boxShadow: "0 12px 32px rgba(0,0,0,.5)",
                          padding: 8,
                          zIndex: 50,
                        }}
                      >
                        <input
                          autoFocus
                          value={macroQ}
                          onChange={(e) => setMacroQ(e.target.value)}
                          placeholder={tUi(lang, "ui_macro_search")}
                          style={{ ...ui.input, fontSize: 13, padding: "7px 9px" }}
                        />
                        <div style={{ marginTop: 6, display: "grid", gap: 2 }}>
                          {macros
                            .filter((m) =>
                              `${m.title} ${m.category ?? ""}`
                                .toLowerCase()
                                .includes(macroQ.trim().toLowerCase()),
                            )
                            .map((m) => (
                              <button
                                key={m.id}
                                onClick={() => void applyMacro(m)}
                                style={{
                                  textAlign: "left",
                                  padding: "8px 9px",
                                  borderRadius: 6,
                                  border: "none",
                                  background: "transparent",
                                  color: colors.textBody,
                                  fontSize: 13,
                                  cursor: "pointer",
                                  fontFamily: "inherit",
                                }}
                              >
                                <div style={{ color: colors.textPrimary }}>{m.title}</div>
                                {m.category && (
                                  <div style={{ fontSize: 11, color: colors.textMuted }}>
                                    {m.category}
                                  </div>
                                )}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* The fallback warning is a warning, not a note: it says the
                  customer writes in a language this macro does not have. It
                  has to be readable BEFORE the agent presses send. */}
              {macroWarn ? (
                <div style={{ ...ui.warn, fontSize: 12 }}>{macroWarn}</div>
              ) : macroNote ? (
                <div style={{ fontSize: 12, color: colors.textMuted }}>{macroNote}</div>
              ) : null}
              {/* No conversation means no transport. Saying so here — rather
                  than letting the agent type a reply and discover on send that
                  it went nowhere — is the same honesty the bulk preview owes
                  its undeliverable list. An internal note is still fine: it is
                  for colleagues, not the customer. */}
              {!detail.conversation && !internal ? (
                <div style={{ ...ui.warn, fontSize: 12 }}>
                  {tUi(lang, "ui_ticket_no_reply_warning")}
                </div>
              ) : null}
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
                  // A ticket with no conversation has no transport at all, so
                  // the button is disabled rather than left live under a
                  // warning — a warning plus a working-looking button is still
                  // a composer that fails on send. An INTERNAL note is fine:
                  // it is for colleagues, and never leaves the desk.
                  disabled={sending || !reply.trim() || (!detail.conversation && !internal)}
                  style={{
                    ...ui.button,
                    alignSelf: "flex-end",
                    background: internal ? colors.warn : colors.accent,
                    color: internal ? colors.bg : colors.onAccent,
                    opacity:
                      sending || !reply.trim() || (!detail.conversation && !internal) ? 0.6 : 1,
                  }}
                >
                  {sending ? tUi(lang, "ui_sending") : tUi(lang, "ui_send")}
                </button>
              </div>
            </div>
          </div>

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
              // The drill-only filters clear with the rest. A "Clear" that
              // leaves an invisible filter applied is worse than no button.
              setQueue("");
              setTag("");
              setSla("");
              setAwaiting(false);
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
          {/* Apply a macro to everything selected. Choosing one only opens
              the review — it never sends. */}
          {macros.length > 0 ? (
            <select
              aria-label={tUi(lang, "ui_bulk_macro")}
              value=""
              onChange={(e) => {
                if (e.target.value) void previewBulkMacro(e.target.value);
              }}
              style={{ ...ui.buttonGhost, padding: "6px 10px", fontSize: 12 }}
            >
              <option value="">{tUi(lang, "ui_bulk_macro")}</option>
              {macros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          ) : null}
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

      {/* The review. In bulk there is no composer, so this screen is the
          ONLY place the words are read before they reach real people. It is
          grouped by LANGUAGE because that is the axis an agent cannot
          predict: one button sends several different texts, and the agent
          reads at most one of them fluently. */}
      {bulkPreview ? (
        <div style={{ ...ui.card, marginBottom: 12, display: "grid", gap: 12 }}>
          <strong style={{ color: colors.textPrimary, fontSize: 15 }}>
            {tUi(lang, "ui_bulk_macro_review")}
          </strong>

          {bulkPreview.preview.length === 0 ? (
            <div style={ui.warn}>{tUi(lang, "ui_bulk_macro_nothing")}</div>
          ) : (
            bulkPreview.preview.map((g) => (
              <div
                key={g.language}
                style={{
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  padding: 12,
                  background: colors.surfaceRaised,
                }}
              >
                <div style={{ fontSize: 13, color: colors.textBody, marginBottom: 6 }}>
                  {tUi(lang, "ui_bulk_macro_group", {
                    n: g.count,
                    lang: LANG_NAMES[g.language] ?? g.language,
                  })}
                </div>
                {/* The warning names the language they WROTE in, because that
                    is the one somebody would have to write for this to stop
                    happening. Naming the language they are being given
                    instead says nothing an agent can act on. */}
                {g.fellBack > 0 ? (
                  <div style={{ ...ui.warn, fontSize: 12, marginBottom: 8 }}>
                    {tUi(lang, "ui_bulk_macro_fellback", {
                      n: g.fellBack,
                      from: g.fallbackFrom
                        .map((code) => LANG_NAMES[code] ?? code)
                        .join(", "),
                      lang: LANG_NAMES[g.language] ?? g.language,
                    })}
                  </div>
                ) : null}
                {/* A real rendered sample, not the macro template: the
                    placeholders are already filled, so this is what somebody
                    actually receives. */}
                <p
                  style={{
                    margin: 0,
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    color: colors.textPrimary,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {g.sample}
                </p>
              </div>
            ))
          )}

          {bulkPreview.undeliverable.length > 0 ? (
            <div style={{ ...ui.warn, fontSize: 12 }}>
              {tUi(lang, "ui_bulk_macro_undeliverable", {
                n: bulkPreview.undeliverable.length,
              })}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => void commitBulkMacro()}
              disabled={bulkSending || bulkPreview.total === 0}
              style={{
                ...ui.button,
                opacity: bulkSending || bulkPreview.total === 0 ? 0.6 : 1,
              }}
            >
              {bulkSending
                ? tUi(lang, "ui_bulk_macro_sending")
                : tUi(lang, "ui_bulk_macro_send", { n: bulkPreview.total })}
            </button>
            <button
              style={ui.buttonGhost}
              onClick={() => {
                setBulkPreview(null);
                setBulkMacroId("");
              }}
            >
              {tUi(lang, "ui_macro_cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {bulkResult ? (
        <div style={{ ...ui.ok, marginBottom: 12 }}>{bulkResult}</div>
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

/**
 * `useSearchParams` opts a page out of static generation, and Next requires
 * the boundary to be explicit rather than inferred — the production build
 * fails on it even though typecheck is perfectly happy. Another case of a
 * green check not being the check that matters.
 *
 * The fallback is deliberately empty: this is a client-rendered workspace
 * that fetches everything anyway, so a spinner here would flash for one frame
 * and then be replaced by the screen's own loading state.
 */
export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <InboxWorkspace />
    </Suspense>
  );
}
