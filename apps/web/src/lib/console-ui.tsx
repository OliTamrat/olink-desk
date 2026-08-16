"use client";
// The console's shared chrome: design-token styles, the shell (sidebar +
// topbar), the language picker, badges. Every color comes from theme.ts —
// the fleet's design-system rule: tokens are the single source of truth,
// no raw hex in screens.
import {
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  tUi,
  type Language,
} from "@olink-desk/i18n";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { colors, font, radius, THEME_KEY, type Appearance } from "./theme";

const LANG_KEY = "desk_console_lang";

/**
 * Media queries cannot reach inline styles, so responsiveness is a hook:
 * below the breakpoint the shell swaps its sidebar for a top bar + bottom
 * tab bar and screens collapse to one pane. Dispatchers here work from
 * phones as much as desks — mobile is a first-class layout, not a fallback.
 */
export function useIsMobile(breakpoint = 820): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return mobile;
}

/**
 * Width buckets for the desktop-rich workspace (ADR 0006: the dashboard is
 * a desktop product that is also responsive). `wide` earns the views rail,
 * `roomy` earns the context rail; below that they collapse into controls
 * that cost no horizontal space.
 */
export function useViewport(): { isMobile: boolean; roomy: boolean; wide: boolean } {
  const [w, setW] = useState(1440);
  useEffect(() => {
    const update = () => setW(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return { isMobile: w <= 820, roomy: w >= 1120, wide: w >= 1400 };
}

export function useConsoleLanguage(): [Language, (l: Language) => void] {
  const [lang, setLang] = useState<Language>("en");
  useEffect(() => {
    const stored = window.localStorage.getItem(LANG_KEY);
    if (stored && isSupportedLanguage(stored)) setLang(stored);
  }, []);
  const update = (l: Language) => {
    window.localStorage.setItem(LANG_KEY, l);
    setLang(l);
  };
  return [lang, update];
}

export function LanguagePicker({
  lang,
  onChange,
}: {
  lang: Language;
  onChange: (l: Language) => void;
}) {
  return (
    <select
      aria-label="Language"
      value={lang}
      onChange={(e) => onChange(e.target.value as Language)}
      style={{
        padding: "6px 10px",
        borderRadius: radius.sm,
        border: `1px solid ${colors.border}`,
        background: colors.surfaceRaised,
        color: colors.textBody,
        fontSize: 13,
        fontFamily: font,
      }}
    >
      {SUPPORTED_LANGUAGES.map((l) => (
        <option key={l} value={l}>
          {LANGUAGE_NAMES[l]}
        </option>
      ))}
    </select>
  );
}

// --------------------------------------------------------------- SVG icons
// Inline, stroke-based, currentColor — no emoji, no icon font, no CDN.
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export const Icons = {
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  inbox: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  ),
  channels: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  knowledge: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  reports: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
      <path d="M3 3v18h18" />
      <path d="M7 15l4-5 3 3 5-7" />
    </svg>
  ),
  wallboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M6 12l3-3 2 2 4-4" />
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  macros: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  ),
  customers: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 11.2a3 3 0 0 0 0-6" />
      <path d="M17.5 14.4c2 .6 3.2 2.3 3.2 4.6" />
    </svg>
  ),
  more: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </svg>
  ),
  panel: (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </svg>
  ),
  plus: (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  search: (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  bell: (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  signOut: (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  ),
  // Appearance. Three distinct silhouettes rather than three shades of one
  // shape: which is selected has to be readable at 16px, in a language the
  // reader may not have, on a phone.
  sun: (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  moon: (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  ),
  monitor: (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  ),
} as const;

/**
 * The appearance preference: light, dark, or whatever the device says.
 *
 * `system` is the default and is stored as the ABSENCE of a key, so a user
 * who never opens this control keeps following their OS forever — including
 * across a change of OS setting at dusk. Writing "system" as a value would
 * work equally well; not writing anything means the boot script in
 * `theme.ts` has nothing to parse and cannot get it wrong.
 */
export function useAppearance(): [Appearance, (a: Appearance) => void] {
  const [pref, setPref] = useState<Appearance>("system");
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(THEME_KEY);
      if (stored === "light" || stored === "dark") setPref(stored);
    } catch {
      // Private mode. The console renders in the OS theme, which is the
      // right fallback and not worth a warning.
    }
  }, []);
  const update = (a: Appearance) => {
    setPref(a);
    try {
      if (a === "system") window.localStorage.removeItem(THEME_KEY);
      else window.localStorage.setItem(THEME_KEY, a);
    } catch {
      /* the choice still applies to this tab */
    }
    // The attribute is the switch; the stylesheet does the rest. Removing it
    // hands control back to `prefers-color-scheme`.
    const root = document.documentElement;
    if (a === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", a);
  };
  return [pref, update];
}

const APPEARANCES: Array<{ key: Appearance; icon: ReactNode; label: string }> = [
  { key: "light", icon: Icons.sun, label: "ui_appearance_light" },
  { key: "dark", icon: Icons.moon, label: "ui_appearance_dark" },
  { key: "system", icon: Icons.monitor, label: "ui_appearance_system" },
];

export function AppearanceToggle({ lang }: { lang: Language }) {
  const [pref, setPref] = useAppearance();
  const [open, setOpen] = useState(false);
  const current = APPEARANCES.find((a) => a.key === pref) ?? APPEARANCES[2];

  return (
    <div style={{ position: "relative" }} data-appearance-menu>
      <button
        onClick={() => setOpen(!open)}
        aria-label={tUi(lang, "ui_appearance")}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          padding: 8,
          borderRadius: radius.sm,
          border: `1px solid ${open ? colors.accent : colors.border}`,
          background: "transparent",
          color: colors.textSecondary,
          cursor: "pointer",
        }}
      >
        {/* The icon shows what is IN EFFECT, so the control reports state as
            well as offering a change. On `system` that is the monitor rather
            than the resolved theme: a sun icon on a machine set to light
            would be indistinguishable from an explicit light choice, and the
            difference is the whole point of the third option. */}
        {current.icon}
      </button>
      {open ? (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 49 }}
          />
          <div
            data-appearance-panel
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              insetInlineEnd: 0,
              zIndex: 50,
              minWidth: 168,
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              padding: 5,
              boxShadow: colors.shadow,
            }}
          >
            {APPEARANCES.map((a) => (
              <button
                key={a.key}
                data-appearance={a.key}
                onClick={() => {
                  setPref(a.key);
                  setOpen(false);
                }}
                aria-current={a.key === pref}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  textAlign: "start",
                  padding: "9px 10px",
                  borderRadius: radius.sm,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: font,
                  fontSize: 13,
                  fontWeight: a.key === pref ? 600 : 500,
                  color: a.key === pref ? colors.textPrimary : colors.textBody,
                  background: a.key === pref ? colors.surfaceHover : "transparent",
                }}
              >
                {a.icon}
                <span style={{ flex: 1 }}>{tUi(lang, a.label)}</span>
                {/* A tick, not only a highlight: the highlight is also what
                    hover looks like on the next row down. */}
                {a.key === pref ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" {...stroke}>
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                ) : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------- alerts
//
// The other half of the SLA engine. Breach was derived from the beginning,
// but only inside the wallboard route — so the only thing that knew a promise
// had been missed was a screen somebody had to be watching. This is where a
// person finds out without watching.

export interface AlertRow {
  id: string;
  kind: "SLA_BREACHED" | "SLA_AT_RISK" | "UNASSIGNED_WAITING";
  read: boolean;
  createdAt: string;
  ticketId: string;
  ticketNumber: number;
  subject: string | null;
}

const ALERT_KEY: Record<AlertRow["kind"], string> = {
  SLA_BREACHED: "ui_alert_sla_breached",
  SLA_AT_RISK: "ui_alert_sla_at_risk",
  UNASSIGNED_WAITING: "ui_alert_unassigned_waiting",
};
const ALERT_TONE: Record<AlertRow["kind"], "danger" | "warn" | "info"> = {
  SLA_BREACHED: "danger",
  SLA_AT_RISK: "warn",
  UNASSIGNED_WAITING: "info",
};

export function AlertBell({ lang }: { lang: Language }) {
  // The bell lives in the top bar on both layouts now, so where the panel
  // opens is a question about the VIEWPORT, not the call site. On a wide
  // screen it drops from the button; on a phone it spans the width, because
  // the bell is not the rightmost control there and a button-anchored panel
  // ran off the left edge (caught by measuring its box, not by an overflow
  // check — clipped content at negative x adds no scrollWidth).
  const narrow = useIsMobile();
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const resp = await fetch("/api/notifications");
      if (!resp.ok) return;
      const data = (await resp.json()) as { notifications: AlertRow[]; unread: number };
      setRows(data.notifications);
      setUnread(data.unread);
    } catch {
      // An alert feed that will not load must never break the console around
      // it: the bell simply shows nothing.
    }
  }, []);

  useEffect(() => {
    void load();
    // 45s: fast enough that a breach reaches a watching supervisor while it
    // still matters, slow enough not to be a poll storm on a shared desk.
    const timer = setInterval(load, 45_000);
    return () => clearInterval(timer);
  }, [load]);

  async function markAll() {
    await fetch("/api/notifications", { method: "POST" });
    // Optimistic: the panel is open and the person just pressed the button,
    // so waiting a round trip to grey the rows out reads as a broken click.
    setRows(rows.map((r) => ({ ...r, read: true })));
    setUnread(0);
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        aria-label={tUi(lang, "ui_alerts")}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          padding: 8,
          borderRadius: radius.sm,
          border: `1px solid ${open ? colors.accent : colors.border}`,
          background: "transparent",
          color: unread > 0 ? colors.textPrimary : colors.textSecondary,
          cursor: "pointer",
        }}
      >
        {Icons.bell}
        {unread > 0 ? (
          <span
            style={{
              position: "absolute",
              top: -5,
              right: -5,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: 999,
              background: colors.danger,
              color: colors.bg,
              fontSize: 10,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          style={{
            ...(narrow
              ? {
                  position: "fixed" as const,
                  top: 62,
                  left: 12,
                  right: 12,
                  width: "auto",
                }
              : {
                  position: "absolute" as const,
                  top: "calc(100% + 10px)",
                  right: 0,
                  width: 340,
                  maxWidth: "calc(100vw - 24px)",
                }),
            maxHeight: 380,
            overflowY: "auto",
            background: colors.surface,
            border: `1px solid ${colors.borderStrong}`,
            borderRadius: 10,
            boxShadow: colors.shadowStrong,
            padding: 10,
            zIndex: 60,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <strong style={{ fontSize: 13, color: colors.textPrimary }}>
              {tUi(lang, "ui_alerts")}
            </strong>
            {rows.some((r) => !r.read) ? (
              <button
                onClick={() => void markAll()}
                style={{
                  border: "none",
                  background: "transparent",
                  color: colors.accent,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  padding: 0,
                }}
              >
                {tUi(lang, "ui_alerts_mark_read")}
              </button>
            ) : null}
          </div>

          {rows.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12.5, color: colors.textMuted }}>
              {tUi(lang, "ui_alerts_none")}
            </p>
          ) : (
            <div style={{ display: "grid", gap: 2 }}>
              {rows.map((r) => {
                const tone = ALERT_TONE[r.kind];
                const fg =
                  tone === "danger" ? colors.danger : tone === "warn" ? colors.warn : colors.accent;
                return (
                  <a
                    key={r.id}
                    href={`/inbox?ticket=${r.ticketId}`}
                    style={{
                      display: "flex",
                      gap: 9,
                      padding: "8px 7px",
                      borderRadius: 7,
                      textDecoration: "none",
                      color: "inherit",
                      opacity: r.read ? 0.55 : 1,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        flexShrink: 0,
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: fg,
                        marginTop: 5,
                      }}
                    />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 12.5, color: fg }}>
                        {tUi(lang, ALERT_KEY[r.kind])}
                      </span>
                      <span
                        style={{
                          display: "block",
                          fontSize: 13,
                          color: colors.textBody,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        #{r.ticketNumber} {r.subject ?? ""}
                      </span>
                    </span>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// -------------------------------------------------------------- the shell
export interface ShellUser {
  organization: { slug: string; name: string };
  user: { name: string; role: string };
}

// ------------------------------------------------------------ the top bar
//
// Zendesk's shape, and the reason for it: the things an agent reaches for
// from ANY screen — search, alerts, who am I, sign out — belong on a bar that
// is always in the same place, not tucked into the bottom of a rail. The
// alert bell in particular was reported as hard to see down there, which is
// the whole point of an alert.

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  // Strip non-letters first: a display name like "Oli (support)" must not
  // yield "O(" — the same fix the fleet's map markers needed.
  const letters = parts
    .map((p) => p.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean)
    .map((p) => p[0]);
  return (letters[0] ?? "?") + (letters.length > 1 ? letters[letters.length - 1] : "");
}

/** Global search. Enter navigates to the inbox with the query applied, which
 *  is the same URL a drill-down produces — one filtered-list contract for the
 *  whole console. */
function GlobalSearch({ lang }: { lang: Language }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        if (term) router.push(`/inbox?view=all&q=${encodeURIComponent(term)}`);
      }}
      style={{ flex: 1, maxWidth: 480, minWidth: 0 }}
    >
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 10,
            display: "flex",
            color: colors.textMuted,
            pointerEvents: "none",
          }}
        >
          {Icons.search}
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tUi(lang, "ui_search_tickets")}
          aria-label={tUi(lang, "ui_search_tickets")}
          style={{
            width: "100%",
            // 16px minimum: iOS Safari auto-zooms a focused input below that,
            // which widens the layout viewport and breaks the whole page.
            fontSize: 16,
            padding: "8px 12px 8px 32px",
            borderRadius: 8,
            border: `1px solid ${colors.border}`,
            background: colors.surfaceRaised,
            color: colors.textPrimary,
            boxSizing: "border-box",
            fontFamily: font,
          }}
        />
      </div>
    </form>
  );
}

// Who may create work. An auditor reads; a ticket they logged would be a
// record of a call they are not on the rota to take.
const CAN_CREATE = ["AGENT", "SUPERVISOR", "ADMIN"];

/**
 * Quick-create — the "+ Add" of every desk product, and worth having for a
 * specific reason rather than familiarity: the moment an agent needs to log a
 * call is the moment they are ON the call, and navigating to a page first is
 * how a call goes unrecorded.
 */
function QuickAdd({ lang }: { lang: Language }) {
  const [open, setOpen] = useState(false);
  const items = [
    { href: "/inbox/new", label: tUi(lang, "ui_add_ticket") },
    { href: "/customers?new=1", label: tUi(lang, "ui_add_customer") },
  ];
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen(!open)}
        aria-label={tUi(lang, "ui_quick_add")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 12px 7px 9px",
          borderRadius: 8,
          border: "none",
          background: colors.accentSolid,
          color: colors.onAccent,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: font,
        }}
      >
        {Icons.plus}
        {tUi(lang, "ui_quick_add")}
      </button>
      {open ? (
        <>
          {/* A click anywhere else closes it. Without this the menu stays open
              behind whatever the agent does next. */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 9998 }}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              zIndex: 9999,
              minWidth: 200,
              background: colors.surfaceRaised,
              border: `1px solid ${colors.border}`,
              borderRadius: 10,
              padding: 6,
              boxShadow: colors.shadow,
            }}
          >
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                style={{
                  display: "block",
                  padding: "9px 10px",
                  borderRadius: 7,
                  color: colors.textBody,
                  fontSize: 13,
                  textDecoration: "none",
                }}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** The account menu: who you are, the language, and the way out. Grouped
 *  because all three are about the person rather than the work, and a bar
 *  with five loose controls on it stops reading as a bar. */
function AccountMenu({
  lang,
  onLang,
  me,
  onSignOut,
}: {
  lang: Language;
  onLang: (l: Language) => void;
  me: ShellUser;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen(!open)}
        aria-label={me.user.name}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 8px 5px 5px",
          borderRadius: 999,
          border: `1px solid ${open ? colors.accent : colors.border}`,
          background: "transparent",
          cursor: "pointer",
          fontFamily: font,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            // Flat, not a gradient: the initials are drawn on it, and the
            // light end of the old gradient could not carry white text at
            // 4.5:1. The brand mark below keeps its gradient — nothing is
            // written on that one.
            background: colors.accentSolid,
            color: colors.onAccent,
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {initialsOf(me.user.name)}
        </span>
        <span style={{ fontSize: 13, color: colors.textBody, whiteSpace: "nowrap" }}>
          {me.user.name}
        </span>
      </button>

      {open ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 240,
            maxWidth: "calc(100vw - 24px)",
            background: colors.surface,
            border: `1px solid ${colors.borderStrong}`,
            borderRadius: 10,
            boxShadow: colors.shadowStrong,
            padding: 12,
            zIndex: 70,
            display: "grid",
            gap: 10,
            boxSizing: "border-box",
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>
              {me.user.name}
            </div>
            <div style={{ fontSize: 12, color: colors.textMuted }}>
              {me.organization.name} · {me.user.role}
            </div>
          </div>
          <LanguagePicker lang={lang} onChange={onLang} />
          <button
            onClick={onSignOut}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: radius.sm,
              border: `1px solid ${colors.border}`,
              background: "transparent",
              color: colors.textSecondary,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: font,
            }}
          >
            {Icons.signOut}
            {tUi(lang, "ui_sign_out")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- the shell

export function ConsoleShell({
  lang,
  onLang,
  me,
  active,
  sidePanel,
  context,
  fullBleed,
  children,
}: {
  lang: Language;
  onLang: (l: Language) => void;
  me: ShellUser | null;
  active: "dashboard" | "inbox" | "customers" | "channels" | "macros" | "knowledge" | "reports" | "wallboard" | "settings";
  /**
   * The second sidebar layer: a screen's own contextual navigation, docked
   * beside the app nav (the Zendesk shape — product rail, then Views).
   * Screens with no context pass nothing and the layer is not rendered.
   */
  sidePanel?: ReactNode;
  /**
   * This screen's supporting detail. Supplying it puts the toggle in the top
   * bar; a screen with nothing contextual to say passes nothing and no
   * control appears, rather than an empty panel nobody can use.
   */
  context?: ReactNode;
  /**
   * Let this screen use the entire display. For the wallboard, which is meant
   * to be read across a room from a television — capping that at 1440 would
   * waste exactly the space it exists to fill.
   */
  fullBleed?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  usePathname(); // keeps the shell client-routed
  const [contextOpen, setContextOpen] = useContextPanel();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const nav: Array<{
    key: "dashboard" | "inbox" | "customers" | "channels" | "macros" | "knowledge" | "reports" | "wallboard" | "settings";
    href: string;
    label: string;
    icon: ReactNode;
  }> = [
    { key: "dashboard", href: "/dashboard", label: tUi(lang, "ui_nav_dashboard"), icon: Icons.dashboard },
    { key: "inbox", href: "/inbox", label: tUi(lang, "ui_nav_inbox"), icon: Icons.inbox },
    { key: "customers", href: "/customers", label: tUi(lang, "ui_customers"), icon: Icons.customers },
    { key: "channels", href: "/channels", label: tUi(lang, "ui_channels_title"), icon: Icons.channels },
    { key: "macros", href: "/macros", label: tUi(lang, "ui_nav_macros"), icon: Icons.macros },
    { key: "knowledge", href: "/knowledge", label: tUi(lang, "ui_nav_kb"), icon: Icons.knowledge },
  ];
  // Reports and the wallboard are both supervision surfaces; agents work the
  // inbox instead.
  if (me && ["SUPERVISOR", "ADMIN", "AUDITOR"].includes(me.user.role)) {
    nav.push({
      key: "reports",
      href: "/reports",
      label: tUi(lang, "ui_nav_reports"),
      icon: Icons.reports,
    });
    nav.push({
      key: "wallboard",
      href: "/wallboard",
      label: tUi(lang, "ui_nav_wallboard"),
      icon: Icons.wallboard,
    });
  }
  // Settings changes what the whole team is measured against.
  if (me && ["SUPERVISOR", "ADMIN"].includes(me.user.role)) {
    nav.push({
      key: "settings",
      href: "/settings",
      label: tUi(lang, "ui_nav_settings"),
      icon: Icons.settings,
    });
  }

  const isMobile = useIsMobile();
  const barShown = useHideOnScroll();
  const [moreOpen, setMoreOpen] = useState(false);

  // Four on the bar, the rest behind More. Inbox leads because an agent on a
  // phone is working tickets; the order is not the desktop's, because a phone
  // is not a small desktop.
  const PHONE_PRIMARY = ["inbox", "dashboard", "customers", "knowledge"];
  const primaryNav = PHONE_PRIMARY.map((k) => nav.find((n) => n.key === k)).filter(
    (n): n is (typeof nav)[number] => Boolean(n),
  );
  const overflowNav = nav.filter((n) => !PHONE_PRIMARY.includes(n.key));

  const brand = (
    <Link
      href="/dashboard"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        textDecoration: "none",
        flexShrink: 0,
        minWidth: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentSolid})`,
          flexShrink: 0,
        }}
      />
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontWeight: 700,
            fontSize: 15,
            color: colors.textPrimary,
            lineHeight: 1.15,
          }}
        >
          Olink Desk
        </span>
        {me ? (
          <span
            style={{
              display: "block",
              fontSize: 11,
              color: colors.textMuted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {me.organization.name}
          </span>
        ) : null}
      </span>
    </Link>
  );

  // One top bar for both layouts. Everything an agent reaches for from any
  // screen lives here and stays in the same place — the alert bell most of
  // all, which is the point of an alert.
  const topBar = (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        height: 56,
        padding: isMobile ? "0 12px" : "0 18px",
        borderBottom: `1px solid ${colors.border}`,
        background: colors.surface,
        position: "sticky",
        top: 0,
        zIndex: 40,
        boxSizing: "border-box",
      }}
    >
      {brand}
      {me && !isMobile ? <GlobalSearch lang={lang} /> : <div style={{ flex: 1 }} />}
      {me && CAN_CREATE.includes(me.user.role) ? <QuickAdd lang={lang} /> : null}
      {me && context ? (
        <ContextToggle lang={lang} open={contextOpen} onToggle={() => setContextOpen(!contextOpen)} />
      ) : null}
      {me ? <AlertBell lang={lang} /> : null}
      <AppearanceToggle lang={lang} />
      {me ? (
        <AccountMenu lang={lang} onLang={onLang} me={me} onSignOut={signOut} />
      ) : (
        <LanguagePicker lang={lang} onChange={onLang} />
      )}
    </header>
  );

  if (isMobile) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: "100dvh",
          background: colors.bg,
          color: colors.textBody,
          fontFamily: font,
          // `clip`, not `hidden`. Per spec, an element with overflow other
          // than `visible` on ONE axis computes the other to `auto` — so
          // `overflow-x: hidden` quietly made this div a vertical scroll
          // CONTAINER, the page scrolled inside it rather than on the window,
          // and anything listening for window scroll never heard a thing.
          // `clip` clips without establishing a scroll container.
          overflowX: "clip",
        }}
      >
        {topBar}
        <div
          style={{ flex: 1, minWidth: 0, padding: "16px 14px 84px", boxSizing: "border-box" }}
        >
          {sidePanel}
          {children}
        </div>
        {/* FOUR destinations plus More.
            Every nav item used to render here at `flex: 1` — nine of them on a
            390px phone is 43px each, so the labels were clipped and the bar
            overflowed sideways. Four is what fits legibly; the rest are one
            tap away rather than illegibly present.

            Which four is a judgement about a phone, not a shrunken desktop:
            an agent holding a phone is working the Inbox, and everything else
            is either occasional (Dashboard, Customers) or genuinely
            desk-bound (Channels, Settings, Wallboard). */}
        <nav
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            display: "flex",
            borderTop: `1px solid ${colors.border}`,
            background: colors.surface,
            zIndex: 30,
            // Slides out of the way rather than disappearing: an agent needs
            // to see where it went, or the next tap is a hunt.
            transform: barShown ? "translateY(0)" : "translateY(110%)",
            transition: "transform .22s ease",
            // The home indicator on a modern phone sits under this bar.
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          {primaryNav.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                padding: "9px 2px 11px",
                textDecoration: "none",
                fontSize: 10.5,
                fontWeight: item.key === active ? 700 : 500,
                color: item.key === active ? colors.accent : colors.textSecondary,
                borderTop: `2px solid ${item.key === active ? colors.accent : "transparent"}`,
              }}
            >
              {item.icon}
              <span
                style={{
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.label}
              </span>
            </Link>
          ))}
          {overflowNav.length > 0 ? (
            <button
              onClick={() => setMoreOpen(true)}
              aria-label={tUi(lang, "ui_nav_more")}
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                padding: "9px 2px 11px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontFamily: font,
                fontSize: 10.5,
                // Bold when the page you are on lives in here, so "where am I"
                // is answerable without opening it.
                fontWeight: overflowNav.some((i) => i.key === active) ? 700 : 500,
                color: overflowNav.some((i) => i.key === active)
                  ? colors.accent
                  : colors.textSecondary,
                borderTop: `2px solid ${
                  overflowNav.some((i) => i.key === active) ? colors.accent : "transparent"
                }`,
              }}
            >
              {Icons.more}
              {tUi(lang, "ui_nav_more")}
            </button>
          ) : null}
        </nav>

        {/* Everything that did not fit — a sheet from the bottom, where the
            thumb already is. */}
        {moreOpen ? (
          <>
            <div
              onClick={() => setMoreOpen(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 40 }}
            />
            <div
              data-more-sheet
              style={{
                position: "fixed",
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 41,
                background: colors.surface,
                borderTop: `1px solid ${colors.border}`,
                borderRadius: "14px 14px 0 0",
                padding: "10px 10px calc(14px + env(safe-area-inset-bottom, 0px))",
                maxHeight: "70vh",
                overflowY: "auto",
              }}
            >
              {overflowNav.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "13px 12px",
                    borderRadius: 9,
                    textDecoration: "none",
                    fontSize: 15,
                    color: item.key === active ? colors.accent : colors.textBody,
                    fontWeight: item.key === active ? 700 : 500,
                  }}
                >
                  {item.icon}
                  {item.label}
                </Link>
              ))}
            </div>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: colors.bg,
        color: colors.textBody,
        fontFamily: font,
      }}
    >
      {topBar}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <aside
          style={{
            width: 210,
            flexShrink: 0,
            borderRight: `1px solid ${colors.border}`,
            background: colors.surface,
            padding: "16px 12px",
            position: "sticky",
            // Below the 56px bar, so the rail scrolls with its own content
            // rather than fighting the bar for the top of the viewport.
            top: 56,
            height: "calc(100vh - 56px)",
            boxSizing: "border-box",
            overflowY: "auto",
          }}
        >
          <nav style={{ display: "grid", gap: 4 }}>
            {nav.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 10px",
                  borderRadius: radius.sm,
                  textDecoration: "none",
                  fontSize: 14,
                  fontWeight: item.key === active ? 600 : 500,
                  color: item.key === active ? colors.textPrimary : colors.textSecondary,
                  background: item.key === active ? colors.surfaceHover : "transparent",
                  borderLeft: `2px solid ${item.key === active ? colors.accent : "transparent"}`,
                }}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        {sidePanel ? (
          <aside
            style={{
              width: 230,
              flexShrink: 0,
              borderRight: `1px solid ${colors.border}`,
              background: colors.bg,
              padding: "20px 12px",
              boxSizing: "border-box",
              height: "calc(100vh - 56px)",
              position: "sticky",
              top: 56,
              overflowY: "auto",
            }}
          >
            {sidePanel}
          </aside>
        ) : null}

        <div style={{ flex: 1, minWidth: 0, padding: "24px 28px", boxSizing: "border-box" }}>
          {/* The cap and the centring live HERE, once, so a page added later
              gets them without remembering to. Every screen used to pin its
              own max-width to the left, which is what left a void down the
              right of a wide monitor. A page that genuinely wants the whole
              display — the wallboard on a TV — opts out. */}
          <div style={fullBleed ? { width: "100%" } : layout.wide}>
            {context ? (
              <WithContext
                open={contextOpen}
                onClose={() => setContextOpen(false)}
                context={context}
              >
                {children}
              </WithContext>
            ) : (
              children
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Fetch /api/auth/me once; null while loading, redirects to /login on 401. */
export function useMe(): ShellUser | null {
  const router = useRouter();
  const [me, setMe] = useState<ShellUser | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resp = await fetch("/api/auth/me");
      if (resp.status === 401) {
        router.replace("/login");
        return;
      }
      const body = (await resp.json()) as ShellUser;
      if (!cancelled) setMe(body);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);
  return me;
}

// ------------------------------------------------------------ style atoms
/**
 * Layout, and the one rule behind it.
 *
 * A max-width cap belongs on a COLUMN OF TEXT, not on a PAGE. Every screen
 * here used to cap itself at 560–1100px and pin that cap to the LEFT, which
 * left a void down the right of a 1500px monitor — and pinned-left-with-a-void
 * reads as a bug, where centred reads as a choice.
 *
 * So: the reading column stays capped, because long lines genuinely hurt. The
 * width that is left over either earns its keep with a second column of
 * something an agent actually needs, or the content is centred. Filling space
 * with decoration is worse than leaving it empty — it costs the reader
 * attention and gives nothing back.
 */
export const layout = {
  /** Centred, and wide enough that a big monitor is used without sprawling. */
  wide: { maxWidth: 1440, margin: "0 auto", width: "100%" } as CSSProperties,
  /** A page that is genuinely one column of form or prose: centred, not left. */
  centred: { maxWidth: 760, margin: "0 auto", width: "100%" } as CSSProperties,
  /** Paragraph measure. Beyond roughly this, the eye loses the next line. */
  prose: { maxWidth: 660 } as CSSProperties,
};

/**
 * The right-hand context panel — one behaviour, every page.
 *
 * Three properties, and each exists because of a specific failure:
 *
 * 1. **DOCKED when there is room, SLIDE-OVER when there is not.** The ticket
 *    screen used to drop its customer column outright below `roomy`, so on a
 *    laptop the information did not move — it VANISHED, with no way to ask for
 *    it. Overlaying is how a narrow window keeps the content reachable instead
 *    of losing it.
 * 2. **The agent can close it, and it stays closed.** Remembered in
 *    localStorage: somebody who shut it meant it, and re-opening on every
 *    navigation would be the product arguing with them.
 * 3. **Nothing lives ONLY here.** The panel holds supporting detail. If the
 *    single way to do something sat behind a toggle an agent has turned off,
 *    the feature is gone for them — so a customer's phone number is on the
 *    record itself and the panel's `tel:` link is a convenience on top.
 */
/**
 * The phone's bottom bar hides when the page is scrolled DOWN and comes back
 * the moment it is scrolled UP.
 *
 * On a phone the bar costs ~60px of a ~700px screen — nearly a tenth of the
 * reading area, permanently, for navigation an agent uses between tasks
 * rather than during one. Reappearing on an upward scroll is what makes that
 * safe: the gesture for "I want to go somewhere" is the same one that brings
 * it back, so it is never more than a flick away.
 *
 * It is always shown near the top, because a short page that never scrolls
 * far must not be able to leave it hidden.
 */
const HIDE_AFTER_PX = 60;
const SCROLL_NOISE_PX = 6;

function useHideOnScroll(): boolean {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      // Ignore jitter, or the bar flickers on a trackpad and on the rubber
      // band at the end of an iOS scroll.
      if (Math.abs(y - last) < SCROLL_NOISE_PX) return;
      setShown(y < HIDE_AFTER_PX || y < last);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return shown;
}

const CONTEXT_PANEL_KEY = "olink-desk.context-open";
const CONTEXT_WIDTH = 300;

export function useContextPanel(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const stored = window.localStorage.getItem(CONTEXT_PANEL_KEY);
    if (stored !== null) setOpen(stored === "1");
  }, []);
  const set = useCallback((next: boolean) => {
    setOpen(next);
    window.localStorage.setItem(CONTEXT_PANEL_KEY, next ? "1" : "0");
  }, []);
  return [open, set];
}

export function ContextToggle({
  lang,
  open,
  onToggle,
}: {
  lang: Language;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      aria-label={tUi(lang, open ? "ui_context_hide" : "ui_context_show")}
      aria-expanded={open}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 11px",
        borderRadius: 8,
        border: `1px solid ${open ? colors.accent : colors.border}`,
        background: "transparent",
        color: open ? colors.textPrimary : colors.textSecondary,
        fontSize: 13,
        cursor: "pointer",
        fontFamily: font,
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}
    >
      {Icons.panel}
      {tUi(lang, "ui_context_show")}
    </button>
  );
}

/**
 * Main content with the context panel beside it (or over it).
 *
 * The toggle is rendered by the SHELL, not here, so it sits in the same place
 * on every screen — a control that moves per page is a control an agent has to
 * look for.
 */
export function WithContext({
  open,
  onClose,
  context,
  children,
}: {
  open: boolean;
  onClose: () => void;
  context: ReactNode;
  children: ReactNode;
}) {
  const { roomy } = useViewport();
  const docked = open && roomy;

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 16, width: "100%" }}>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>

      {docked ? (
        <aside
          data-context-panel="docked"
          style={{ flex: `0 0 ${CONTEXT_WIDTH}px`, width: CONTEXT_WIDTH, minWidth: 0 }}
        >
          {context}
        </aside>
      ) : null}

      {/* Narrow, and asked for: it comes OVER the content rather than being
          dropped. The backdrop is what makes it dismissible by tapping away,
          which is the gesture people already expect from a sheet. */}
      {open && !roomy ? (
        <>
          <div
            onClick={onClose}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 9998 }}
          />
          <aside
            data-context-panel="slideover"
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(340px, 88vw)",
              zIndex: 9999,
              background: colors.bg,
              borderLeft: `1px solid ${colors.border}`,
              padding: 16,
              overflowY: "auto",
              boxSizing: "border-box",
            }}
          >
            {context}
          </aside>
        </>
      ) : null}
    </div>
  );
}

export const ui = {
  page: {
    minHeight: "100vh",
    background: colors.bg,
    fontFamily: font,
    color: colors.textBody,
  } as CSSProperties,
  card: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    padding: 22,
    // border-box or a declared flex width lies: padding and border would
    // add to it and push fixed-width panes off the right edge.
    boxSizing: "border-box",
  } as CSSProperties,
  h1: { margin: 0, fontSize: 22, color: colors.textPrimary } as CSSProperties,
  h2: { margin: 0, fontSize: 16, color: colors.textPrimary } as CSSProperties,
  sub: { margin: "4px 0 0", color: colors.textSecondary, fontSize: 14 } as CSSProperties,
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: colors.textBody,
    marginBottom: 6,
  } as CSSProperties,
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: radius.sm + 2,
    border: `1px solid ${colors.borderStrong}`,
    background: colors.surfaceRaised,
    color: colors.textPrimary,
    fontSize: 15,
    boxSizing: "border-box",
    fontFamily: font,
  } as CSSProperties,
  button: {
    padding: "10px 16px",
    borderRadius: radius.sm + 2,
    border: "none",
    // `accentSolid`, not `accent`: this is a FILL with a label on it, and in
    // the dark theme the text tint is too light to carry white at 4.5:1.
    background: colors.accentSolid,
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: font,
  } as CSSProperties,
  buttonGhost: {
    padding: "8px 14px",
    borderRadius: radius.sm + 2,
    border: `1px solid ${colors.border}`,
    background: "transparent",
    color: colors.textBody,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: font,
  } as CSSProperties,
  error: {
    background: colors.dangerBg,
    border: `1px solid ${colors.dangerFaint}`,
    color: colors.danger,
    borderRadius: radius.sm + 2,
    padding: "10px 12px",
    fontSize: 14,
  } as CSSProperties,
  ok: {
    background: colors.successBg,
    border: `1px solid ${colors.successFaint}`,
    color: colors.success,
    borderRadius: radius.sm + 2,
    padding: "10px 12px",
    fontSize: 14,
  } as CSSProperties,
  warn: {
    background: colors.warnBg,
    border: `1px solid ${colors.warnFaint}`,
    color: colors.warn,
    borderRadius: radius.sm + 2,
    padding: "10px 12px",
    fontSize: 14,
  } as CSSProperties,
};

export function Badge({
  tone,
  children,
}: {
  tone: "success" | "info" | "warn" | "muted";
  children: ReactNode;
}) {
  const map = {
    success: { bg: colors.successBg, fg: colors.success },
    info: { bg: colors.infoBg, fg: colors.info },
    warn: { bg: colors.warnBg, fg: colors.warn },
    muted: { bg: colors.surfaceHover, fg: colors.textSecondary },
  }[tone];
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        padding: "2px 10px",
        borderRadius: 999,
        background: map.bg,
        color: map.fg,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export { tUi, colors };
export type { Language };
