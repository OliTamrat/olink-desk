"use client";
// Staff sign-in. On success the session cookie is set by the API and the
// browser moves to /channels — the screen this console slice exists for.
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  LanguagePicker,
  tUi,
  ui,
  useConsoleLanguage,
} from "../../lib/console-ui";

export default function LoginPage() {
  const router = useRouter();
  const [lang, setLang] = useConsoleLanguage();
  const [orgSlug, setOrgSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgSlug: orgSlug.trim(), email: email.trim(), password }),
      });
      if (resp.ok) {
        router.push("/channels");
        return;
      }
      setError(
        resp.status === 423
          ? tUi(lang, "ui_locked_out")
          : tUi(lang, "ui_wrong_credentials"),
      );
    } catch {
      setError(tUi(lang, "ui_wrong_credentials"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ ...ui.page, display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <LanguagePicker lang={lang} onChange={setLang} />
        </div>
        <form onSubmit={submit} style={ui.card}>
          <h1 style={{ margin: 0, fontSize: 22 }}>{tUi(lang, "ui_login_title")}</h1>
          <p style={{ margin: "4px 0 20px", color: "#475467", fontSize: 14 }}>
            {tUi(lang, "ui_login_subtitle")}
          </p>

          <label style={ui.label}>
            {tUi(lang, "ui_workspace")}
            <input
              style={{ ...ui.input, marginTop: 6 }}
              value={orgSlug}
              onChange={(e) => setOrgSlug(e.target.value)}
              autoComplete="organization"
              required
            />
          </label>
          <p style={{ margin: "4px 0 14px", color: "#667085", fontSize: 12 }}>
            {tUi(lang, "ui_workspace_hint")}
          </p>

          <label style={ui.label}>
            {tUi(lang, "ui_email")}
            <input
              style={{ ...ui.input, marginTop: 6, marginBottom: 14 }}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label style={ui.label}>
            {tUi(lang, "ui_password")}
            <input
              style={{ ...ui.input, marginTop: 6, marginBottom: 18 }}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error ? <div style={{ ...ui.error, marginBottom: 14 }}>{error}</div> : null}

          <button type="submit" disabled={busy} style={{ ...ui.button, width: "100%" }}>
            {busy ? tUi(lang, "ui_signing_in") : tUi(lang, "ui_sign_in")}
          </button>
        </form>
      </div>
    </main>
  );
}
