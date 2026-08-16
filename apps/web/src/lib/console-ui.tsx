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

import { colors, font, radius } from "./theme";

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
} as const;

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

export function AlertBell({
  lang,
  placement = "header",
}: {
  lang: Language;
  /**
   * Where the bell sits, which decides which way the panel opens.
   *
   * "sidebar" is the desktop shell: the bell lives in a 220px rail at the
   * bottom-left, so a right-anchored 320px panel hangs off the left edge of
   * the screen and is simply cut off. It opens rightwards instead.
   * "header" is the mobile top bar, where the bell is at the right and the
   * panel must open down-and-left to stay on screen.
   *
   * A scroll-overflow check cannot catch either mistake — content clipped at
   * negative x adds no scrollWidth — which is exactly how the sidebar case
   * shipped and was caught in a screenshot.
   */
  placement?: "sidebar" | "header";
}) {
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
            // Two different anchors because the bell sits in two different
            // places. In the sidebar it opens rightwards out of the rail. In
            // the mobile header it is NOT the rightmost control — the
            // language picker and sign-out are to its right — so anchoring
            // the panel to the button still pushed it off the left edge.
            // There it spans the viewport instead, which is what a phone
            // wants anyway.
            ...(placement === "sidebar"
              ? {
                  position: "absolute" as const,
                  bottom: 0,
                  left: "calc(100% + 10px)",
                  width: 320,
                  maxWidth: "calc(100vw - 24px)",
                }
              : {
                  position: "fixed" as const,
                  top: 62,
                  left: 12,
                  right: 12,
                  width: "auto",
                }),
            maxHeight: 380,
            overflowY: "auto",
            background: colors.surface,
            border: `1px solid ${colors.borderStrong}`,
            borderRadius: 10,
            boxShadow: "0 16px 40px rgba(0,0,0,.55)",
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

export function ConsoleShell({
  lang,
  onLang,
  me,
  active,
  sidePanel,
  children,
}: {
  lang: Language;
  onLang: (l: Language) => void;
  me: ShellUser | null;
  active: "dashboard" | "inbox" | "channels" | "macros" | "wallboard" | "settings";
  /**
   * The second sidebar layer: a screen's own contextual navigation, docked
   * beside the app nav (the Zendesk shape — product rail, then Views).
   * Screens with no context pass nothing and the layer is not rendered.
   */
  sidePanel?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  usePathname(); // keeps the shell client-routed

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const nav: Array<{
    key: "dashboard" | "inbox" | "channels" | "macros" | "wallboard" | "settings";
    href: string;
    label: string;
    icon: ReactNode;
  }> = [
    { key: "dashboard", href: "/dashboard", label: tUi(lang, "ui_nav_dashboard"), icon: Icons.dashboard },
    { key: "inbox", href: "/inbox", label: tUi(lang, "ui_nav_inbox"), icon: Icons.inbox },
    { key: "channels", href: "/channels", label: tUi(lang, "ui_channels_title"), icon: Icons.channels },
    { key: "macros", href: "/macros", label: tUi(lang, "ui_nav_macros"), icon: Icons.macros },
  ];
  // The wallboard is a supervision surface; agents work the inbox instead.
  if (me && ["SUPERVISOR", "ADMIN", "AUDITOR"].includes(me.user.role)) {
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
          overflowX: "hidden",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            borderBottom: `1px solid ${colors.border}`,
            background: colors.surface,
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentStrong})`,
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: colors.textPrimary, lineHeight: 1.2 }}>
              Olink Desk
            </div>
            {me ? (
              <div
                style={{
                  fontSize: 11,
                  color: colors.textMuted,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {me.organization.name}
              </div>
            ) : null}
          </div>
          {me ? <AlertBell lang={lang} /> : null}
          <LanguagePicker lang={lang} onChange={onLang} />
          <button
            onClick={signOut}
            aria-label={tUi(lang, "ui_sign_out")}
            style={{
              display: "flex",
              alignItems: "center",
              padding: 8,
              borderRadius: radius.sm,
              border: `1px solid ${colors.border}`,
              background: "transparent",
              color: colors.textSecondary,
              cursor: "pointer",
            }}
          >
            {Icons.signOut}
          </button>
        </header>

        <div style={{ flex: 1, minWidth: 0, padding: "16px 14px 84px", boxSizing: "border-box" }}>
          {sidePanel}
          {children}
        </div>

        <nav
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            display: "flex",
            borderTop: `1px solid ${colors.border}`,
            background: colors.surface,
            paddingBottom: "env(safe-area-inset-bottom)",
            zIndex: 10,
          }}
        >
          {nav.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                padding: "10px 4px 8px",
                textDecoration: "none",
                fontSize: 11,
                fontWeight: item.key === active ? 700 : 500,
                color: item.key === active ? colors.accent : colors.textSecondary,
                borderTop: `2px solid ${item.key === active ? colors.accent : "transparent"}`,
              }}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: colors.bg,
        color: colors.textBody,
        fontFamily: font,
      }}
    >
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          borderRight: `1px solid ${colors.border}`,
          background: colors.surface,
          display: "flex",
          flexDirection: "column",
          padding: "20px 12px",
          position: "sticky",
          top: 0,
          height: "100vh",
          boxSizing: "border-box",
        }}
      >
        <div style={{ padding: "0 10px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              aria-hidden
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentStrong})`,
                display: "inline-block",
              }}
            />
            <span style={{ fontWeight: 700, fontSize: 16, color: colors.textPrimary }}>
              Olink Desk
            </span>
          </div>
          {me ? (
            <div style={{ marginTop: 8, fontSize: 12, color: colors.textMuted }}>
              {me.organization.name}
            </div>
          ) : null}
        </div>

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

        <div style={{ marginTop: "auto", display: "grid", gap: 10, padding: "0 4px" }}>
          {me ? <AlertBell lang={lang} placement="sidebar" /> : null}
          <LanguagePicker lang={lang} onChange={onLang} />
          <button
            onClick={signOut}
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
            height: "100vh",
            position: "sticky",
            top: 0,
            overflowY: "auto",
          }}
        >
          {sidePanel}
        </aside>
      ) : null}

      <div style={{ flex: 1, minWidth: 0, padding: "24px 28px", boxSizing: "border-box" }}>
        {children}
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
    background: colors.accent,
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
    border: `1px solid ${colors.danger}44`,
    color: colors.danger,
    borderRadius: radius.sm + 2,
    padding: "10px 12px",
    fontSize: 14,
  } as CSSProperties,
  ok: {
    background: colors.successBg,
    border: `1px solid ${colors.success}44`,
    color: colors.success,
    borderRadius: radius.sm + 2,
    padding: "10px 12px",
    fontSize: 14,
  } as CSSProperties,
  warn: {
    background: colors.warnBg,
    border: `1px solid ${colors.warn}44`,
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
