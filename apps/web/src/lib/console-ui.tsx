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
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

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
  signOut: (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  ),
} as const;

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
  children,
}: {
  lang: Language;
  onLang: (l: Language) => void;
  me: ShellUser | null;
  active: "dashboard" | "inbox" | "channels" | "wallboard";
  children: ReactNode;
}) {
  const router = useRouter();
  usePathname(); // keeps the shell client-routed

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const nav: Array<{
    key: "dashboard" | "inbox" | "channels" | "wallboard";
    href: string;
    label: string;
    icon: ReactNode;
  }> = [
    { key: "dashboard", href: "/dashboard", label: tUi(lang, "ui_nav_dashboard"), icon: Icons.dashboard },
    { key: "inbox", href: "/inbox", label: tUi(lang, "ui_nav_inbox"), icon: Icons.inbox },
    { key: "channels", href: "/channels", label: tUi(lang, "ui_channels_title"), icon: Icons.channels },
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

      <div style={{ flex: 1, minWidth: 0, padding: "28px 32px", boxSizing: "border-box" }}>
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
