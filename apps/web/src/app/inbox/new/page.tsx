"use client";
// Logging a ticket that did not arrive on a channel.
//
// "Log", not "create": the work already happened — somebody rang, somebody
// walked in — and this is the record of it. Until this screen existed, that
// work was invisible, which meant the desk's own reports described only the
// portion of its day that arrived electronically.
//
// The one thing this form must not do is imply a reply is possible. A logged
// call has no channel identity behind it, so the desk genuinely cannot send to
// it, and the warning below is shown BEFORE the ticket is created rather than
// discovered afterwards at a composer that silently fails.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  colors,
  ConsoleShell,
  tUi,
  ui,
  useConsoleLanguage,
  useMe,
} from "../../../lib/console-ui";

const LANGS = [
  { code: "en", name: "English" },
  { code: "am", name: "አማርኛ" },
  { code: "om", name: "Afaan Oromoo" },
  { code: "ti", name: "ትግርኛ" },
  { code: "so", name: "Soomaali" },
  { code: "sw", name: "Kiswahili" },
] as const;

interface Match {
  id: string;
  name: string | null;
  phone: string;
  phoneDisplay: string;
  language: string;
}

export default function NewTicketPage() {
  const [lang, setLang] = useConsoleLanguage();
  const me = useMe();
  const router = useRouter();

  const [channel, setChannel] = useState<"PHONE" | "WALK_IN">("PHONE");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [ticketLang, setTicketLang] = useState("");

  const [customerQuery, setCustomerQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [picked, setPicked] = useState<Match | null>(null);
  const [newName, setNewName] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // "Log a ticket for them" carries the customer's id. Re-identifying somebody
  // the agent just clicked on is the small indignity this avoids.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("contact");
    if (!id) return;
    void (async () => {
      const resp = await fetch(`/api/contacts/${id}`);
      if (!resp.ok) return;
      const found = ((await resp.json()) as { contact: Match }).contact;
      setPicked(found);
      setTicketLang(found.language);
    })();
  }, []);

  const search = useCallback(async (term: string) => {
    if (!term.trim()) {
      setMatches([]);
      return;
    }
    const resp = await fetch(`/api/contacts?q=${encodeURIComponent(term)}`);
    if (resp.ok) setMatches(((await resp.json()) as { contacts: Match[] }).contacts.slice(0, 5));
  }, []);

  useEffect(() => {
    if (picked) return;
    const id = setTimeout(() => void search(customerQuery), 250);
    return () => clearTimeout(id);
  }, [customerQuery, picked, search]);

  async function submit() {
    setSaving(true);
    setError("");
    try {
      const resp = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          subject,
          description,
          priority,
          language: ticketLang,
          // Either an existing customer, or enough to find-or-create one from
          // what the agent typed. Making them go and create the person first
          // is how a call ends before the ticket is written.
          ...(picked
            ? { contactId: picked.id }
            : customerQuery.trim()
              ? { phone: customerQuery, name: newName }
              : {}),
        }),
      });
      const data = (await resp.json()) as { error?: string; ticket?: { id: string; number: number } };
      if (!resp.ok || !data.ticket) throw new Error(data.error ?? String(resp.status));
      router.push(`/inbox?ticket=${data.ticket.id}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <ConsoleShell lang={lang} onLang={setLang} me={me} active="inbox">
      <div style={{ display: "grid", gap: 16, maxWidth: 720 }}>
        <div>
          <h1 style={ui.h1}>{tUi(lang, "ui_new_ticket_title")}</h1>
          <p style={{ ...ui.sub, maxWidth: 620 }}>{tUi(lang, "ui_new_ticket_subtitle")}</p>
        </div>

        {error ? <div style={ui.error}>{error}</div> : null}

        <div style={{ ...ui.card, display: "grid", gap: 14 }}>
          <div>
            <label style={ui.label}>{tUi(lang, "ui_ticket_how")}</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(
                [
                  { value: "PHONE", label: tUi(lang, "ui_channel_phone_call") },
                  { value: "WALK_IN", label: tUi(lang, "ui_channel_walk_in") },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setChannel(opt.value)}
                  style={{
                    ...ui.buttonGhost,
                    borderColor: channel === opt.value ? colors.accent : colors.border,
                    color: channel === opt.value ? colors.textPrimary : colors.textSecondary,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stated up front, not discovered later. A ticket with no channel
              behind it cannot be answered by the desk, and an agent needs to
              know that while deciding what to promise the customer. */}
          <div style={{ ...ui.warn, fontSize: 12 }}>
            {tUi(lang, "ui_ticket_no_reply_warning")}
          </div>

          <div>
            <label style={ui.label}>{tUi(lang, "ui_ticket_customer")}</label>
            {picked ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 11px",
                  borderRadius: 8,
                  border: `1px solid ${colors.accent}`,
                  background: colors.surfaceRaised,
                }}
              >
                <span style={{ fontSize: 13, color: colors.textPrimary }}>
                  {picked.name || picked.phoneDisplay}
                  <span style={{ color: colors.textMuted }}> · {picked.phoneDisplay}</span>
                </span>
                <button
                  style={{ ...ui.buttonGhost, padding: "4px 9px", fontSize: 12 }}
                  onClick={() => {
                    setPicked(null);
                    setCustomerQuery("");
                  }}
                >
                  {tUi(lang, "ui_macro_cancel")}
                </button>
              </div>
            ) : (
              <>
                <input
                  style={ui.input}
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  placeholder={tUi(lang, "ui_ticket_customer_find")}
                  aria-label={tUi(lang, "ui_ticket_customer")}
                />
                {matches.length > 0 ? (
                  <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                    {matches.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setPicked(m);
                          setMatches([]);
                          if (!ticketLang) setTicketLang(m.language);
                        }}
                        style={{
                          ...ui.buttonGhost,
                          textAlign: "left",
                          fontSize: 13,
                          padding: "7px 10px",
                        }}
                      >
                        {m.name || "—"} · {m.phoneDisplay}
                      </button>
                    ))}
                  </div>
                ) : null}
                {customerQuery.trim() && matches.length === 0 ? (
                  <input
                    style={{ ...ui.input, marginTop: 6 }}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={tUi(lang, "ui_customer_name")}
                    aria-label={tUi(lang, "ui_customer_name")}
                  />
                ) : null}
              </>
            )}
          </div>

          <div>
            <label style={ui.label}>{tUi(lang, "ui_ticket_subject")}</label>
            <input
              style={ui.input}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              aria-label={tUi(lang, "ui_ticket_subject")}
            />
          </div>

          <div>
            <label style={ui.label}>{tUi(lang, "ui_ticket_description")}</label>
            <textarea
              rows={5}
              style={{
                ...ui.input,
                fontSize: 14,
                lineHeight: 1.6,
                resize: "vertical",
                fontFamily: "inherit",
              }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-label={tUi(lang, "ui_ticket_description")}
            />
            <p style={{ margin: "6px 0 0", fontSize: 12, color: colors.textMuted }}>
              {tUi(lang, "ui_ticket_description_hint")}
            </p>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 180px" }}>
              <label style={ui.label}>{tUi(lang, "ui_priority")}</label>
              <select
                style={ui.input}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                aria-label={tUi(lang, "ui_priority")}
              >
                {["LOW", "NORMAL", "HIGH", "URGENT"].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: "1 1 180px" }}>
              <label style={ui.label}>{tUi(lang, "ui_customer_language")}</label>
              <select
                style={ui.input}
                value={ticketLang}
                onChange={(e) => setTicketLang(e.target.value)}
                aria-label={tUi(lang, "ui_customer_language")}
              >
                <option value="">—</option>
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={{ ...ui.button, opacity: saving || !subject.trim() ? 0.6 : 1 }}
              disabled={saving || !subject.trim()}
              onClick={() => void submit()}
            >
              {saving ? tUi(lang, "ui_saving") : tUi(lang, "ui_new_ticket_title")}
            </button>
            <button style={ui.buttonGhost} onClick={() => router.push("/inbox")}>
              {tUi(lang, "ui_macro_cancel")}
            </button>
          </div>
        </div>
      </div>
    </ConsoleShell>
  );
}
