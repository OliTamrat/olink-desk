"use client";
// One customer's record.
//
// A page with its own URL, not an expander inside a list — so an agent can
// send a colleague a link to a person, and so the browser's back button means
// something. The directory answers "who do we know"; this answers "who is
// this, and what have they been dealing with".
//
// The things it can DO all exist because the alternative is worse: editing (a
// misspelled name was permanent until this page existed), notes (the column
// was in the schema with nowhere to type one), starting a ticket already
// attached to them (a known caller should never be re-identified from
// scratch), and — for an administrator — answering the two requests a data
// subject is entitled to make: show me what you hold, and delete it.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  Badge,
  colors,
  ConsoleShell,
  layout,
  tUi,
  ui,
  useConsoleLanguage,
  useMe,
} from "../../../lib/console-ui";
import { CHANNEL_LABELS, statusKey, timeAgo } from "../../../lib/tickets";

const LANGS = [
  { code: "en", name: "English" },
  { code: "am", name: "አማርኛ" },
  { code: "om", name: "Afaan Oromoo" },
  { code: "ti", name: "ትግርኛ" },
  { code: "so", name: "Soomaali" },
  { code: "sw", name: "Kiswahili" },
] as const;

interface Detail {
  id: string;
  name: string | null;
  phone: string;
  phoneDisplay: string;
  email: string | null;
  language: string;
  notes: string | null;
  createdAt: string;
  erasedAt: string | null;
  openCount: number;
  totalCount: number;
  channels: string[];
  tickets: Array<{
    id: string;
    number: number;
    subject: string | null;
    status: string;
    priority: string;
    channel: string;
    createdAt: string;
  }>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ minWidth: 92 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: colors.textPrimary, lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function CustomerPage() {
  const [lang, setLang] = useConsoleLanguage();
  const me = useMe();
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [c, setC] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: "", phone: "", email: "", language: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const canWrite = !!me && ["AGENT", "SUPERVISOR", "ADMIN"].includes(me.user.role);
  // A subject-access response is a document the organisation signs its name
  // to; erasure is irreversible and arrives as a legal request rather than a
  // step in handling a ticket. Both mirror the roles the routes enforce —
  // hiding a control the server would refuse is the point, not decoration.
  const canExport = !!me && ["SUPERVISOR", "ADMIN"].includes(me.user.role);
  const canErase = !!me && me.user.role === "ADMIN";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`/api/contacts/${params.id}`);
      if (resp.ok) setC(((await resp.json()) as { contact: Detail }).contact);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  function startEditing() {
    if (!c) return;
    // Seeded from the DISPLAY form, so the agent edits the number the way they
    // say it. It normalises back on save.
    setDraft({
      name: c.name ?? "",
      phone: c.phoneDisplay,
      email: c.email ?? "",
      language: c.language,
      notes: c.notes ?? "",
    });
    setError("");
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const resp = await fetch(`/api/contacts/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = (await resp.json()) as { error?: string };
      if (!resp.ok) throw new Error(data.error ?? String(resp.status));
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ConsoleShell
      lang={lang}
      onLang={setLang}
      me={me}
      active="customers"
      context={c ? <ReachRail c={c} lang={lang} /> : undefined}
    >
      <div style={{ ...layout.wide, display: "grid", gap: 16 }}>
        <Link
          href="/customers"
          style={{ fontSize: 13, color: colors.textSecondary, textDecoration: "none" }}
        >
          ← {tUi(lang, "ui_customer_back")}
        </Link>

        {loading ? (
          <div style={{ ...ui.card, color: colors.textMuted }}>{tUi(lang, "ui_loading")}</div>
        ) : !c ? (
          <div style={{ ...ui.card, color: colors.textSecondary }}>
            {tUi(lang, "ui_customers_none")}
          </div>
        ) : (
          <>
            {saved ? <div style={ui.ok}>{tUi(lang, "ui_customer_saved")}</div> : null}
            {error ? <div style={ui.error}>{error}</div> : null}

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <h1 style={{ ...ui.h1, margin: 0 }}>
                    {c.name || c.phoneDisplay || c.email || tUi(lang, "ui_erased_badge")}
                  </h1>
                  {c.erasedAt ? (
                    // Wrapped rather than passed through: Badge takes only
                    // `tone` and `children`, so a data attribute on it is
                    // silently dropped — and a check hung on that attribute
                    // fails while the badge is on screen, which is a check
                    // measuring the wrong thing.
                    <span data-erased-badge>
                      <Badge tone="muted">{tUi(lang, "ui_erased_badge")}</Badge>
                    </span>
                  ) : null}
                </div>
                <p style={{ ...ui.sub, marginBottom: 0, marginTop: 4 }}>
                  {c.erasedAt
                    ? tUi(lang, "ui_erased_on", {
                        date: new Date(c.erasedAt).toLocaleDateString(),
                      })
                    : tUi(lang, "ui_customer_since", {
                        date: new Date(c.createdAt).toLocaleDateString(),
                      })}
                </p>
              </div>
              {/* Every action here is hidden once the record is erased. There
                  is nobody left to open a ticket for, nothing left to edit,
                  and nothing left to export — offering them would invite an
                  agent to start rebuilding the identity that was just
                  destroyed. */}
              {canWrite && !c.erasedAt ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {/* The obvious action when somebody you already know rings
                      again. Carrying the id means they are not re-identified. */}
                  <button
                    style={ui.button}
                    onClick={() => router.push(`/inbox/new?contact=${c.id}`)}
                  >
                    {tUi(lang, "ui_customer_new_ticket")}
                  </button>
                  {!editing ? (
                    <button style={ui.buttonGhost} onClick={startEditing}>
                      {tUi(lang, "ui_customer_edit")}
                    </button>
                  ) : null}
                  {canExport ? (
                    // A plain link, not a fetch: the response carries a
                    // Content-Disposition and the browser's own download is
                    // the one path that behaves the same on every device.
                    <a
                      href={`/api/contacts/${c.id}/export`}
                      style={{ ...ui.buttonGhost, display: "inline-block", textDecoration: "none" }}
                      data-contact-export
                    >
                      {tUi(lang, "ui_export_customer")}
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div style={{ ...ui.card, display: "flex", gap: 28, flexWrap: "wrap" }}>
              <Stat label={tUi(lang, "ui_customer_open_tickets")} value={c.openCount} />
              <Stat label={tUi(lang, "ui_customer_total_tickets")} value={c.totalCount} />
            </div>

            {editing ? (
              <div style={{ ...ui.card, display: "grid", gap: 12 }}>
                <div>
                  <label style={ui.label}>{tUi(lang, "ui_customer_phone")}</label>
                  <input
                    style={ui.input}
                    value={draft.phone}
                    onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                    aria-label={tUi(lang, "ui_customer_phone")}
                  />
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: colors.textMuted }}>
                    {tUi(lang, "ui_customer_phone_hint")}
                  </p>
                </div>
                <div>
                  <label style={ui.label}>{tUi(lang, "ui_customer_name")}</label>
                  <input
                    style={ui.input}
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    aria-label={tUi(lang, "ui_customer_name")}
                  />
                </div>
                <div>
                  <label style={ui.label}>{tUi(lang, "ui_customer_email")}</label>
                  <input
                    style={ui.input}
                    value={draft.email}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                    aria-label={tUi(lang, "ui_customer_email")}
                  />
                </div>
                <div>
                  <label style={ui.label}>{tUi(lang, "ui_customer_language")}</label>
                  <select
                    style={ui.input}
                    value={draft.language}
                    onChange={(e) => setDraft({ ...draft, language: e.target.value })}
                    aria-label={tUi(lang, "ui_customer_language")}
                  >
                    {LANGS.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={ui.label}>{tUi(lang, "ui_customer_notes")}</label>
                  <textarea
                    rows={4}
                    style={{
                      ...ui.input,
                      fontSize: 14,
                      lineHeight: 1.6,
                      resize: "vertical",
                      fontFamily: "inherit",
                    }}
                    value={draft.notes}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    aria-label={tUi(lang, "ui_customer_notes")}
                  />
                  {/* An agent unsure whether the customer can see this will
                      write nothing useful, so it says so. */}
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: colors.textMuted }}>
                    {tUi(lang, "ui_customer_notes_hint")}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={ui.button} disabled={saving} onClick={() => void save()}>
                    {saving ? tUi(lang, "ui_saving") : tUi(lang, "ui_save")}
                  </button>
                  <button style={ui.buttonGhost} onClick={() => setEditing(false)}>
                    {tUi(lang, "ui_macro_cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ ...ui.card, display: "grid", gap: 10 }}>
                <Row label={tUi(lang, "ui_customer_phone")} value={c.phoneDisplay} />
                <Row label={tUi(lang, "ui_customer_email")} value={c.email ?? "—"} />
                <Row
                  label={tUi(lang, "ui_customer_language")}
                  value={LANGS.find((l) => l.code === c.language)?.name ?? c.language}
                />
                <div>
                  <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 4 }}>
                    {tUi(lang, "ui_customer_notes")}
                  </div>
                  <div
                    style={{
                      fontSize: 13.5,
                      lineHeight: 1.6,
                      color: c.notes ? colors.textBody : colors.textMuted,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {c.notes || tUi(lang, "ui_customer_no_notes")}
                  </div>
                </div>
              </div>
            )}

            <div style={{ ...ui.card, display: "grid", gap: 10 }}>
              <strong style={{ fontSize: 14, color: colors.textPrimary }}>
                {tUi(lang, "ui_customer_history")}
              </strong>
              {c.tickets.length === 0 ? (
                <div style={{ fontSize: 13, color: colors.textSecondary }}>
                  {tUi(lang, "ui_customer_no_history")}
                </div>
              ) : (
                c.tickets.map((t) => (
                  <Link
                    key={t.id}
                    href={`/inbox?ticket=${t.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                      padding: "9px 0",
                      borderTop: `1px solid ${colors.border}`,
                      textDecoration: "none",
                      color: colors.textBody,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: colors.textMuted, minWidth: 34 }}>#{t.number}</span>
                    <span style={{ flex: "1 1 200px", minWidth: 0, color: colors.textPrimary }}>
                      {t.subject ?? "—"}
                    </span>
                    <Badge tone={t.status === "RESOLVED" || t.status === "CLOSED" ? "muted" : "info"}>
                      {tUi(lang, statusKey(t.status))}
                    </Badge>
                    <span style={{ fontSize: 12, color: colors.textMuted }}>
                      {CHANNEL_LABELS[t.channel] ?? t.channel} · {timeAgo(t.createdAt)}
                    </span>
                  </Link>
                ))
              )}
            </div>

            {canErase && !c.erasedAt ? (
              <ErasePanel contactId={c.id} lang={lang} onErased={load} />
            ) : null}
          </>
        )}
      </div>
    </ConsoleShell>
  );
}

/**
 * The rail answers a question the detail card does not: CAN the desk message
 * this person? A phone number on file is not the same as a channel they have
 * written in on — a customer who exists only because staff logged calls has
 * contact details and no way to be reached, and an agent needs to know that
 * before promising a reply.
 *
 * The two links are the operator's own phone and mail client on purpose. A
 * message sent from there is NOT on the ticket, which is exactly why they sit
 * here under "how to reach them" rather than next to the reply box.
 */
function ReachRail({ c, lang }: { c: Detail; lang: Parameters<typeof tUi>[0] }) {
  return (
    <div style={{ ...ui.card, display: "grid", gap: 12 }}>
      <strong style={{ fontSize: 14, color: colors.textPrimary }}>
        {tUi(lang, "ui_customer_reach")}
      </strong>

      {c.channels.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: colors.textSecondary }}>
          {tUi(lang, "ui_customer_no_channels")}
        </p>
      ) : (
        <div>
          <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
            {tUi(lang, "ui_customer_channels_used")}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {c.channels.map((ch) => (
              <Badge key={ch} tone="success">
                {CHANNEL_LABELS[ch] ?? ch}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 6 }}>
        {c.phone ? (
          <a href={`tel:${c.phone}`} style={{ ...ui.buttonGhost, textAlign: "center", textDecoration: "none" }}>
            {tUi(lang, "ui_customer_call")}
          </a>
        ) : null}
        {c.email ? (
          <a href={`mailto:${c.email}`} style={{ ...ui.buttonGhost, textAlign: "center", textDecoration: "none" }}>
            {tUi(lang, "ui_customer_email_them")}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 12, fontSize: 13.5 }}>
      <span style={{ color: colors.textMuted, minWidth: 150 }}>{label}</span>
      <span style={{ color: colors.textPrimary, minWidth: 0, wordBreak: "break-word" }}>
        {value}
      </span>
    </div>
  );
}

/**
 * Erasure, made deliberate.
 *
 * Two gates rather than one confirm dialog. The first is opening the panel at
 * all — it is closed until asked for, so nobody reaches the destructive
 * control while looking for something else. The second is typing the word,
 * which is the standard defence against a confirmation that has stopped being
 * read; a browser `confirm()` is dismissed reflexively by anyone who has used
 * one before.
 *
 * The word is TRANSLATED. Comparing against the English "ERASE" would ask an
 * Amharic-speaking administrator to type a word the page never showed them,
 * which is not a safety gate — it is a lockout.
 */
function ErasePanel({
  contactId,
  lang,
  onErased,
}: {
  contactId: string;
  lang: Parameters<typeof tUi>[0];
  onErased: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  const word = tUi(lang, "ui_erase_confirm_word");
  // Case-insensitively, and trimmed: the gate is against absent-mindedness,
  // not against a caps-lock key. Ge'ez has no case at all, so a case-sensitive
  // comparison would be a rule that only ever caught Latin-script languages.
  const armed = typed.trim().toLocaleLowerCase() === word.toLocaleLowerCase();

  async function erase() {
    setBusy(true);
    setFailure("");
    try {
      const resp = await fetch(`/api/contacts/${contactId}/erase`, { method: "POST" });
      const body = (await resp.json().catch(() => null)) as
        | { error?: string; messagesRedacted?: number; attachmentsRedacted?: number }
        | null;
      if (!resp.ok) {
        setFailure(
          tUi(lang, "ui_erase_failed", { error: body?.error ?? `HTTP ${resp.status}` }),
        );
        return;
      }
      // Reloaded rather than patched in place: the record has become a
      // different thing, and every control on the page keys off that.
      await onErased();
    } catch (e) {
      setFailure(tUi(lang, "ui_erase_failed", { error: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        ...ui.card,
        display: "grid",
        gap: 10,
        borderColor: open ? colors.danger : colors.border,
      }}
      data-erase-panel
    >
      <strong style={{ fontSize: 14, color: colors.textPrimary }}>
        {tUi(lang, "ui_erase_customer")}
      </strong>
      <p style={{ margin: 0, fontSize: 13, color: colors.textSecondary, lineHeight: 1.55 }}>
        {tUi(lang, "ui_erase_blurb")}
      </p>

      {failure ? <div style={ui.error}>{failure}</div> : null}

      {!open ? (
        <div>
          <button
            data-erase-open
            style={{ ...ui.buttonGhost, color: colors.danger, borderColor: colors.danger }}
            onClick={() => setOpen(true)}
          >
            {tUi(lang, "ui_erase_customer")}
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <label style={ui.label} htmlFor="erase-confirm">
            {tUi(lang, "ui_erase_confirm", { word })}
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              id="erase-confirm"
              data-erase-confirm
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              style={{ ...ui.input, maxWidth: 220 }}
            />
            <button
              data-erase-submit
              disabled={!armed || busy}
              onClick={() => void erase()}
              style={{
                ...ui.button,
                background: armed ? colors.danger : colors.surfaceRaised,
                color: armed ? colors.onAccent : colors.textMuted,
                cursor: armed && !busy ? "pointer" : "default",
              }}
            >
              {tUi(lang, "ui_erase_customer")}
            </button>
            <button style={ui.buttonGhost} onClick={() => { setOpen(false); setTyped(""); }}>
              {tUi(lang, "ui_cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
