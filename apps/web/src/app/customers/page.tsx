"use client";
// The customer directory.
//
// Not a CRM. The only reason this screen exists is so that the second time
// somebody contacts the desk, whoever picks it up already knows them — which
// is why every row leads with the name and the ticket count rather than with
// fields, and why opening a customer shows their history rather than a form.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  colors,
  ConsoleShell,
  tUi,
  ui,
  useConsoleLanguage,
  useMe,
} from "../../lib/console-ui";

const LANGS = [
  { code: "en", name: "English" },
  { code: "am", name: "አማርኛ" },
  { code: "om", name: "Afaan Oromoo" },
  { code: "ti", name: "ትግርኛ" },
  { code: "so", name: "Soomaali" },
  { code: "sw", name: "Kiswahili" },
] as const;

interface Row {
  id: string;
  name: string | null;
  phone: string;
  phoneDisplay: string;
  email: string | null;
  language: string;
  ticketCount: number;
}

interface Detail extends Row {
  notes: string | null;
  tickets: Array<{
    id: string;
    number: number;
    subject: string | null;
    status: string;
    channel: string;
    createdAt: string;
  }>;
}

export default function CustomersPage() {
  const [lang, setLang] = useConsoleLanguage();
  const me = useMe();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", phone: "", email: "", language: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);

  const canWrite = !!me && ["AGENT", "SUPERVISOR", "ADMIN"].includes(me.user.role);

  const load = useCallback(async (term: string) => {
    setLoading(true);
    try {
      const resp = await fetch(`/api/contacts?q=${encodeURIComponent(term)}`);
      if (resp.ok) setRows(((await resp.json()) as { contacts: Row[] }).contacts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Debounced so a search runs on what was typed, not on every keystroke.
    const id = setTimeout(() => void load(q), 250);
    return () => clearTimeout(id);
  }, [q, load]);

  // "+ Add → New customer" lands here with ?new=1 and the form already open,
  // so the menu item does what it says rather than dropping the agent on a
  // list they then have to find a button on.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "1") setAdding(true);
  }, []);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    void (async () => {
      const resp = await fetch(`/api/contacts/${openId}`);
      if (resp.ok) setDetail(((await resp.json()) as { contact: Detail }).contact);
    })();
  }, [openId]);

  async function save() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const resp = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = (await resp.json()) as { error?: string; created?: boolean };
      if (!resp.ok) throw new Error(data.error ?? String(resp.status));
      // Matching an existing customer is the RIGHT outcome, not a failure —
      // but the agent has to know it happened, or they will wonder why their
      // typed name did not stick.
      if (!data.created) setNotice(tUi(lang, "ui_customer_existing"));
      setAdding(false);
      setDraft({ name: "", phone: "", email: "", language: "", notes: "" });
      await load(q);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ConsoleShell lang={lang} onLang={setLang} me={me} active="customers">
      <div style={{ display: "grid", gap: 16, maxWidth: 1100 }}>
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
            <h1 style={ui.h1}>{tUi(lang, "ui_customers")}</h1>
            <p style={{ ...ui.sub, maxWidth: 640 }}>{tUi(lang, "ui_customers_subtitle")}</p>
          </div>
          {canWrite && !adding ? (
            <button style={ui.button} onClick={() => setAdding(true)}>
              {tUi(lang, "ui_add_customer")}
            </button>
          ) : null}
        </div>

        {notice ? <div style={ui.ok}>{notice}</div> : null}
        {error ? <div style={ui.error}>{error}</div> : null}

        {adding ? (
          <div style={{ ...ui.card, display: "grid", gap: 12 }}>
            <div>
              <label style={ui.label}>{tUi(lang, "ui_customer_phone")}</label>
              <input
                style={ui.input}
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                placeholder="0911 234 567"
              />
              {/* Says WHY the number is required. Without this the field reads
                  as bureaucracy and gets filled with anything. */}
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
              />
            </div>
            <div>
              <label style={ui.label}>{tUi(lang, "ui_customer_email")}</label>
              <input
                style={ui.input}
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </div>
            <div>
              <label style={ui.label}>{tUi(lang, "ui_customer_language")}</label>
              <select
                style={ui.input}
                value={draft.language}
                onChange={(e) => setDraft({ ...draft, language: e.target.value })}
              >
                <option value="">—</option>
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={ui.button} disabled={saving} onClick={() => void save()}>
                {saving ? tUi(lang, "ui_saving") : tUi(lang, "ui_save")}
              </button>
              <button style={ui.buttonGhost} onClick={() => setAdding(false)}>
                {tUi(lang, "ui_macro_cancel")}
              </button>
            </div>
          </div>
        ) : null}

        <input
          style={{ ...ui.input, maxWidth: 420 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tUi(lang, "ui_customer_search")}
          aria-label={tUi(lang, "ui_customer_search")}
        />

        {loading ? (
          <div style={{ ...ui.card, color: colors.textMuted }}>{tUi(lang, "ui_loading")}</div>
        ) : rows.length === 0 ? (
          <div style={{ ...ui.card, color: colors.textSecondary }}>
            {tUi(lang, "ui_customers_none")}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {rows.map((c) => (
              <button
                key={c.id}
                onClick={() => setOpenId(c.id === openId ? null : c.id)}
                style={{
                  ...ui.card,
                  padding: 14,
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  borderColor: c.id === openId ? colors.accent : colors.border,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "baseline",
                  }}
                >
                  <strong style={{ color: colors.textPrimary, fontSize: 15 }}>
                    {c.name || c.phoneDisplay}
                  </strong>
                  <span style={{ fontSize: 12, color: colors.textMuted }}>
                    {tUi(lang, "ui_customer_tickets", { n: c.ticketCount })}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 3 }}>
                  {/* The number is shown the way it is said, not the way it is
                      stored. */}
                  {c.phoneDisplay}
                  {c.email ? ` · ${c.email}` : ""}
                </div>

                {c.id === openId && detail ? (
                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: `1px solid ${colors.border}`,
                    }}
                  >
                    <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>
                      {tUi(lang, "ui_customer_history")}
                    </div>
                    {detail.tickets.length === 0 ? (
                      <div style={{ fontSize: 13, color: colors.textSecondary }}>
                        {tUi(lang, "ui_customer_no_history")}
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 6 }}>
                        {detail.tickets.map((t) => (
                          // Drill-down: their history is a way INTO the work,
                          // not a read-only list.
                          <Link
                            key={t.id}
                            href={`/inbox?ticket=${t.id}`}
                            style={{
                              display: "flex",
                              gap: 10,
                              fontSize: 13,
                              color: colors.textBody,
                              textDecoration: "none",
                            }}
                          >
                            <span style={{ color: colors.textMuted }}>#{t.number}</span>
                            <span style={{ flex: 1, minWidth: 0 }}>{t.subject ?? "—"}</span>
                            <span style={{ color: colors.textMuted, fontSize: 12 }}>
                              {t.status}
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}
