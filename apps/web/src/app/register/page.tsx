"use client";
// Create-a-workspace: org + first ADMIN user in one form. On success the
// API sets the session cookie and the browser lands on /channels.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  colors,
  LanguagePicker,
  tUi,
  ui,
  useConsoleLanguage,
} from "../../lib/console-ui";
import { Gate } from "../../lib/gate";

export default function RegisterPage() {
  const router = useRouter();
  const [lang, setLang] = useConsoleLanguage();
  const [orgName, setOrgName] = useState("");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName: orgName.trim(),
          slug: slug.trim().toLowerCase(),
          name: name.trim(),
          email: email.trim(),
          password,
        }),
      });
      if (resp.ok) {
        router.push("/dashboard");
        return;
      }
      const body = (await resp.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(
        tUi(lang, "ui_register_failed", {
          error: body?.error ?? `HTTP ${resp.status}`,
        }),
      );
    } catch (err) {
      setError(tUi(lang, "ui_register_failed", { error: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    type = "text",
    autoComplete?: string,
  ) => (
    <label style={{ ...ui.label, marginBottom: 14 }}>
      {label}
      <input
        style={{ ...ui.input, marginTop: 6 }}
        type={type}
        value={value}
        onChange={(e) => set(e.target.value)}
        autoComplete={autoComplete}
        required
      />
    </label>
  );

  return (
    <Gate lang={lang}>
      <div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <LanguagePicker lang={lang} onChange={setLang} />
        </div>
        <form onSubmit={submit} style={ui.card}>
          <h1 style={ui.h1}>
            {tUi(lang, "ui_register_title")}
          </h1>
          <p style={{ margin: "4px 0 20px", color: colors.textSecondary, fontSize: 14 }}>
            {tUi(lang, "ui_login_subtitle")}
          </p>

          {field(tUi(lang, "ui_org_name"), orgName, setOrgName, "text", "organization")}
          <label style={ui.label}>
            {tUi(lang, "ui_workspace")}
            <input
              style={{ ...ui.input, marginTop: 6 }}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              autoComplete="off"
              required
            />
          </label>
          <p style={{ margin: "4px 0 14px", color: colors.textMuted, fontSize: 12 }}>
            {tUi(lang, "ui_workspace_hint")}
          </p>
          {field(tUi(lang, "ui_your_name"), name, setName, "text", "name")}
          {field(tUi(lang, "ui_email"), email, setEmail, "email", "email")}
          {field(tUi(lang, "ui_password"), password, setPassword, "password", "new-password")}

          {error ? <div style={{ ...ui.error, marginBottom: 14 }}>{error}</div> : null}

          <button type="submit" disabled={busy} style={{ ...ui.button, width: "100%" }}>
            {busy ? tUi(lang, "ui_creating") : tUi(lang, "ui_register")}
          </button>

          <p style={{ margin: "16px 0 0", fontSize: 13, textAlign: "center" }}>
            <Link href="/login" style={{ color: colors.accent }}>
              {tUi(lang, "ui_go_sign_in")}
            </Link>
          </p>
        </form>
      </div>
    </Gate>
  );
}
