"use client";
// The knowledge base: answers written once so customers stop waiting.
//
// Structured by LANGUAGE like the macro editor, for the same reason — an
// article that exists only in English cannot answer an Amharic customer, and
// retrieval never crosses languages. The per-language dots make an incomplete
// article visible at a glance rather than at the moment it fails to match.
import { useCallback, useEffect, useState } from "react";

import { coverage } from "@olink-desk/macros";

import { cardColumn, cardFooter, EmptyState, IconTile, stroke } from "../../lib/card";

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
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "published" | "draft">("all");
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

  // An article counts as written in a language only when BOTH its title and
  // its body exist there — a body with no title is unreachable, and a title
  // with no body answers nothing. Collapsed into the one-map shape
  // `coverage()` takes, so the macros list and this page cannot drift on what
  // "written in six languages" means.
  const writtenMap = (a: Article): Record<string, string> =>
    Object.fromEntries(
      LANGS.filter((l) => (a.titles[l.code] ?? "").trim() && (a.bodies[l.code] ?? "").trim())
        .map((l) => [l.code, a.bodies[l.code] ?? ""]),
    );

  const needle = query.trim().toLowerCase();
  const shown = articles.filter((a) => {
    if (status === "published" && !a.isPublished) return false;
    if (status === "draft" && a.isPublished) return false;
    if (!needle) return true;
    // Titles AND bodies, in every language — somebody searching for an
    // article they wrote in Amharic must find it while the console is in
    // English.
    return (
      Object.values(a.titles).some((t) => (t ?? "").toLowerCase().includes(needle)) ||
      Object.values(a.bodies).some((b) => (b ?? "").toLowerCase().includes(needle))
    );
  });

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
          {/* The switch lives HERE, beside "New article", rather than as its
              own block above the list or under a Settings tab — a control
              belongs next to the thing it acts on, but a switch an admin
              flips once should not cost the page a whole card's worth of
              height above the articles every time it loads. An icon button
              with a popover, the AlertBell's own shape, costs nothing until
              someone opens it. */}
          {!editing ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <AutoAnswerControl lang={lang} />
              {canWrite ? (
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

        {/* The same toolbar the macros list carries, for the same reason: a
            knowledge base grows to hundreds of articles, and a page that is
            only a grid of them stops being usable long before that. */}
        {!loading && articles.length > 0 && (
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
                data-kb-search
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tUi(lang, "ui_kb_search")}
                style={{ ...ui.input, width: 220, padding: "8px 10px", fontSize: 13.5 }}
              />
              {(
                [
                  ["all", "ui_macro_filter_all"],
                  ["published", "ui_kb_published"],
                  ["draft", "ui_kb_draft"],
                ] as const
              ).map(([key, labelKey]) => {
                const on = status === key;
                return (
                  <button
                    key={key}
                    data-kb-filter={key}
                    onClick={() => setStatus(key)}
                    style={{
                      ...control,
                      cursor: "pointer",
                      borderColor: on ? colors.accent : colors.border,
                      color: on ? colors.textPrimary : colors.textSecondary,
                      background: on ? colors.surfaceHover : "transparent",
                    }}
                  >
                    {tUi(lang, labelKey)}
                  </button>
                );
              })}
            </div>
            {/* The second number is the one being managed: how many of these
                a customer can actually read in their own language. */}
            <span data-kb-summary style={{ fontSize: 12.5, color: colors.textMuted }}>
              {tUi(lang, shown.length === 1 ? "ui_kb_summary_one" : "ui_kb_summary", {
                n: shown.length,
                ready: shown.filter((a) => coverage(writtenMap(a)).complete).length,
              })}
            </span>
          </div>
        )}

        {loading ? (
          <div style={{ ...ui.card, ...layout.centred, color: colors.textMuted }}>{tUi(lang, "ui_loading")}</div>
        ) : articles.length === 0 ? (
          <div style={ui.card}>
            <EmptyState
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
                </svg>
              }
              title={tUi(lang, "ui_kb_none")}
              hint={tUi(lang, "ui_kb_subtitle")}
            />
          </div>
        ) : shown.length === 0 ? (
          <div style={ui.card}>
            <EmptyState
              data-kb-nomatch="1"
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              }
              title={tUi(lang, "ui_kb_no_match")}
              hint={tUi(lang, "ui_macro_no_match_hint")}
            />
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
              // Stretch, so a two-line title cannot make one card taller than
              // the two beside it. Paired with the pinned footer below, this
              // is what makes a row of cards read as a row.
              alignItems: "stretch",
            }}
          >
            {shown.map((a) => {
              const written = LANGS.filter(
                (l) => (a.titles[l.code] ?? "").trim() && (a.bodies[l.code] ?? "").trim(),
              );
              const c = coverage(writtenMap(a));
              const title =
                a.titles[written[0]?.code ?? "en"] || a.titles.en || tUi(lang, "ui_kb_untitled");
              return (
                <div key={a.id} style={{ ...ui.card, ...cardColumn, padding: 16, gap: 10 }}>
                  <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                    <IconTile size={34} tint={a.isPublished ? colors.success : colors.textMuted}>
                      <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
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
                        {title}
                      </div>
                      {/* One muted caption line, not a badge on the title and
                          an orphan sentence beneath it.
                          Deflections, not views: the number that says whether
                          writing this was worth the afternoon. */}
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
                        <Badge tone={a.isPublished ? "success" : "muted"}>
                          {tUi(lang, a.isPublished ? "ui_kb_published" : "ui_kb_draft")}
                        </Badge>
                        <span>{tUi(lang, "ui_kb_deflections", { n: a.deflections })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Coverage as a SENTENCE. Six bordered language pills per
                      card were the loudest thing on this page and its least
                      important information — and the reader still had to
                      count them. Removed from the macros list first; this
                      page had kept them. */}
                  <div
                    data-kb-coverage={a.id}
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

                  {canWrite ? (
                    <div style={cardFooter}>
                      <button
                        data-kb-edit={a.id}
                        style={{
                          ...control,
                          cursor: "pointer",
                          borderColor: colors.borderStrong,
                          color: colors.textPrimary,
                          fontWeight: 600,
                        }}
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
                      {/* Not red, and not bordered like the other two. Red at
                          the same weight as Edit makes "destroy this" the
                          loudest control on the card. Pushed to the far end
                          for the same reason. */}
                      <button
                        data-kb-delete={a.id}
                        style={{
                          ...control,
                          cursor: "pointer",
                          border: "none",
                          background: "transparent",
                          color: colors.textMuted,
                          marginInlineStart: "auto",
                        }}
                        onClick={() => void remove(a)}
                      >
                        {tUi(lang, "ui_macro_delete")}
                      </button>
                    </div>
                  ) : null}
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
 * The auto-answer switch, and enough context to make it a decision.
 *
 * A bare toggle would be worse than none. Turning this on with nothing
 * published changes nothing at all — retrieval finds no articles and every
 * message falls through to a person — and an administrator who is not told
 * that concludes the feature is broken rather than that they have not written
 * anything yet. So the card carries the article counts, whether the model is
 * reachable at all, and how many messages it has actually answered.
 */
function AutoAnswerControl({ lang }: { lang: Parameters<typeof tUi>[0] }) {
  interface State {
    enabled: boolean;
    canEdit: boolean;
    publishedArticles: number;
    draftArticles: number;
    answeredCount: number;
    modelReady: boolean;
  }
  const [state, setState] = useState<State | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const { isMobile } = useViewport();

  useEffect(() => {
    void (async () => {
      const resp = await fetch("/api/auto-answer");
      if (resp.ok) setState((await resp.json()) as State);
    })();
  }, []);

  if (!state) return null;

  async function toggle() {
    if (!state || !state.canEdit) return;
    setBusy(true);
    setFailure("");
    try {
      const resp = await fetch("/api/auto-answer", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !state.enabled }),
      });
      const body = (await resp.json().catch(() => null)) as { error?: string } | null;
      if (!resp.ok) {
        setFailure(tUi(lang, "ui_aa_failed", { error: body?.error ?? `HTTP ${resp.status}` }));
        return;
      }
      setState({ ...state, enabled: !state.enabled });
    } finally {
      setBusy(false);
    }
  }

  const on = state.enabled;
  // Nothing published means the switch is honest but inert. Said plainly
  // rather than left for the admin to discover from a silent desk.
  const inert = state.publishedArticles === 0;

  return (
    <div style={{ position: "relative" }} data-auto-answer-control>
      <button
        onClick={() => setOpen(!open)}
        aria-label={tUi(lang, "ui_aa_title")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "7px 10px",
          borderRadius: 6,
          border: `1px solid ${open ? colors.accent : colors.border}`,
          background: on ? colors.surfaceHover : "transparent",
          color: colors.textSecondary,
          fontSize: 12.5,
          cursor: "pointer",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: on ? colors.success : colors.textMuted,
            flexShrink: 0,
          }}
        />
        <svg width="15" height="15" viewBox="0 0 24 24" {...stroke} aria-hidden>
          <path d="M12 3a9 9 0 0 0-9 9v5a2 2 0 0 0 2 2h2v-6H5v-1a7 7 0 0 1 14 0v1h-2v6h2a2 2 0 0 0 2-2v-5a9 9 0 0 0-9-9z" />
        </svg>
        {!isMobile ? <span>{tUi(lang, on ? "ui_aa_on" : "ui_aa_off")}</span> : null}
      </button>

      {open ? (
        <section
          style={{
            ...(isMobile
              ? { position: "fixed" as const, top: 62, left: 12, right: 12, width: "auto" }
              : { position: "absolute" as const, top: "calc(100% + 8px)", right: 0, width: 340 }),
            maxWidth: "calc(100vw - 24px)",
            background: colors.surface,
            border: `1px solid ${colors.borderStrong}`,
            borderRadius: 10,
            boxShadow: colors.shadowStrong,
            padding: 14,
            zIndex: 60,
            boxSizing: "border-box",
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong style={{ fontSize: 13.5, color: colors.textPrimary, flex: 1 }}>
              {tUi(lang, "ui_aa_title")}
            </strong>
            <Badge tone={on ? "success" : "muted"}>
              {tUi(lang, on ? "ui_aa_on" : "ui_aa_off")}
            </Badge>
          </div>

          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: colors.textSecondary }}>
            {tUi(lang, "ui_aa_blurb")}
          </p>

          {failure ? <div style={ui.error}>{failure}</div> : null}

          {!state.modelReady ? (
            <div style={{ fontSize: 12, color: colors.danger }} data-aa-no-model>
              {tUi(lang, "ui_aa_no_model")}
            </div>
          ) : inert ? (
            <div style={{ fontSize: 12, color: colors.warn }} data-aa-no-articles>
              {tUi(lang, "ui_aa_no_articles")}
            </div>
          ) : null}

          {state.canEdit ? (
            <button
              data-aa-toggle
              disabled={busy}
              onClick={() => void toggle()}
              style={{ ...(on ? ui.buttonGhost : ui.button), padding: "6px 12px", fontSize: 12.5 }}
            >
              {tUi(lang, on ? "ui_aa_turn_off" : "ui_aa_turn_on")}
            </button>
          ) : (
            <span style={{ fontSize: 12, color: colors.textMuted }}>
              {tUi(lang, "ui_aa_admin_only")}
            </span>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11.5, color: colors.textMuted }}>
            <span>
              {tUi(lang, "ui_aa_counts", {
                published: state.publishedArticles,
                drafts: state.draftArticles,
              })}
            </span>
            {state.answeredCount > 0 ? (
              <span>{tUi(lang, "ui_aa_answered", { n: state.answeredCount })}</span>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
