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
  Badge,
  colors,
  ConsoleShell,
  tUi,
  ui,
  useConsoleLanguage,
  useMe,
} from "../../../lib/console-ui";
import { CHANNEL_LABELS, statusKey } from "../../../lib/tickets";
// Deep import: `@olink-desk/tickets` pulls Prisma through its barrel, and this
// is a client component. `phone.ts` is pure string work with no imports.
import { displayPhone, normalizePhone } from "@olink-desk/tickets/src/phone";

/**
 * Dialling codes offered beside the number field.
 *
 * Ethiopia first because that is the desk. The rest are where this desk's
 * customers actually ring from — the Gulf, North America, Europe, and the
 * neighbouring countries — rather than a full ISO list nobody scrolls.
 */
const DIAL_CODES = [
  { cc: "+251", flag: "🇪🇹" },
  { cc: "+1", flag: "🇺🇸" },
  { cc: "+44", flag: "🇬🇧" },
  { cc: "+971", flag: "🇦🇪" },
  { cc: "+966", flag: "🇸🇦" },
  { cc: "+254", flag: "🇰🇪" },
  { cc: "+252", flag: "🇸🇴" },
  { cc: "+253", flag: "🇩🇯" },
  { cc: "+49", flag: "🇩🇪" },
  { cc: "+39", flag: "🇮🇹" },
] as const;

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
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [cc, setCc] = useState("+251");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // What this person has contacted us about before. Fetched as soon as they
  // are picked, because an agent typing up a call wants to see "they rang
  // twice last week" WHILE typing, not after the ticket exists.
  const [history, setHistory] = useState<Array<{
    id: string;
    number: number;
    subject: string | null;
    status: string;
    channel: string;
  }>>([]);

  useEffect(() => {
    if (!picked) {
      setHistory([]);
      return;
    }
    void (async () => {
      const resp = await fetch(`/api/contacts/${picked.id}`);
      if (!resp.ok) return;
      const data = (await resp.json()) as { contact: { tickets: typeof history } };
      setHistory(data.contact.tickets ?? []);
    })();
  }, [picked]);

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

  // A local Ethiopian number is written 09… and normalises on its own, so the
  // dialling code is only prefixed when the agent did NOT type a local or
  // already-international form. Blindly gluing "+251" onto "0911…" would make
  // every correctly-typed number invalid.
  const typedPhone = newPhone.trim();
  const composedPhone = !typedPhone
    ? ""
    : typedPhone.startsWith("+") || typedPhone.startsWith("00") || typedPhone.startsWith("0")
      ? typedPhone
      : `${cc}${typedPhone}`;
  const normalized = composedPhone ? normalizePhone(composedPhone) : null;
  const phoneState: "empty" | "ok" | "bad" = !composedPhone
    ? "empty"
    : normalized
      ? "ok"
      : "bad";

  // Everything the submit button needs to be sure of, in one place, so the
  // button can be DISABLED for a reason it can also explain. The old form
  // accepted anything and reported the problem afterwards.
  const identity = picked
    ? { ok: true as const }
    : !creating
      ? { ok: false as const, why: "ui_new_need_customer" }
      : phoneState === "bad"
        ? { ok: false as const, why: "ui_customer_phone_bad" }
        : !normalized && !newEmail.trim()
          ? { ok: false as const, why: "ui_customer_identity_why" }
          : { ok: true as const };

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
          // The typed fields, never the search box.
          ...(picked
            ? { contactId: picked.id }
            : {
                name: newName.trim(),
                ...(normalized ? { phone: normalized } : {}),
                ...(newEmail.trim() ? { email: newEmail.trim() } : {}),
              }),
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
    <ConsoleShell
      lang={lang}
      onLang={setLang}
      me={me}
      active="inbox"
      context={<PriorContacts history={history} lang={lang} />}
    >
      <div style={{ display: "grid", gap: 16 }}>
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
          {/* Was shown on both channels with one wording about calling back.
              A walk-in is not answered by phoning them, and a customer at the
              counter may have left no number at all. */}
          <div style={{ ...ui.warn, fontSize: 12 }}>
            {tUi(
              lang,
              channel === "PHONE" ? "ui_ticket_no_reply_warning" : "ui_ticket_no_reply_walk_in",
            )}
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
                {/* SEARCH. Only ever a search — what is typed here is never
                    submitted as anything.

                    It used to be both: with nothing picked, the form posted
                    this box's text as `phone`. So typing a customer's NAME
                    into a box labelled "Customer" produced "That phone number
                    was not recognised", pointing at a field the form did not
                    have — and it did it on a walk-in too, where there may be
                    no number at all. Two jobs in one input, and neither of
                    them said which. */}
                <input
                  data-customer-search
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
                        data-customer-match={m.id}
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
                        {m.name || tUi(lang, "ui_no_name")} · {m.phoneDisplay}
                      </button>
                    ))}
                  </div>
                ) : null}

                {/* CREATE. Its own fields, each labelled, shown when the
                    agent says this is somebody new — never inferred from a
                    search coming back empty, because "no match yet" is also
                    what a half-typed name looks like. */}
                {creating ? (
                  <div
                    data-new-customer
                    style={{
                      marginTop: 10,
                      padding: 12,
                      borderRadius: 8,
                      border: `1px solid ${colors.border}`,
                      background: colors.surfaceRaised,
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    <div>
                      <label style={ui.label}>{tUi(lang, "ui_customer_name")}</label>
                      <input
                        data-new-name
                        style={ui.input}
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        aria-label={tUi(lang, "ui_customer_name")}
                      />
                    </div>

                    <div>
                      <label style={ui.label}>
                        {tUi(lang, "ui_customer_phone")}{" "}
                        <span style={{ color: colors.textMuted, fontWeight: 400 }}>
                          {tUi(lang, "ui_setup_optional")}
                        </span>
                      </label>
                      {/* The dialling code is a picker rather than something
                          to remember. Ethiopia leads because that is the desk;
                          the rest exist because a diaspora customer calling in
                          is the ordinary case, not the exception. */}
                      <div style={{ display: "flex", gap: 8 }}>
                        <select
                          data-phone-cc
                          value={cc}
                          onChange={(e) => setCc(e.target.value)}
                          aria-label={tUi(lang, "ui_customer_phone_cc")}
                          style={{ ...ui.input, width: 132, flexShrink: 0 }}
                        >
                          {DIAL_CODES.map((d) => (
                            <option key={d.cc} value={d.cc}>
                              {d.flag} {d.cc}
                            </option>
                          ))}
                        </select>
                        <input
                          data-new-phone
                          style={{ ...ui.input, flex: 1, minWidth: 0 }}
                          value={newPhone}
                          onChange={(e) => setNewPhone(e.target.value)}
                          inputMode="tel"
                          placeholder={cc === "+251" ? "09… / 07…" : ""}
                          aria-label={tUi(lang, "ui_customer_phone")}
                        />
                      </div>
                      {/* Judged as they type, beside the field it is about —
                          not as a red banner at the top of the page after a
                          submit that threw everything else away. */}
                      {phoneState === "bad" ? (
                        <p
                          data-phone-error
                          style={{ margin: "6px 0 0", fontSize: 12, color: colors.danger }}
                        >
                          {tUi(lang, "ui_customer_phone_bad")}
                        </p>
                      ) : phoneState === "ok" ? (
                        <p
                          data-phone-ok
                          style={{ margin: "6px 0 0", fontSize: 12, color: colors.success }}
                        >
                          {displayPhone(normalized ?? "")}
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <label style={ui.label}>
                        {tUi(lang, "ui_customer_email")}{" "}
                        <span style={{ color: colors.textMuted, fontWeight: 400 }}>
                          {tUi(lang, "ui_setup_optional")}
                        </span>
                      </label>
                      <input
                        data-new-email
                        style={ui.input}
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        inputMode="email"
                        aria-label={tUi(lang, "ui_customer_email")}
                      />
                    </div>

                    {/* Says WHY one of the two is needed. The old copy stated
                        the rule as a refusal after the fact. */}
                    <p style={{ margin: 0, fontSize: 12, color: colors.textMuted, lineHeight: 1.5 }}>
                      {tUi(lang, "ui_customer_identity_why")}
                    </p>
                  </div>
                ) : (
                  <button
                    data-new-customer-open
                    onClick={() => {
                      setCreating(true);
                      // Whatever they typed to search with is almost always
                      // the person's name, so it seeds the name field rather
                      // than being thrown away.
                      if (!newName) setNewName(customerQuery.trim());
                    }}
                    style={{ ...ui.buttonGhost, marginTop: 8, fontSize: 13 }}
                  >
                    + {tUi(lang, "ui_customer_new")}
                  </button>
                )}
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

          {/* The button says what is still missing rather than being an
              inert grey rectangle. A disabled control with no reason attached
              is the same dead end as an error after submit, one step earlier. */}
          {!subject.trim() || !identity.ok ? (
            <p data-submit-blocked style={{ margin: 0, fontSize: 12.5, color: colors.textMuted }}>
              {!identity.ok
                ? tUi(lang, identity.why)
                : tUi(lang, "ui_new_need_subject")}
            </p>
          ) : null}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              data-submit-ticket
              style={{ ...ui.button, opacity: saving || !subject.trim() || !identity.ok ? 0.6 : 1 }}
              disabled={saving || !subject.trim() || !identity.ok}
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

/** What this customer contacted you about before — supporting detail while an
 *  agent types up a call, never the only place any of it appears. */
function PriorContacts({
  history,
  lang,
}: {
  history: Array<{ id: string; number: number; subject: string | null; status: string; channel: string }>;
  lang: Parameters<typeof tUi>[0];
}) {
  return (
<div style={{ ...ui.card, display: "grid", gap: 10 }}>
      <strong style={{ fontSize: 14, color: colors.textPrimary }}>
        {tUi(lang, "ui_new_ticket_context")}
      </strong>
      {history.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: colors.textSecondary }}>
          {tUi(lang, "ui_new_ticket_no_context")}
        </p>
      ) : (
        history.map((t) => (
          <div
            key={t.id}
            style={{
              display: "grid",
              gap: 4,
              paddingTop: 8,
              borderTop: `1px solid ${colors.border}`,
            }}
          >
            <div style={{ fontSize: 13, color: colors.textPrimary }}>
              {t.subject ?? "—"}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <Badge tone={t.status === "RESOLVED" || t.status === "CLOSED" ? "muted" : "info"}>
                {tUi(lang, statusKey(t.status))}
              </Badge>
              <span style={{ fontSize: 11.5, color: colors.textMuted }}>
                #{t.number} · {CHANNEL_LABELS[t.channel] ?? t.channel}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
