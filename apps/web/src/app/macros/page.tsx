"use client";
// Macros — the workspace's saved replies.
//
// The editor is built around the thing that makes Desk's macros different:
// one macro carries a body in every language the desk serves, and the
// customer always receives theirs. So the language tabs are the primary
// structure of the editor, not a setting hidden behind a toggle, and a
// language with no body is visibly empty rather than quietly absent.
import { useCallback, useEffect, useState, type ReactNode } from "react";

import type { Language } from "@olink-desk/i18n";

import { cardColumn, cardFooter, EmptyState, IconTile, stroke } from "../../lib/card";
import { font } from "../../lib/theme";
import { priorityKey, statusKey } from "../../lib/tickets";
import {
  cleanActions,
  coverage,
  describeActions,
  PRIORITIES,
  renderMacro,
  SETTABLE_STATUSES,
} from "@olink-desk/macros";

import {
  Badge,
  colors,
  ConsoleShell,
  layout,
  tUi,
  ui,
  useConsoleLanguage,
  useMe,
  useViewport,
} from "../../lib/console-ui";

const LANGS = [
  { code: "en", name: "English" },
  { code: "am", name: "አማርኛ" },
  { code: "om", name: "Afaan Oromoo" },
  { code: "ti", name: "ትግርኛ" },
  { code: "so", name: "Soomaali" },
  { code: "sw", name: "Kiswahili" },
] as const;

// Example values for the preview. Deliberately obvious as examples — a
// realistic-looking name would be mistaken for something that will be sent.
const SAMPLE = {
  customer: "Hana Tadesse",
  ticketNumber: 1024,
  agent: "—",
  organization: "—",
};

const PLACEHOLDERS = [
  "customer.name",
  "ticket.number",
  "agent.name",
  "organization.name",
] as const;

const STATUS_OPTIONS = [
  { value: "", key: "ui_macro_no_status" },
  { value: "OPEN", key: "ui_st_open" },
  { value: "PENDING", key: "ui_st_pending" },
  { value: "RESOLVED", key: "ui_st_resolved" },
] as const;

interface Macro {
  id: string;
  title: string;
  category: string | null;
  bodies: Record<string, string>;
  setStatus: string | null;
  setPriority: string | null;
  addTags: string[];
  isActive: boolean;
  usageCount: number;
}

const control = {
  padding: "7px 9px",
  borderRadius: 6,
  border: `1px solid ${colors.border}`,
  background: colors.surfaceRaised,
  color: colors.textBody,
  fontSize: 13,
} as const;

const blank = (): Macro => ({
  id: "",
  title: "",
  category: null,
  bodies: {},
  setStatus: null,
  setPriority: null,
  addTags: [],
  isActive: true,
  usageCount: 0,
});

export default function MacrosPage() {
  const [lang, setLang] = useConsoleLanguage();
  const me = useMe();
  const { isMobile, roomy } = useViewport();

  const [macros, setMacros] = useState<Macro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const [editing, setEditing] = useState<Macro | null>(null);
  const [bodyLang, setBodyLang] = useState<string>("en");
  const [saving, setSaving] = useState(false);

  // Rendered through renderMacro — the SAME function a real send uses. A
  // second, preview-only implementation would drift from it, and a preview
  // that lies is worse than none.
  // Tokens the renderer does not know. It strips them — safer than leaking
  // `{{custmer.name}}` to a customer — but SILENTLY, so the author sees a
  // sentence with a hole in it and no reason why. Naming them is what makes
  // the preview catch a typo instead of merely displaying its consequence.
  const unknownTokens = editing
    ? [...new Set(
        (editing.bodies[bodyLang] ?? "")
          .match(/\{\{[^{}]*\}\}/g)
          ?.filter((t) => !PLACEHOLDERS.includes(t.slice(2, -2).trim() as (typeof PLACEHOLDERS)[number])) ?? [],
      )]
    : [];

  const preview = editing
    ? (renderMacro(
        editing.bodies,
        bodyLang,
        {
          customerName: SAMPLE.customer,
          ticketNumber: SAMPLE.ticketNumber,
          agentName: me?.user.name ?? SAMPLE.agent,
          organizationName: me?.organization.name ?? SAMPLE.organization,
        },
        bodyLang,
      )?.text ?? "")
    : "";

  const canWrite = !!me && ["ADMIN", "SUPERVISOR"].includes(me.user.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/macros");
      const data = (await resp.json()) as { macros?: Macro[]; error?: string };
      if (!resp.ok) throw new Error(data.error || String(resp.status));
      setMacros(data.macros ?? []);
      setError("");
    } catch (e) {
      setError(tUi(lang, "ui_macro_load_failed", { error: (e as Error).message }));
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      const isNew = !editing.id;
      const resp = await fetch(isNew ? "/api/macros" : `/api/macros/${editing.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editing.title,
          category: editing.category ?? "",
          bodies: editing.bodies,
          setStatus: editing.setStatus,
          setPriority: editing.setPriority,
          addTags: editing.addTags,
        }),
      });
      const data = (await resp.json()) as { error?: string };
      if (!resp.ok) throw new Error(data.error || String(resp.status));
      setNotice(tUi(lang, "ui_macro_saved"));
      setEditing(null);
      await load();
    } catch (e) {
      setError(tUi(lang, "ui_save_failed", { error: (e as Error).message }));
    } finally {
      setSaving(false);
    }
  }

  async function setActive(macro: Macro, isActive: boolean) {
    await fetch(`/api/macros/${macro.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    await load();
  }

  async function remove(macro: Macro) {
    await fetch(`/api/macros/${macro.id}`, { method: "DELETE" });
    await load();
  }

  function insertPlaceholder(token: string) {
    if (!editing) return;
    const current = editing.bodies[bodyLang] ?? "";
    setEditing({
      ...editing,
      bodies: { ...editing.bodies, [bodyLang]: `${current}{{${token}}}` },
    });
  }

  const written = editing
    ? LANGS.filter((l) => (editing.bodies[l.code] ?? "").trim()).length
    : 0;

  // Filtering is client-side on purpose: the whole macro list is already in
  // memory (a workspace has tens of these, not thousands), so a round trip
  // per keystroke would make the control feel worse than no control.
  const categories = [...new Set(macros.map((m) => m.category).filter(Boolean))].sort() as string[];
  const needle = query.trim().toLowerCase();
  const shown = macros.filter((m) => {
    if (category !== null && m.category !== category) return false;
    if (!needle) return true;
    // Bodies too, not only titles. An agent looking for "the one that mentions
    // the refund window" is searching the text, and a title-only search would
    // report nothing while the macro sits two cards away.
    return (
      m.title.toLowerCase().includes(needle) ||
      (m.category ?? "").toLowerCase().includes(needle) ||
      Object.values(m.bodies).some((b) => (b ?? "").toLowerCase().includes(needle))
    );
  });

  return (
    <ConsoleShell lang={lang} onLang={setLang} me={me} active="macros">
      <div style={{ ...layout.wide, display: "grid", gap: 16 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h1 style={ui.h1}>{tUi(lang, "ui_macros_title")}</h1>
            <p style={{ ...ui.sub, maxWidth: 620 }}>{tUi(lang, "ui_macros_subtitle")}</p>
          </div>
          {canWrite && !editing && (
            <button
              style={ui.button}
              onClick={() => {
                setEditing(blank());
                setBodyLang(me?.organization ? "en" : "en");
              }}
            >
              {tUi(lang, "ui_macro_new")}
            </button>
          )}
        </div>

        {error && <div style={ui.error}>{error}</div>}
        {notice && !error && <div style={ui.ok}>{notice}</div>}

        {editing && (
          <div style={{ ...ui.card, display: "grid", gap: 14 }}>
            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr",
              }}
            >
              <div>
                <label style={ui.label}>{tUi(lang, "ui_macro_title_label")}</label>
                <input
                  data-macro-title
                  style={ui.input}
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              </div>
              <div>
                <label style={ui.label}>{tUi(lang, "ui_macro_category")}</label>
                <input
                  style={ui.input}
                  value={editing.category ?? ""}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                />
              </div>
            </div>

            <ActionsBuilder lang={lang} macro={editing} onChange={setEditing} />

            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <span style={ui.label}>{tUi(lang, "ui_macro_bodies")}</span>
                <span style={{ fontSize: 12, color: colors.textMuted }}>
                  {written}/{LANGS.length}
                </span>
              </div>
              {/* Language tabs, with a filled/empty dot per language. An
                  admin must be able to SEE at a glance that Tigrinya is
                  missing — a macro is only as multilingual as its emptiest
                  tab, and nothing else on the page would say so. */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                {LANGS.map((l) => {
                  const filled = (editing.bodies[l.code] ?? "").trim().length > 0;
                  const on = bodyLang === l.code;
                  return (
                    <button
                      key={l.code}
                      onClick={() => setBodyLang(l.code)}
                      style={{
                        ...control,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        cursor: "pointer",
                        borderColor: on ? colors.accent : colors.border,
                        color: on ? colors.textPrimary : colors.textSecondary,
                        background: on ? colors.surfaceRaised : "transparent",
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: filled ? colors.success : colors.border,
                          flexShrink: 0,
                        }}
                      />
                      {l.name}
                    </button>
                  );
                })}
              </div>
              {/* Editor left, the customer's own copy right.
                  An author writes a TEMPLATE; a person reads a MESSAGE. Those
                  are different texts, and until the second one was visible the
                  only way to find out that `{{customer.name}}` reads oddly
                  mid-sentence — or that a placeholder was misspelled and would
                  reach somebody verbatim — was to send it to a real customer.

                  Stacks on a narrow window, editor first: the preview is the
                  supporting half. */}
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: roomy ? "1fr 1fr" : "1fr",
                  alignItems: "start",
                }}
              >
                <textarea
                  value={editing.bodies[bodyLang] ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      bodies: { ...editing.bodies, [bodyLang]: e.target.value },
                    })
                  }
                  rows={10}
                  style={{
                    ...ui.input,
                    fontSize: 14,
                    lineHeight: 1.6,
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
                <div
                  style={{
                    border: `1px solid ${colors.border}`,
                    borderRadius: 8,
                    background: colors.surfaceRaised,
                    padding: 12,
                    minHeight: 120,
                  }}
                >
                  <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>
                    {tUi(lang, "ui_macro_preview")}
                  </div>
                  {preview ? (
                    <>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 13.5,
                          lineHeight: 1.6,
                          color: colors.textPrimary,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {preview}
                      </p>
                      {unknownTokens.length > 0 ? (
                        <div style={{ ...ui.warn, fontSize: 11.5, marginTop: 10 }}>
                          {tUi(lang, "ui_macro_unknown_placeholder", {
                            n: unknownTokens.length,
                            list: unknownTokens.join(", "),
                          })}
                        </div>
                      ) : null}
                      <p
                        style={{
                          margin: "10px 0 0",
                          fontSize: 11.5,
                          lineHeight: 1.5,
                          color: colors.textMuted,
                        }}
                      >
                        {tUi(lang, "ui_macro_preview_sample")}
                      </p>
                    </>
                  ) : (
                    <p
                      style={{
                        margin: 0,
                        fontSize: 12.5,
                        lineHeight: 1.55,
                        color: colors.textSecondary,
                      }}
                    >
                      {tUi(lang, "ui_macro_preview_empty")}
                    </p>
                  )}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  alignItems: "center",
                  marginTop: 8,
                }}
              >
                <span style={{ fontSize: 12, color: colors.textMuted }}>
                  {tUi(lang, "ui_macro_placeholders")}:
                </span>
                {PLACEHOLDERS.map((p) => (
                  <button
                    key={p}
                    onClick={() => insertPlaceholder(p)}
                    style={{ ...control, cursor: "pointer", fontFamily: "monospace" }}
                  >
                    {`{{${p}}}`}
                  </button>
                ))}
              </div>
              <p style={{ ...ui.sub, fontSize: 12 }}>
                {tUi(lang, "ui_macro_placeholder_hint")}
              </p>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button data-macro-save style={ui.button} disabled={saving} onClick={() => void save()}>
                {saving ? tUi(lang, "ui_saving") : tUi(lang, "ui_save")}
              </button>
              <button style={ui.buttonGhost} onClick={() => setEditing(null)}>
                {tUi(lang, "ui_macro_cancel")}
              </button>
            </div>
          </div>
        )}

        {/* A desk with sixty macros cannot use a page that is only a grid of
            them, and a desk with three was looking at three cards and six
            hundred pixels of nothing. Search and the category pills come from
            the DATA — a workspace that never categorised anything sees no
            pills rather than an empty control. */}
        {!loading && macros.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <input
                data-macro-search
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tUi(lang, "ui_macro_search")}
                style={{ ...ui.input, width: 220, padding: "8px 10px", fontSize: 13.5 }}
              />
              {categories.length > 0 &&
                [null, ...categories].map((cat) => {
                  const on = category === cat;
                  return (
                    <button
                      key={cat ?? "__all"}
                      data-macro-filter={cat ?? "all"}
                      onClick={() => setCategory(cat)}
                      style={{
                        ...control,
                        cursor: "pointer",
                        borderColor: on ? colors.accent : colors.border,
                        color: on ? colors.textPrimary : colors.textSecondary,
                        background: on ? colors.surfaceHover : "transparent",
                      }}
                    >
                      {cat ?? tUi(lang, "ui_macro_filter_all")}
                    </button>
                  );
                })}
            </div>
            {/* Two numbers, and the second is the one being managed: how many
                of these a customer can actually receive in their own language. */}
            <span data-macro-summary style={{ fontSize: 12.5, color: colors.textMuted }}>
              {/* A count noun needs a singular. "1 macros" is what a filter
                  that matched once produced, and it is the kind of thing that
                  gets screenshotted. Every language carries its own singular
                  rather than interpolating into a translated plural. */}
              {tUi(lang, shown.length === 1 ? "ui_macro_summary_one" : "ui_macro_summary", {
                n: shown.length,
                ready: shown.filter((m) => coverage(m.bodies).complete).length,
              })}
            </span>
          </div>
        )}

        {loading ? (
          <div style={{ ...ui.card, ...layout.centred, color: colors.textMuted }}>{tUi(lang, "ui_loading")}</div>
        ) : macros.length === 0 ? (
          <div style={ui.card}>
            <EmptyState
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
                  <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
                </svg>
              }
              title={tUi(lang, "ui_macro_none")}
              hint={tUi(lang, "ui_macros_subtitle")}
            />
          </div>
        ) : shown.length === 0 ? (
          <div style={ui.card}>
            <EmptyState
              data-macro-nomatch="1"
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              }
              title={tUi(lang, "ui_macro_no_match")}
              hint={tUi(lang, "ui_macro_no_match_hint")}
            />
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 10,
              // A card of a title, a badge and a few chips does not need 1300px.
              // Two or three across is the width being used by CONTENT rather
              // than by stretching one card over it; it falls to one column on
              // a narrow window without a media query.
              gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
              // Stretch, not start. `start` sizes each card to its own content,
              // so a two-line title made one card taller than the two beside it
              // and the row came out ragged. Stretch plus a footer pinned with
              // `marginTop: auto` is what makes a grid of cards read as a grid.
              alignItems: "stretch",
            }}
          >
            {shown.map((m) => {
              const langsWritten = LANGS.filter((l) => (m.bodies[l.code] ?? "").trim());
              const c = coverage(m.bodies);
              const does = describeActions(
                cleanActions({
                  setStatus: m.setStatus,
                  setPriority: m.setPriority,
                  addTags: m.addTags,
                }),
              );
              return (
                <div
                  key={m.id}
                  style={{
                    ...ui.card,
                    ...cardColumn,
                    padding: 16,
                    gap: 10,
                    opacity: m.isActive ? 1 : 0.62,
                  }}
                >
                  {/* Icon, title, and the one line of metadata — the same head
                      every other card in the console wears. */}
                  <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                    <IconTile size={34} tint={m.isActive ? colors.accent : colors.textMuted}>
                      <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
                        <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
                      </svg>
                    </IconTile>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          color: colors.textPrimary,
                          fontSize: 15,
                          fontWeight: 700,
                          lineHeight: 1.35,
                        }}
                      >
                        {m.title}
                      </div>
                      {/* Category and usage were two stacked scraps — a badge
                          on the title line and an orphan "Never used" under
                          it. One muted line separated by middots reads as a
                          caption instead of as debris. */}
                      <div
                        style={{
                          fontSize: 12,
                          color: colors.textMuted,
                          marginTop: 3,
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                          alignItems: "center",
                        }}
                      >
                        {m.category ? <span>{m.category}</span> : null}
                        {m.category ? <span aria-hidden>·</span> : null}
                        <span>
                          {m.usageCount > 0
                            ? tUi(lang, "ui_macro_used", { n: m.usageCount })
                            : tUi(lang, "ui_macro_never_used")}
                        </span>
                        {!m.isActive && (
                          <Badge tone="warn">{tUi(lang, "ui_macro_retired")}</Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* What it DOES. A list of titles tells an agent nothing
                      about which macro also resolves the ticket, and finding
                      that out by sending one is expensive. */}
                  {does.length > 0 ? (
                    <div
                      data-macro-does={m.id}
                      style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                    >
                      {does.map((d) => (
                        <span
                          key={d.key}
                          style={{
                            fontSize: 11.5,
                            padding: "3px 9px",
                            borderRadius: 999,
                            background: colors.surfaceHover,
                            color: colors.textSecondary,
                          }}
                        >
                          {/* The value is an ENUM, so it has to be translated
                              before it is interpolated — otherwise an Amharic
                              reader gets "RESOLVED" in the middle of an
                              Amharic sentence. Caught by looking at the page,
                              not by any test of the model. */}
                          {tUi(lang, d.key, {
                            ...d.params,
                            ...(typeof d.params.value === "string"
                              ? {
                                  value: tUi(
                                    lang,
                                    d.key === "ui_macro_does_priority"
                                      ? priorityKey(d.params.value)
                                      : statusKey(d.params.value),
                                  ),
                                }
                              : {}),
                          })}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {/* Coverage as a SENTENCE, not six coloured pills. The pills
                      were the loudest thing on every card and the least
                      important information on it — and the reader still had to
                      count them to learn anything. The question is "is this
                      finished, and if not what is missing", which names the gap
                      where it is asked. */}
                  <div
                    data-macro-coverage={m.id}
                    style={{
                      fontSize: 12.5,
                      color: c.complete ? colors.textMuted : colors.warn,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: c.complete ? colors.success : colors.warn,
                        flexShrink: 0,
                      }}
                    />
                    {c.empty
                      ? tUi(lang, "ui_macro_cov_empty")
                      : c.complete
                        ? tUi(lang, "ui_macro_cov_all", { n: c.total })
                        : tUi(lang, "ui_macro_cov_missing", {
                            n: c.written,
                            total: c.total,
                            list: c.missing
                              .map((code) => LANGS.find((l) => l.code === code)?.name ?? code)
                              .join(", "),
                          })}
                  </div>

                  {canWrite && (
                    // Pinned to the bottom of the card, so a longer title on
                    // one card cannot push its buttons out of line with its
                    // neighbour's. That misalignment was the whole reason a
                    // row of three cards looked like three different designs.
                    <div style={cardFooter}>
                      <button
                        data-macro-edit={m.id}
                        style={{
                          ...control,
                          cursor: "pointer",
                          borderColor: colors.borderStrong,
                          color: colors.textPrimary,
                          fontWeight: 600,
                        }}
                        onClick={() => {
                          setEditing(m);
                          setBodyLang(langsWritten[0]?.code ?? "en");
                        }}
                      >
                        {tUi(lang, "ui_macro_edit")}
                      </button>
                      <button
                        style={{ ...control, cursor: "pointer" }}
                        onClick={() => void setActive(m, !m.isActive)}
                      >
                        {tUi(lang, m.isActive ? "ui_macro_retire" : "ui_macro_restore")}
                      </button>
                      {/* Not red, and not bordered like the other two. A
                          destructive action rendered at the same weight as the
                          safe one beside it is a design that treats "edit
                          this" and "destroy this" as equivalent choices. It
                          still confirms; the colour was only drawing the eye
                          toward the one thing nobody should be drawn toward.
                          Pushed to the far end for the same reason. */}
                      <button
                        data-macro-delete={m.id}
                        style={{
                          ...control,
                          cursor: "pointer",
                          border: "none",
                          background: "transparent",
                          color: colors.textMuted,
                          marginInlineStart: "auto",
                        }}
                        onClick={() => void remove(m)}
                      >
                        {tUi(lang, "ui_macro_delete")}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}

/**
 * What this macro does, built the way Zendesk builds it: a LIST of actions
 * you add to, not a fixed row of fields.
 *
 * The difference is not cosmetic. A fixed field says "every macro has a
 * status" — so the one dropdown sat on every macro reading "Leave unchanged",
 * which is a control that does nothing on most of them. A list says "this
 * macro does these three things", which is what an admin is actually
 * deciding, and it leaves room for a fourth action without a redesign.
 */
function ActionsBuilder({
  lang,
  macro,
  onChange,
}: {
  lang: Language;
  macro: Macro;
  onChange: (m: Macro) => void;
}) {
  const [tagDraft, setTagDraft] = useState("");
  const used = {
    status: macro.setStatus !== null,
    priority: macro.setPriority !== null,
    tags: macro.addTags.length > 0,
  };
  // Only offer what is not already there: a second "set status" row would be
  // two controls fighting over one column.
  const addable = (
    [
      { kind: "status", label: "ui_macro_action_status" },
      { kind: "priority", label: "ui_macro_action_priority" },
      { kind: "tags", label: "ui_macro_action_tags" },
    ] as const
  ).filter((a) => !used[a.kind]);

  const row = (key: string, label: string, control: ReactNode, onRemove: () => void) => (
    <div
      key={key}
      data-macro-action={key}
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
        padding: "8px 10px",
        borderRadius: 8,
        background: colors.surfaceRaised,
        border: `1px solid ${colors.border}`,
      }}
    >
      <span style={{ fontSize: 13, color: colors.textSecondary, minWidth: 92 }}>
        {tUi(lang, label)}
      </span>
      <div style={{ flex: 1, minWidth: 180 }}>{control}</div>
      <button
        onClick={onRemove}
        aria-label={tUi(lang, "ui_macro_action_remove")}
        style={{ ...control2, cursor: "pointer" }}
      >
        ×
      </button>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 8 }} data-macro-actions>
      <span style={ui.label}>{tUi(lang, "ui_macro_actions")}</span>

      {!used.status && !used.priority && !used.tags ? (
        <p style={{ margin: 0, fontSize: 12.5, color: colors.textMuted }}>
          {tUi(lang, "ui_macro_actions_empty")}
        </p>
      ) : null}

      {used.status
        ? row(
            "status",
            "ui_macro_action_status",
            <select
              aria-label={tUi(lang, "ui_macro_action_status")}
              style={{ ...ui.input, padding: "8px 8px", fontSize: 14 }}
              value={macro.setStatus ?? "OPEN"}
              onChange={(e) => onChange({ ...macro, setStatus: e.target.value })}
            >
              {SETTABLE_STATUSES.map((v) => (
                <option key={v} value={v}>
                  {tUi(lang, statusKeyFor(v))}
                </option>
              ))}
            </select>,
            () => onChange({ ...macro, setStatus: null }),
          )
        : null}

      {used.priority
        ? row(
            "priority",
            "ui_macro_action_priority",
            <select
              aria-label={tUi(lang, "ui_macro_action_priority")}
              style={{ ...ui.input, padding: "8px 8px", fontSize: 14 }}
              value={macro.setPriority ?? "NORMAL"}
              onChange={(e) => onChange({ ...macro, setPriority: e.target.value })}
            >
              {PRIORITIES.map((v) => (
                <option key={v} value={v}>
                  {tUi(lang, `ui_pr_${v.toLowerCase()}`)}
                </option>
              ))}
            </select>,
            () => onChange({ ...macro, setPriority: null }),
          )
        : null}

      {used.tags
        ? row(
            "tags",
            "ui_macro_action_tags",
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {macro.addTags.filter(Boolean).map((t) => (
                <span
                  key={t}
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
                    onClick={() =>
                      onChange({ ...macro, addTags: macro.addTags.filter((x) => x !== t) })
                    }
                    aria-label={`${tUi(lang, "ui_macro_action_remove")} ${t}`}
                    style={{
                      border: "none",
                      background: "none",
                      color: colors.textMuted,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                aria-label={tUi(lang, "ui_macro_action_tags")}
                value={tagDraft}
                placeholder={tUi(lang, "ui_macro_tag_placeholder")}
                onChange={(e) => setTagDraft(e.target.value)}
                // Enter and comma both commit, because both are what people
                // type when listing things.
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== ",") return;
                  e.preventDefault();
                  const next = cleanActions({ addTags: [...macro.addTags, tagDraft] }).addTags;
                  onChange({ ...macro, addTags: next });
                  setTagDraft("");
                }}
                style={{ ...ui.input, width: 150, padding: "6px 8px", fontSize: 13 }}
              />
            </div>,
            () => onChange({ ...macro, addTags: [] }),
          )
        : null}

      {addable.length > 0 ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {addable.map((a) => (
            <button
              key={a.kind}
              data-add-action={a.kind}
              onClick={() =>
                onChange({
                  ...macro,
                  ...(a.kind === "status"
                    ? { setStatus: "OPEN" }
                    : a.kind === "priority"
                      ? { setPriority: "NORMAL" }
                      : { addTags: [] }),
                  // An empty tag list is not "the tags action is present", so
                  // adding it needs a marker the row can see. A single empty
                  // string is filtered out by cleanActions on save, and the
                  // row is what puts real tags in it.
                  ...(a.kind === "tags" ? { addTags: [""] } : {}),
                })
              }
              style={{ ...control2, cursor: "pointer" }}
            >
              + {tUi(lang, a.label)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const control2 = {
  padding: "6px 10px",
  borderRadius: 6,
  border: `1px solid ${colors.border}`,
  background: "transparent",
  color: colors.textSecondary,
  fontSize: 12.5,
  fontFamily: font,
} as const;

const statusKeyFor = (s: string) =>
  s === "OPEN" ? "ui_st_open" : s === "PENDING" ? "ui_st_pending" : "ui_st_resolved";
