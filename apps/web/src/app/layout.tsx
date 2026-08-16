import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { colors, font, PALETTES, railCss, themeBootScript, themeCss } from "../lib/theme";

export const metadata: Metadata = {
  title: "Olink Desk",
  description:
    "Customer support, task & call tracking for Ethiopian organizations.",
};

export const viewport: Viewport = {
  // Paints the browser's own chrome — the iOS Safari toolbar and the Android
  // address bar. Without it the app is one colour and the phone's UI around
  // it is another, which reads as the app not filling the screen.
  //
  // Two entries, because this is served as a static meta tag before any
  // script runs and so cannot read the user's stored choice. The media query
  // is the only signal available that early; an explicit choice that
  // disagrees with the OS gets the wrong toolbar tint for one paint, which is
  // the cheapest of the available wrong answers.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: PALETTES.light.bg },
    { media: "(prefers-color-scheme: dark)", color: PALETTES.dark.bg },
  ],
};

// The reset, written from the design tokens rather than as literal hex, so
// `theme.ts` stays the single source of truth for colour (project rule: no
// raw hex outside the token file).
//
// This exists because there was no global stylesheet at all, which left the
// browser's default `body { margin: 8px }` and white canvas in place — so
// every screen rendered as a panel inside a frame of the wrong colour. The
// margin is what draws the frame; the background is what stops it flashing
// during overscroll and behind any area a screen does not paint itself.
//
// `color-scheme` is no longer set here: it now rides with each theme block in
// `themeCss`, because a hard-coded `dark` would have kept the scrollbars dark
// for a user who chose light.
//
// Deliberately NOT included: a global `box-sizing: border-box`. It would be
// the conventional next line of any reset, and it would silently change the
// geometry of every fixed-width pane in the console. Components that need it
// declare it (see `ui.card`).
const reset = `
  html, body {
    margin: 0;
    padding: 0;
    min-height: 100%;
    background: ${colors.bg};
    font-family: ${font};
  }
  /* The scroll chain must not expose the raw canvas above or below the app
     when a touch scroll runs past the end of a list. */
  html { overscroll-behavior: none; }
  body { -webkit-font-smoothing: antialiased; }
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss + railCss + reset }} />
        {/* Before first paint, so a dark-theme user never sees a white flash.
            `suppressHydrationWarning` on <html> above is required: this
            script legitimately changes an attribute the server did not
            render, and without it React logs a mismatch on every load. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
