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

/**
 * The two colours a QR code is allowed to be — and the only values in this
 * file that must NOT follow the theme.
 *
 * A QR symbol is defined dark-on-light: the finder patterns a camera looks for
 * are specified that way, and an inverted code is out of spec. Some phones
 * cope; "some phones" is not a property to ship on the screen that turns on
 * two-factor. So the plate stays white and the modules stay near-black in dark
 * mode as much as light, which is exactly what a `var(--surface)` token would
 * break the moment somebody switched theme.
 *
 * They live here rather than as literals at the call site because that is what
 * the rule is FOR: colour belongs in the token file, whether or not it varies.
 * Being here is also what makes the exception visible — a reader wondering why
 * these are frozen finds the reason, instead of finding a hex in a route and
 * assuming somebody forgot.
 */
export const qr = {
  light: "#ffffff",
  dark: "#0b1220",
} as const;

/**
 * The sign-in stage's own palette — dark in both themes, on purpose.
 *
 * The stage is a hero pane, not a surface: it is always a dark field with
 * light blooms across it, exactly as a cinema poster is dark whatever colour
 * the wall is. Wiring it to `--bg` would turn it white for a light-theme
 * reader and destroy the one screen whose job is to look like something.
 *
 * Two of the blooms sit near the accent and the third is rotated off it —
 * that rotation is what stops the pane reading as a flat tint of one colour,
 * so the third is deliberately NOT derived from the accent.
 *
 * Here rather than as literals in `gate.tsx` for the same reason as `qr`:
 * colour belongs in the token file whether or not it varies, and being here
 * is what makes "these do not follow the theme" a decision on the record
 * instead of something that looks forgotten.
 */
export const stage = {
  field: "#0b0d13",
  bloomA: "#5b9dff",
  bloomB: "#7c5cff",
  bloomC: "#ff8ab5",
  ink: "#ffffff",
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

/**
 * The lifecycle chart palette, in stack order.
 *
 * Here rather than in the screen because it is part of the design system, and
 * because the no-raw-hex guard is right to insist: a colour chosen once and
 * validated should not then live somewhere a second person can add a fifth to
 * it without re-running the checks.
 *
 * NOT eyeballed. Run through the palette validator against both real surfaces
 * in this exact order, because order is what the adjacent-pair colour-blind
 * check reads. The obvious first set — blue, green, amber, violet, slate —
 * failed three ways: outside the lightness band, slate below the chroma
 * floor, and violet against blue at ΔE 1.3 under deuteranopia, which is
 * invisible. Looking at it would never have found the third.
 *
 * One set for both themes: every hue sits inside the overlap of the light and
 * dark lightness bands, so neither theme needs its own steps.
 *
 * Adding a fifth state means re-running the validator, not picking a nice
 * colour — four is already at the point where adjacent hues stay separable.
 */
export const LIFECYCLE_INK = {
  NEW: "#2563eb",
  OPEN: "#0d9488",
  PENDING: "#d97706",
  DONE: "#9333ea",
} as const;

/**
 * The interface stack — and it says two different things for the two scripts,
 * deliberately (ported from Bank Assist's ADR-0028).
 *
 * **Latin is OURS, and Inter must lead.** CSS fallback is per CHARACTER, so
 * putting Inter first costs Amharic nothing: a Ge'ez codepoint simply is not
 * in Inter and moves on down the list. Ethiopic used to lead this stack, which
 * meant every Latin character in the product — labels, metrics, English
 * answers — was drawn with a Ge'ez face's Latin glyphs.
 *
 * **Ge'ez is the READER'S, and our copy stays LAST.** Nyala is what Windows
 * supplies and what an Amharic reader recognises as properly set; Abyssinica
 * SIL and the OS Noto follow. Our vendored Noto is the last resort only.
 * Promoting it up the list looks like a tidy-up and costs every Ethiopian
 * reader both the right face and 198 KB — a webfont is fetched only when it
 * wins the fallback, so on a machine with any Ethiopic font ours never
 * downloads at all.
 */
export const font =
  "'Inter Variable', Inter, " +
  "Nyala, 'Abyssinica SIL', 'Noto Sans Ethiopic', Ebrima, " +
  "'Noto Sans Ethiopic Variable', " +
  "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/**
 * The display serif, and it reaches exactly as far as the sign-in gate.
 *
 * A page set entirely in one neutral sans has no voice — the first build of
 * Bank Assist's gate read as a template for exactly that reason. The serif is
 * for display sizes and numerals only.
 *
 * **Playfair has no Ethiopic at all**, so a Ge'ez headline in it falls through
 * to a system face while KEEPING the serif's tracking and leading. Anything
 * using this must switch family as well as spacing under `:lang(am|ti)` — see
 * `geezDisplayCss`.
 */
export const displayFont =
  "'Playfair Display', " + font;

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
:root{--rail-w:210px;--rail-label:inline;--rail-justify:flex-start;--rail-pad:9px 10px;--rail-box:16px 12px;--views-w:230px;--views-pad:20px 12px;--rail-open:inline-flex;--rail-shut:none;--rail-sub:grid}
:root[data-rail="0"]{--rail-w:56px;--rail-label:none;--rail-justify:center;--rail-pad:9px 0;--rail-box:16px 8px;--rail-open:none;--rail-shut:inline-flex;--rail-sub:none}
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

/**
 * The vendored faces.
 *
 * In the repo and served from our own origin — never Google Fonts. The console
 * shows customer conversations and the widget runs on a bank's own production
 * pages, so a third-party font origin is a CSP entry and a security-review
 * question in exchange for nothing. Both families are SIL OFL 1.1 with the
 * licences committed beside them.
 *
 * They are VARIABLE (one file covers 100–900) and split by script, so
 * `unicode-range` decides what downloads: an English session fetches 71 KB of
 * Latin and never touches the 198 KB of Ge'ez. Dropping the ranges would put
 * all of it on every Ethiopian mobile connection.
 *
 * Inter is the build WITH the `opsz` axis (14–32), not the weight-only one.
 * With `font-optical-sizing: auto` a display-size heading moves onto the
 * display cut; the weight-only file renders the text cut blown up, which is
 * visibly not the same typeface. It costs 23 KB.
 */
export const fontFaceCss = `
  @font-face {
    font-family: 'Inter Variable';
    font-style: normal;
    font-weight: 100 900;
    font-display: swap;
    src: url('/fonts/inter-latin.woff2') format('woff2');
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6,
      U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+2074, U+20AC,
      U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
  }
  @font-face {
    font-family: 'Inter Variable';
    font-style: normal;
    font-weight: 100 900;
    font-display: swap;
    src: url('/fonts/inter-latin-ext.woff2') format('woff2');
    unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7,
      U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F,
      U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F,
      U+A720-A7FF;
  }
  @font-face {
    font-family: 'Playfair Display';
    font-style: normal;
    font-weight: 400 900;
    font-display: swap;
    src: url('/fonts/playfair-latin.woff2') format('woff2');
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6,
      U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+2074, U+20AC,
      U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
  }
  @font-face {
    font-family: 'Playfair Display';
    font-style: normal;
    font-weight: 400 900;
    font-display: swap;
    src: url('/fonts/playfair-latin-ext.woff2') format('woff2');
    unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7,
      U+02DD-02FF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0,
      U+2113, U+2C60-2C7F, U+A720-A7FF;
  }
  /* Last in the Ge'ez fallback by NAME — see \`font\`. Declared so a machine
     with no Ethiopic face at all still renders Amharic, and fetched only in
     that case. */
  @font-face {
    font-family: 'Noto Sans Ethiopic Variable';
    font-style: normal;
    font-weight: 100 900;
    font-display: swap;
    src: url('/fonts/noto-sans-ethiopic.woff2') format('woff2');
    unicode-range: U+1200-1399, U+2D80-2DDE, U+AB01-AB2E, U+1E7E0-1E7E6,
      U+1E7E8-1E7EB, U+1E7ED-1E7EE, U+1E7F0-1E7FE;
  }
  html { font-optical-sizing: auto; }
`;

/**
 * Ge'ez is not Latin. Do not set it like Latin.
 *
 * Four values tuned for a Latin display face are all wrong for Ethiopic, and
 * each was found the hard way in Bank Assist:
 *
 *  - **Negative tracking CROWDS it.** A Ge'ez character is a whole syllable
 *    with dense internal structure and sidebearings already at the minimum
 *    that keeps the strokes apart. Pulling a pixel from each gap at 46px is
 *    what turned the Amharic hero into a grey block.
 *  - **1.1 leading is too tight** — Ethiopic has almost no descenders but tall
 *    busy forms, so two lines nearly touch.
 *  - **700 fills the counters in.** 600 reads better, and the difference is
 *    invisible beside the Latin because the script is denser anyway. On
 *    Windows this is binary: Nyala has only Regular and Bold, so 600 resolves
 *    to Bold and 500 to Regular with nothing between.
 *  - **PLAYFAIR HAS NO ETHIOPIC**, so the family must switch too, or the
 *    headline falls to a system face while keeping the serif's spacing.
 *
 * And a fifth, which is a SIZE problem rather than a spacing one: a Ge'ez
 * syllable fills its em box where Latin lowercase fills about half, so the two
 * scripts at the same px do not read as the same size — Ge'ez reads about a
 * third larger. The display size is capped for it rather than left to tower
 * over the Latin beside it.
 *
 * Keyed on `:lang()` so it follows the TEXT, not the panel — the sign-in mock
 * cycles languages independently of the interface.
 */
export const geezDisplayCss = `
  .display:lang(am), .display:lang(ti) {
    font-family: ${font};
    letter-spacing: normal;
    line-height: 1.28;
    font-weight: 600;
    font-size: clamp(26px, 3.4vw, 44px);
  }
`;
