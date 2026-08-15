// Olink Desk console design tokens — the single source of truth for color,
// the fleet's design-system discipline (no raw hex in components; reference
// tokens). True-black base like the dispatch dashboard; Desk's own accent.
// Text ladder: textPrimary > textBody > textSecondary > textMuted — all
// ≥ WCAG 4.5:1 on the near-black background.

export const colors = {
  bg: "#0a0a0c",
  surface: "#121216",
  surfaceRaised: "#18181e",
  surfaceHover: "#1e1e26",
  border: "#26262e",
  borderStrong: "#34343e",

  accent: "#7c7cf5",
  accentStrong: "#5b5bd6",
  onAccent: "#ffffff",

  textPrimary: "#f4f4f6",
  textBody: "#d6d6dc",
  textSecondary: "#a3a3ae",
  textMuted: "#787882",

  success: "#34d399",
  successBg: "#0b2b1f",
  warn: "#fbbf24",
  warnBg: "#2b230b",
  danger: "#f87171",
  dangerBg: "#2b0f0f",
  info: "#60a5fa",
  infoBg: "#0e1f33",
} as const;

export const font =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Ethiopic', sans-serif";

export const radius = { sm: 6, md: 10, lg: 14 } as const;
