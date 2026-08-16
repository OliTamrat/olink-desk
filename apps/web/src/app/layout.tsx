import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { colors, font } from "../lib/theme";

export const metadata: Metadata = {
  title: "Olink Desk",
  description:
    "Customer support, task & call tracking for Ethiopian organizations.",
};

export const viewport: Viewport = {
  // Paints the browser's own chrome dark — the iOS Safari toolbar and the
  // Android address bar. Without it the app is dark and the phone's UI
  // around it is white, which reads as the app not filling the screen.
  themeColor: colors.bg,
  // Tells the engine to render NATIVE surfaces dark: scrollbars, the
  // overscroll area, form-control defaults. A light scrollbar gutter is a
  // white stripe down the side of a black console.
  colorScheme: "dark",
};

// The reset, written from the design tokens rather than as literal hex, so
// `theme.ts` stays the single source of truth for colour (project rule: no
// raw hex outside the token file).
//
// This exists because there was no global stylesheet at all, which left the
// browser's default `body { margin: 8px }` and white canvas in place — so
// every screen rendered as a dark panel inside a white frame. The margin is
// what draws the frame; the background is what stops it flashing white
// during overscroll and behind any area a screen does not paint itself.
//
// Deliberately NOT included: a global `box-sizing: border-box`. It would be
// the conventional next line of any reset, and it would silently change the
// geometry of every fixed-width pane in the console. Components that need it
// declare it (see `ui.card`).
const reset = `
  html {
    /* Set as a CSS property, not only via the viewport meta: the meta hints
       the engine but leaves the computed \`color-scheme\` at "normal", so
       scrollbars stayed light. This is the declaration that darkens them. */
    color-scheme: dark;
  }
  html, body {
    margin: 0;
    padding: 0;
    min-height: 100%;
    background: ${colors.bg};
    font-family: ${font};
  }
  /* The scroll chain must not expose the white canvas above or below the
     app when a touch scroll runs past the end of a list. */
  html { overscroll-behavior: none; }
  body { -webkit-font-smoothing: antialiased; }
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: reset }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
