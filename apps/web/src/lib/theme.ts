// Olink Desk console design tokens — the single source of truth for colour.
//
// `colors.*` are CSS CUSTOM PROPERTY REFERENCES, not hex. That is what makes
// light and dark one product rather than two: every screen already writes
// `colors.textMuted`, so redefining the variable under a theme selector
// re-themes 444 call sites without touching any of them. A component that
// resolved a hex at render time would have to re-render to change theme, and
// would flash the wrong colour on first paint.
//
// The real values live in PALETTES below, one map per theme, same keys. A key
// present in one and missing from the other is a compile error rather than an
// unstyled corner found later by a customer.
//
// Text ladder: textPrimary > textBody > textSecondary > textMuted, every rung
// ≥ WCAG 4.5:1 on that theme's own background — checked in
// `packages/tickets/test/contrast.test.ts`, not by eye.

export const colors = {
  bg: "var(--bg)",
  surface: "var(--surface)",
  surfaceRaised: "var(--surface-raised)",
  surfaceHover: "var(--surface-hover)",
  border: "var(--border)",
  borderStrong: "var(--border-strong)",

  // Two accents, because one colour cannot do both jobs at 4.5:1 in a dark
  // theme. `accent` is the interactive colour drawn AS text, icons and rules
  // on the page background. `accentSolid` is what a filled control is painted
  // WITH, carrying `onAccent` on top. In the light theme they are the same
  // blue; in the dark one the fill has to be darker than the text tint or the
  // label on the button fails contrast.
  accent: "var(--accent)",
  accentSolid: "var(--accent-solid)",
  accentFaint: "var(--accent-faint)",
  onAccent: "var(--on-accent)",

  textPrimary: "var(--text-primary)",
  textBody: "var(--text-body)",
  textSecondary: "var(--text-secondary)",
  textMuted: "var(--text-muted)",

  success: "var(--success)",
  successBg: "var(--success-bg)",
  successFaint: "var(--success-faint)",
  warn: "var(--warn)",
  warnBg: "var(--warn-bg)",
  warnFaint: "var(--warn-faint)",
  warnBorder: "var(--warn-border)",
  danger: "var(--danger)",
  dangerBg: "var(--danger-bg)",
  dangerFaint: "var(--danger-faint)",
  info: "var(--info)",
  infoBg: "var(--info-bg)",

  // Shadows are a colour decision too. A dark theme separates a popover from
  // the page with a heavy black drop; on white that same drop reads as dirt,
  // and the separation has to come from a tighter, lighter shadow plus the
  // border. Carried as whole `box-shadow` values rather than a colour, so the
  // blur and offset can differ per theme as well.
  shadow: "var(--shadow)",
  shadowStrong: "var(--shadow-strong)",
} as const;

export type ColorToken = keyof typeof colors;

/**
 * The values themselves.
 *
 * The faint variants are spelled out rather than composed with `color-mix()`
 * at runtime: this console's users are on cheap Android handsets whose Chrome
 * predates it, and a border that silently computes to `transparent` on an old
 * browser is exactly the kind of degradation nobody reports.
 */
export const PALETTES: Record<"light" | "dark", Record<ColorToken, string>> = {
  dark: {
    bg: "#0a0a0c",
    surface: "#121216",
    surfaceRaised: "#18181e",
    surfaceHover: "#1e1e26",
    border: "#26262e",
    borderStrong: "#34343e",

    accent: "#5b9dff",
    accentSolid: "#2563eb",
    accentFaint: "#5b9dff55",
    onAccent: "#ffffff",

    textPrimary: "#f4f4f6",
    textBody: "#d6d6dc",
    textSecondary: "#a3a3ae",
    textMuted: "#8b8b95",

    success: "#34d399",
    successBg: "#0b2b1f",
    successFaint: "#34d39955",
    warn: "#fbbf24",
    warnBg: "#2b230b",
    warnFaint: "#fbbf2455",
    warnBorder: "#fbbf2488",
    danger: "#f87171",
    dangerBg: "#2b0f0f",
    dangerFaint: "#f8717144",
    info: "#60a5fa",
    infoBg: "#0e1f33",

    shadow: "0 10px 30px rgba(0,0,0,.45)",
    shadowStrong: "0 16px 40px rgba(0,0,0,.6)",
  },
  light: {
    // Not white-on-white: the page is a shade off, so a card reads as a card
    // without needing a shadow to say so.
    bg: "#f6f7f9",
    surface: "#ffffff",
    surfaceRaised: "#ffffff",
    surfaceHover: "#eef1f5",
    // Measured, not eyeballed: #e3e7ed came in at 1.16 against this
    // page colour, which is a card edge you cannot see.
    border: "#d7dee7",
    borderStrong: "#c0cad6",

    accent: "#1d4ed8",
    accentSolid: "#1d4ed8",
    accentFaint: "#1d4ed855",
    onAccent: "#ffffff",

    textPrimary: "#0f172a",
    textBody: "#27303f",
    textSecondary: "#4a5568",
    textMuted: "#5f6b7a",

    success: "#047857",
    successBg: "#ecfdf5",
    successFaint: "#04785755",
    warn: "#b45309",
    warnBg: "#fffbeb",
    warnFaint: "#b4530955",
    warnBorder: "#b4530988",
    danger: "#b91c1c",
    dangerBg: "#fef2f2",
    dangerFaint: "#b91c1c44",
    info: "#1d4ed8",
    infoBg: "#eff6ff",

    shadow: "0 6px 20px rgba(15,23,42,.10)",
    shadowStrong: "0 12px 32px rgba(15,23,42,.16)",
  },
};

/** `--text-primary` from `textPrimary`. */
export function cssVarName(token: ColorToken): string {
  return `--${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

function block(theme: "light" | "dark"): string {
  return (Object.keys(colors) as ColorToken[])
    .map((t) => `${cssVarName(t)}:${PALETTES[theme][t]};`)
    .join("");
}

/**
 * The stylesheet, in the three-state shape a theme toggle actually needs.
 *
 * 1. Bare `:root` carries LIGHT. A colour whose only definition sits inside a
 *    media query has no value at all when that query does not match.
 * 2. `prefers-color-scheme: dark` supplies dark for everyone who has picked
 *    nothing — guarded by `:not([data-theme="light"])` so an explicit light
 *    choice survives a dark OS.
 * 3. `[data-theme="dark"]` supplies it again, so an explicit dark choice
 *    survives a light OS. Both directions, or the toggle only works one way.
 *
 * `color-scheme` rides along on each so the browser's OWN surfaces follow —
 * scrollbars, the overscroll gutter, form-control defaults. Without it a light
 * scrollbar runs down the side of a black console.
 */
export const themeCss = `
:root{color-scheme:light;${block("light")}}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){color-scheme:dark;${block("dark")}}}
:root[data-theme="dark"]{color-scheme:dark;${block("dark")}}
`;

/**
 * Pin a document to one theme regardless of the reader's OS.
 *
 * For the embeddable widget. It renders inside an iframe on somebody else's
 * website, and the loader that creates that iframe is plain JavaScript on a
 * third-party page — it cannot read these variables, so its border and
 * background are literals. If the widget followed the VISITOR's OS while the
 * frame around it stayed fixed, a visitor on a light machine would get a pale
 * panel inside a dark border on a bank's homepage. Same-origin theming is a
 * console feature; the widget's appearance belongs to the tenant.
 *
 * Emitted by the page itself, after the head stylesheet, so it wins on order
 * without needing greater specificity — and without a flash, because it is
 * still server-rendered CSS rather than a script.
 */
export function pinnedThemeCss(theme: "light" | "dark"): string {
  return `:root{color-scheme:${theme};${block(theme)}}`;
}

export const font =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Ethiopic', sans-serif";

export const radius = { sm: 6, md: 10, lg: 14 } as const;

export const RAIL_KEY = "olink-desk.rail-open";
export const VIEWS_KEY = "olink-desk.views-open";

/**
 * The rails' geometry, as CSS rather than as React state.
 *
 * Same problem as the theme flash and the same shape of fix. React learns
 * that a rail was collapsed from localStorage in an effect, which is AFTER
 * first paint — so somebody who folded the rail watched it swing open and
 * shut again on every navigation, shifting the whole page 154px sideways
 * each time. Driving width from a custom property lets the boot script decide
 * before anything is drawn, while React keeps the state it needs for the
 * toggle's own labelling.
 *
 * The labels are gated the same way, or the first paint would be a 56px rail
 * with full-width text clipped inside it.
 */
export const railCss = `
:root{--rail-w:210px;--rail-label:inline;--rail-justify:flex-start;--rail-pad:9px 10px;--rail-box:16px 12px;--views-w:230px;--views-pad:20px 12px;--rail-open:inline-flex;--rail-shut:none}
:root[data-rail="0"]{--rail-w:56px;--rail-label:none;--rail-justify:center;--rail-pad:9px 0;--rail-box:16px 8px;--rail-open:none;--rail-shut:inline-flex}
:root[data-views="0"]{--views-w:0px;--views-pad:0}
`;

export const THEME_KEY = "olink-desk.appearance";
export type Appearance = "light" | "dark" | "system";

/**
 * Runs BEFORE first paint, inlined in <head>.
 *
 * React cannot do this job: it stamps the attribute after hydration, which is
 * a white flash on every navigation for a dark-theme user — the single most
 * common defect in a themed app. Written as a string because it has to be a
 * blocking classic script, and kept to one statement that cannot throw: a
 * `<head>` script that throws takes the page with it, and localStorage throws
 * in private mode on some browsers.
 */
export const themeBootScript = `try{var d=document.documentElement,t=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)});if(t==="dark"||t==="light")d.setAttribute("data-theme",t);if(localStorage.getItem(${JSON.stringify(
  RAIL_KEY,
)})==="0")d.setAttribute("data-rail","0");if(localStorage.getItem(${JSON.stringify(
  VIEWS_KEY,
)})==="0")d.setAttribute("data-views","0")}catch(e){}`;
