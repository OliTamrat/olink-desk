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
  useViewport,
} from "../../../lib/console-ui";
import { CHANNEL_LABELS, priorityKey, statusKey } from "../../../lib/tickets";
// Deep import: `@olink-desk/tickets` pulls Prisma through its barrel, and this
// is a client component. `phone.ts` is pure string work with no imports.
import { displayPhone, normalizePhone } from "@olink-desk/tickets/src/phone";
import { AttachmentPicker, uploadPending, type PendingFile } from "../../../lib/attachments";
import { CardHead, stroke } from "../../../lib/card";
import { renderMacro } from "@olink-desk/macros";

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
  const { roomy: wide } = useViewport();

  const [channel, setChannel] = useState<"PHONE" | "SMS" | "WALK_IN">("PHONE");
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
  // Queued, not uploaded: there is no ticket to attach them to until the form
  // is submitted, so they ride along and go up immediately afterwards.
  const [files, setFiles] = useState<PendingFile[]>([]);

  // The properties rail. Every one of these was already accepted by
  // POST /api/tickets and simply never sent by this form — assignment and
  // routing existed server-side and were unreachable from the browser.
  const [assigneeId, setAssigneeId] = useState("");
  const [queueId, setQueueId] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [team, setTeam] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [queues, setQueues] = useState<Array<{ id: string; name: string }>>([]);
  const [macros, setMacros] = useState<
    Array<{ id: string; title: string; bodies: Record<string, string> }>
  >([]);
  const [suggested, setSuggested] = useState<Array<{ id: string; title: string }>>([]);

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

  // Loaded once. Three small lists that turn a form into a routing decision.
  useEffect(() => {
    if (!me) return;
    void (async () => {
      const [u, q, m] = await Promise.all([
        fetch("/api/users").then((r) => (r.ok ? r.json() : { users: [] })),
        fetch("/api/queues").then((r) => (r.ok ? r.json() : { queues: [] })),
        fetch("/api/macros").then((r) => (r.ok ? r.json() : { macros: [] })),
      ]);
      setTeam((u.users ?? []).filter((x: { status: string }) => x.status === "ACTIVE"));
      setQueues(q.queues ?? []);
      setMacros(m.macros ?? []);
    })();
  }, [me]);

  // Desk products show "similar resolved tickets" beside a new one. The equivalent
  // worth having here is the KNOWLEDGE BASE: if an article already answers
  // this, the agent can read it while the customer is still on the line
  // instead of researching after hanging up. Matched on the subject, debounced,
  // and never automatic — it offers, it does not fill anything in.
  useEffect(() => {
    const term = subject.trim();
    if (term.length < 4) {
      setSuggested([]);
      return;
    }
    const id = setTimeout(() => {
      void (async () => {
        const resp = await fetch("/api/kb");
        if (!resp.ok) return;
        const { articles } = (await resp.json()) as {
          articles: Array<{ id: string; titles: Record<string, string>; isPublished: boolean }>;
        };
        const needle = term.toLowerCase();
        const words = needle.split(/\s+/).filter((w) => w.length > 3);
        setSuggested(
          articles
            .map((a) => {
              const title = a.titles[ticketLang] || a.titles.en || Object.values(a.titles)[0] || "";
              const hay = title.toLowerCase();
              const score = words.filter((w) => hay.includes(w)).length;
              return { id: a.id, title, score };
            })
            .filter((a) => a.title && a.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 4),
        );
      })();
    }, 400);
    return () => clearTimeout(id);
  }, [subject, ticketLang]);

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
          ...(assigneeId ? { assigneeId } : {}),
          ...(queueId ? { queueId } : {}),
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

      // The ticket EXISTS from here on. A file that fails to upload is
      // reported, but it must never look like the ticket failed — the agent
      // would log it again and the desk would have two.
      // Tags are applied after the fact because they are a separate
      // relation. A tag that fails must not fail the ticket, for the same
      // reason a file that fails must not.
      for (const tag of tags) {
        await fetch(`/api/tickets/${data.ticket.id}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: tag }),
        }).catch(() => undefined);
      }

      if (files.length > 0) {
        const failed = await uploadPending(data.ticket.id, files);
        if (failed.length > 0) {
          window.sessionStorage.setItem(
            "desk_attach_warning",
            tUi(lang, "ui_attach_some_failed", { list: failed.join("; ") }),
          );
        }
      }
      router.push(`/inbox?ticket=${data.ticket.id}`);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  // Lifted out so the properties rail can render it. It is the same markup —
  // the customer belongs beside the assignee and the priority, not above the
  // subject, because all four are decisions about WHERE this goes.
  const customerBlock = (
    <>
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
    </>
  );

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

        {/* The the global platforms shape: properties on the left, the composer in the
            middle, what the desk already knows on the right. On a narrow
            window it stacks — properties first, because routing a call is
            decided before it is typed up. */}
        <div
          data-new-layout
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: wide ? "280px minmax(0, 1fr) 260px" : "1fr",
            alignItems: "start",
          }}
        >
          {/* ------------------------------------------------ properties */}
          <aside style={{ ...ui.card, display: "grid", gap: 14 }} data-new-properties>
            <div>
              <label style={ui.label}>{tUi(lang, "ui_ticket_customer")}</label>
              {customerBlock}
            </div>

            <div>
              <label style={ui.label}>{tUi(lang, "ui_assignee")}</label>
              <div style={{ display: "flex", gap: 6 }}>
                <select
                  data-assignee
                  style={{ ...ui.input, flex: 1, minWidth: 0 }}
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  aria-label={tUi(lang, "ui_assignee")}
                >
                  <option value="">{tUi(lang, "ui_unassigned")}</option>
                  {team.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                {/* The "take it" control every desk product ends up with, and worth having: the agent
                    typing up the call is usually the one who will own it, and
                    hunting for their own name in a list of forty is friction
                    on every single ticket. */}
                {me && assigneeId !== me.user.id ? (
                  <button
                    type="button"
                    data-take-it
                    onClick={() => setAssigneeId(me.user.id)}
                    style={{ ...ui.buttonGhost, fontSize: 12, padding: "6px 10px", flexShrink: 0 }}
                  >
                    {tUi(lang, "ui_take_it")}
                  </button>
                ) : null}
              </div>
            </div>

            {queues.length > 0 ? (
              <div>
                <label style={ui.label}>{tUi(lang, "ui_queue")}</label>
                <select
                  data-queue
                  style={ui.input}
                  value={queueId}
                  onChange={(e) => setQueueId(e.target.value)}
                  aria-label={tUi(lang, "ui_queue")}
                >
                  <option value="">{tUi(lang, "ui_no_queue")}</option>
                  {queues.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 120px" }}>
                <label style={ui.label}>{tUi(lang, "ui_priority")}</label>
                <select
                  style={ui.input}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  aria-label={tUi(lang, "ui_priority")}
                >
                  {["LOW", "NORMAL", "HIGH", "URGENT"].map((p) => (
                    <option key={p} value={p}>
                      {tUi(lang, priorityKey(p))}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: "1 1 120px" }}>
                <label style={ui.label}>{tUi(lang, "ui_customer_language")}</label>
                <select
                  style={ui.input}
                  value={ticketLang}
                  onChange={(e) => setTicketLang(e.target.value)}
                  aria-label={tUi(lang, "ui_customer_language")}
                >
                  <option value="">{tUi(lang, "ui_lang_unset")}</option>
                  {LANGS.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label style={ui.label}>{tUi(lang, "ui_tags")}</label>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                {tags.map((t) => (
                  <span
                    key={t}
                    data-tag={t}
                    style={{
                      fontSize: 12,
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: colors.surfaceHover,
                      color: colors.textBody,
                      display: "inline-flex",
                      gap: 6,
                    }}
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => setTags(tags.filter((x) => x !== t))}
                      aria-label={`${tUi(lang, "ui_attach_remove")} ${t}`}
                      style={{ border: "none", background: "none", color: colors.textMuted, cursor: "pointer", padding: 0 }}
                    >
                      x
                    </button>
                  </span>
                ))}
                <input
                  data-tag-input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  placeholder={tUi(lang, "ui_macro_tag_placeholder")}
                  aria-label={tUi(lang, "ui_tags")}
                  // Enter and comma both commit, because both are what people
                  // type when listing things.
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== ",") return;
                    e.preventDefault();
                    const next = tagDraft.trim().toLowerCase();
                    if (next && !tags.includes(next)) setTags([...tags, next]);
                    setTagDraft("");
                  }}
                  style={{ ...ui.input, width: 130, padding: "6px 8px", fontSize: 13 }}
                />
              </div>
            </div>
          </aside>

          {/* -------------------------------------------------- composer */}
          <div style={{ ...ui.card, display: "grid", gap: 14 }}>
          <div>
            <label style={ui.label}>{tUi(lang, "ui_ticket_how")}</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(
                [
                  { value: "PHONE", label: tUi(lang, "ui_channel_phone_call") },
                  // A desk gets texts read out as often as calls, and logging
                  // one as "phone call" makes the channel report wrong.
                  { value: "SMS", label: tUi(lang, "ui_ch_sms") },
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
              channel === "WALK_IN" ? "ui_ticket_no_reply_walk_in" : "ui_ticket_no_reply_warning",
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

          {/* Under the description, where the agent has just written what
              happened and is thinking about what else belongs on the record —
              a photo of the error, or the voicemail they are listening to. */}
          <AttachmentPicker
            files={files}
            onChange={setFiles}
            disabled={saving}
            t={(k, params) => tUi(lang, k, params)}
          />

          {/* Apply a macro — A control worth having, and the reason for it
              here rather than only in the reply composer: the commonest thing
              an agent types into a call log is the same sentence they typed
              yesterday. It FILLS the box rather than sending anything, so it
              is still editable before the ticket exists. */}
          {macros.length > 0 ? (
            <div>
              <label style={ui.label}>{tUi(lang, "ui_macro_apply")}</label>
              <select
                data-apply-macro
                value=""
                aria-label={tUi(lang, "ui_macro_apply")}
                onChange={(e) => {
                  const m = macros.find((x) => x.id === e.target.value);
                  if (!m) return;
                  // Rendered, not pasted. The raw body carries
                  // {{customer.name}} and friends, and applying it verbatim
                  // leaves those in the ticket description for a human to
                  // notice later — or not. renderMacro is the SAME function a
                  // real send uses, so what lands here is what would be sent.
                  const body =
                    renderMacro(
                      m.bodies,
                      ticketLang || "en",
                      {
                        customerName: picked?.name || newName || tUi(lang, "ui_no_name"),
                        ticketNumber: 0,
                        agentName: me?.user.name ?? "",
                        organizationName: me?.organization.name ?? "",
                      },
                      ticketLang || "en",
                    )?.text ?? "";
                  setDescription(description ? `${description}\n\n${body}` : body);
                  if (!subject.trim()) setSubject(m.title);
                }}
                style={ui.input}
              >
                <option value="">{tUi(lang, "ui_macro_apply")}…</option>
                {macros.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

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

          {/* ----------------------------------------------- suggestions */}
          {/* Desk products put "similar resolved tickets" here. The equivalent
              worth having is the knowledge base: if an article already
              answers this, the agent reads it while the customer is still on
              the line rather than researching after hanging up. */}
          <aside style={{ ...ui.card, display: "grid", gap: 10 }} data-new-suggestions>
            <CardHead
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
                </svg>
              }
              title={tUi(lang, "ui_new_suggested")}
              blurb={tUi(lang, "ui_new_suggested_blurb")}
            />
            {suggested.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12.5, color: colors.textMuted, lineHeight: 1.5 }}>
                {tUi(lang, "ui_new_suggested_none")}
              </p>
            ) : (
              <div style={{ display: "grid", gap: 2 }}>
                {suggested.map((a) => (
                  <a
                    key={a.id}
                    data-suggested-article={a.id}
                    href="/knowledge"
                    style={{
                      display: "block",
                      padding: "8px 0",
                      borderTop: `1px solid ${colors.border}`,
                      color: colors.textBody,
                      textDecoration: "none",
                      fontSize: 13.5,
                      lineHeight: 1.45,
                    }}
                  >
                    {a.title}
                  </a>
                ))}
              </div>
            )}
          </aside>
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
