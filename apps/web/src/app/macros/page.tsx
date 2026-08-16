"use client";
// Macros — the workspace's saved replies.
//
// The editor is built around the thing that makes Desk's macros different:
// one macro carries a body in every language the desk serves, and the
// customer always receives theirs. So the language tabs are the primary
// structure of the editor, not a setting hidden behind a toggle, and a
// language with no body is visibly empty rather than quietly absent.
import { useCallback, useEffect, useState } from "react";

import { renderMacro } from "@olink-desk/macros";

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
                gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr 1fr",
              }}
            >
              <div>
                <label style={ui.label}>{tUi(lang, "ui_macro_title_label")}</label>
                <input
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
              <div>
                <label style={ui.label}>{tUi(lang, "ui_macro_then_set")}</label>
                <select
                  style={{ ...ui.input, padding: "10px 8px" }}
                  value={editing.setStatus ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, setStatus: e.target.value || null })
                  }
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {tUi(lang, o.key)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

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
              <button style={ui.button} disabled={saving} onClick={() => void save()}>
                {saving ? tUi(lang, "ui_saving") : tUi(lang, "ui_save")}
              </button>
              <button style={ui.buttonGhost} onClick={() => setEditing(null)}>
                {tUi(lang, "ui_macro_cancel")}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ ...ui.card, ...layout.centred, color: colors.textMuted }}>{tUi(lang, "ui_loading")}</div>
        ) : macros.length === 0 ? (
          <div style={{ ...ui.card, ...layout.centred, color: colors.textSecondary }}>
            {tUi(lang, "ui_macro_none")}
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
              alignItems: "start",
            }}
          >
            {macros.map((m) => {
              const langsWritten = LANGS.filter((l) => (m.bodies[l.code] ?? "").trim());
              return (
                <div
                  key={m.id}
                  style={{
                    ...ui.card,
                    padding: 16,
                    opacity: m.isActive ? 1 : 0.6,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <strong style={{ color: colors.textPrimary, fontSize: 15 }}>
                          {m.title}
                        </strong>
                        {m.category && <Badge tone="muted">{m.category}</Badge>}
                        {!m.isActive && (
                          <Badge tone="warn">{tUi(lang, "ui_macro_retired")}</Badge>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>
                        {m.usageCount > 0
                          ? tUi(lang, "ui_macro_used", { n: m.usageCount })
                          : tUi(lang, "ui_macro_never_used")}
                      </div>
                    </div>
                    {canWrite && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          style={{ ...control, cursor: "pointer" }}
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
                        <button
                          style={{ ...control, cursor: "pointer", color: colors.danger }}
                          onClick={() => void remove(m)}
                        >
                          {tUi(lang, "ui_macro_delete")}
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Coverage at a glance across the whole list: which
                      languages this macro can actually answer in. */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {LANGS.map((l) => {
                      const filled = (m.bodies[l.code] ?? "").trim().length > 0;
                      return (
                        <span
                          key={l.code}
                          style={{
                            fontSize: 11,
                            padding: "2px 7px",
                            borderRadius: 999,
                            border: `1px solid ${filled ? `${colors.success}55` : colors.border}`,
                            color: filled ? colors.success : colors.textMuted,
                          }}
                        >
                          {l.name}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}
