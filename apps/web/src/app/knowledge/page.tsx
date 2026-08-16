"use client";
// The knowledge base: answers written once so customers stop waiting.
//
// Structured by LANGUAGE like the macro editor, for the same reason — an
// article that exists only in English cannot answer an Amharic customer, and
// retrieval never crosses languages. The per-language dots make an incomplete
// article visible at a glance rather than at the moment it fails to match.
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

interface Article {
  id: string;
  titles: Record<string, string>;
  bodies: Record<string, string>;
  isPublished: boolean;
  deflections: number;
  views: number;
}

const blank = (): Article => ({
  id: "",
  titles: {},
  bodies: {},
  isPublished: false,
  deflections: 0,
  views: 0,
});

const control = {
  padding: "7px 9px",
  borderRadius: 6,
  border: `1px solid ${colors.border}`,
  background: colors.surfaceRaised,
  color: colors.textBody,
  fontSize: 13,
} as const;

export default function KnowledgePage() {
  const [lang, setLang] = useConsoleLanguage();
  const me = useMe();
  const { isMobile } = useViewport();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Article | null>(null);
  const [bodyLang, setBodyLang] = useState<string>("en");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const canWrite = !!me && ["ADMIN", "SUPERVISOR"].includes(me.user.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/kb");
      if (resp.ok) setArticles(((await resp.json()) as { articles: Article[] }).articles);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      const isNew = !editing.id;
      const resp = await fetch("/api/kb", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isNew ? {} : { id: editing.id }),
          titles: editing.titles,
          bodies: editing.bodies,
          isPublished: editing.isPublished,
        }),
      });
      const data = (await resp.json()) as { error?: string };
      if (!resp.ok) throw new Error(data.error ?? String(resp.status));
      setEditing(null);
      await load();
    } catch (e) {
      setError(tUi(lang, "ui_save_failed", { error: (e as Error).message }));
    } finally {
      setSaving(false);
    }
  }

  async function setPublished(a: Article, isPublished: boolean) {
    await fetch("/api/kb", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, isPublished }),
    });
    await load();
  }

  async function remove(a: Article) {
    await fetch(`/api/kb?id=${encodeURIComponent(a.id)}`, { method: "DELETE" });
    await load();
  }

  return (
    <ConsoleShell lang={lang} onLang={setLang} me={me} active="knowledge">
      <div style={{ ...layout.wide, display: "grid", gap: 16 }}>
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
            <h1 style={ui.h1}>{tUi(lang, "ui_kb_title")}</h1>
            <p style={{ ...ui.sub, maxWidth: 620 }}>{tUi(lang, "ui_kb_subtitle")}</p>
          </div>
          {canWrite && !editing ? (
            <button
              style={ui.button}
              onClick={() => {
                setEditing(blank());
                setBodyLang("en");
              }}
            >
              {tUi(lang, "ui_kb_new")}
            </button>
          ) : null}
        </div>

        {error ? <div style={ui.error}>{error}</div> : null}

        {editing ? (
          <div style={{ ...ui.card, ...layout.centred, display: "grid", gap: 12 }}>
            {/* Language tabs with a filled/empty dot, exactly like the macro
                editor: an article is only as multilingual as its emptiest
                tab, and nothing else on the page would say so. */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {LANGS.map((l) => {
                const filled =
                  (editing.titles[l.code] ?? "").trim() && (editing.bodies[l.code] ?? "").trim();
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
                      }}
                    />
                    {l.name}
                  </button>
                );
              })}
            </div>

            <div>
              <label style={ui.label}>{tUi(lang, "ui_kb_article_title")}</label>
              <input
                style={ui.input}
                value={editing.titles[bodyLang] ?? ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    titles: { ...editing.titles, [bodyLang]: e.target.value },
                  })
                }
              />
            </div>
            <div>
              <label style={ui.label}>{tUi(lang, "ui_kb_article_body")}</label>
              <textarea
                rows={isMobile ? 6 : 9}
                style={{ ...ui.input, fontSize: 14, lineHeight: 1.6, resize: "vertical", fontFamily: "inherit" }}
                value={editing.bodies[bodyLang] ?? ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    bodies: { ...editing.bodies, [bodyLang]: e.target.value },
                  })
                }
              />
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={editing.isPublished}
                onChange={(e) => setEditing({ ...editing, isPublished: e.target.checked })}
              />
              {tUi(lang, "ui_kb_published")}
            </label>

            <div style={{ display: "flex", gap: 8 }}>
              <button style={ui.button} disabled={saving} onClick={() => void save()}>
                {saving ? tUi(lang, "ui_saving") : tUi(lang, "ui_save")}
              </button>
              <button style={ui.buttonGhost} onClick={() => setEditing(null)}>
                {tUi(lang, "ui_macro_cancel")}
              </button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div style={{ ...ui.card, ...layout.centred, color: colors.textMuted }}>{tUi(lang, "ui_loading")}</div>
        ) : articles.length === 0 ? (
          <div style={{ ...ui.card, ...layout.centred, color: colors.textSecondary }}>
            {tUi(lang, "ui_kb_none")}
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
            {articles.map((a) => {
              const written = LANGS.filter(
                (l) => (a.titles[l.code] ?? "").trim() && (a.bodies[l.code] ?? "").trim(),
              );
              return (
                <div key={a.id} style={{ ...ui.card, padding: 16, display: "grid", gap: 10 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <strong style={{ color: colors.textPrimary, fontSize: 15 }}>
                          {a.titles.en || written[0] ? a.titles[written[0]?.code ?? "en"] : "—"}
                        </strong>
                        <Badge tone={a.isPublished ? "success" : "muted"}>
                          {tUi(lang, a.isPublished ? "ui_kb_published" : "ui_kb_draft")}
                        </Badge>
                      </div>
                      {/* Deflections, not views: the number that says whether
                          writing this was worth the afternoon. */}
                      <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>
                        {tUi(lang, "ui_kb_deflections", { n: a.deflections })}
                      </div>
                    </div>
                    {canWrite ? (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          style={{ ...control, cursor: "pointer" }}
                          onClick={() => {
                            setEditing(a);
                            setBodyLang(written[0]?.code ?? "en");
                          }}
                        >
                          {tUi(lang, "ui_macro_edit")}
                        </button>
                        <button
                          style={{ ...control, cursor: "pointer" }}
                          onClick={() => void setPublished(a, !a.isPublished)}
                        >
                          {tUi(lang, a.isPublished ? "ui_kb_unpublish" : "ui_kb_publish")}
                        </button>
                        <button
                          style={{ ...control, cursor: "pointer", color: colors.danger }}
                          onClick={() => void remove(a)}
                        >
                          {tUi(lang, "ui_macro_delete")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {LANGS.map((l) => {
                      const filled = written.some((w) => w.code === l.code);
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
