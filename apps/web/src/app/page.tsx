import Link from "next/link";

import { colors, font } from "../lib/theme";

export default function Home() {
  return (
    <main
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "100vh",
        // Was `system-ui, sans-serif` and three literal hex values — the one
        // page in the app that predated the token file and never joined it,
        // so it stayed light while everything else was dark and would have
        // stayed the wrong shade of blue after the accent changed.
        fontFamily: font,
        background: colors.bg,
        color: colors.textBody,
      }}
    >
      <div style={{ textAlign: "center", padding: 24 }}>
        <h1 style={{ marginBottom: 8, color: colors.textPrimary }}>Olink Desk</h1>
        <p style={{ color: colors.textSecondary, marginBottom: 20 }}>
          Customer support, task &amp; call tracking for Ethiopian
          organizations.
        </p>
        <Link
          href="/login"
          style={{
            display: "inline-block",
            padding: "10px 20px",
            borderRadius: 8,
            background: colors.accentSolid,
            color: colors.onAccent,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Staff sign in
        </Link>
      </div>
    </main>
  );
}
