"use client";
// Staff sign-in. On success the session cookie is set by the API and the
// browser moves to /channels — the screen this console slice exists for.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Gate } from "../../lib/gate";
import {
  colors,
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
  // The second step. The password has been accepted and the cookie now held
  // resolves to NOBODY until a code is proved, so this is a real gate rather
  // than a screen the client could skip.
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");

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
        const body = (await resp.json().catch(() => null)) as {
          mfaRequired?: boolean;
        } | null;
        if (body?.mfaRequired) {
          setNeedsCode(true);
          // The password is not needed again and must not sit in a React state
          // for the rest of the session.
          setPassword("");
          return;
        }
        router.push("/dashboard");
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

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/auth/mfa/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (resp.ok) {
        router.push("/dashboard");
        return;
      }
      const body = (await resp.json().catch(() => null)) as { error?: string } | null;
      // A lapsed pending window is not a wrong code, and telling somebody to
      // check their authenticator when the answer is "start again" wastes the
      // next five minutes too.
      if (body?.error === "no_pending_login") {
        setNeedsCode(false);
        setCode("");
        setError(tUi(lang, "ui_mfa_expired"));
        return;
      }
      setError(tUi(lang, "ui_mfa_bad_code"));
      setCode("");
    } catch {
      setError(tUi(lang, "ui_mfa_bad_code"));
    } finally {
      setBusy(false);
    }
  }

  if (needsCode) {
    return (
      <Gate lang={lang}>
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <LanguagePicker lang={lang} onChange={setLang} />
          </div>
          <form onSubmit={submitCode} style={ui.card}>
            <h1 style={ui.h1}>{tUi(lang, "ui_mfa_challenge_title")}</h1>
            <p style={{ margin: "4px 0 20px", color: colors.textSecondary, fontSize: 14, lineHeight: 1.55 }}>
              {tUi(lang, "ui_mfa_challenge_sub")}
            </p>

            <label style={ui.label}>
              {tUi(lang, "ui_mfa_enter_code")}
              <input
                style={{
                  ...ui.input,
                  marginTop: 6,
                  // A six-digit code read off a phone is easier to check
                  // against the screen when the digits do not reflow.
                  letterSpacing: ".18em",
                  fontVariantNumeric: "tabular-nums",
                }}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                // Not `type="number"`: a recovery code goes in this same box,
                // and a numeric input silently refuses letters. `inputMode`
                // still brings up the digit keypad on a phone.
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </label>
            <p style={{ margin: "6px 0 16px", color: colors.textMuted, fontSize: 12 }}>
              {tUi(lang, "ui_mfa_recovery_hint")}
            </p>

            {error ? <div style={{ ...ui.error, marginBottom: 14 }}>{error}</div> : null}

            <button type="submit" disabled={busy || !code.trim()} style={{ ...ui.button, width: "100%" }}>
              {busy ? tUi(lang, "ui_signing_in") : tUi(lang, "ui_mfa_verify")}
            </button>

            <p style={{ margin: "16px 0 0", fontSize: 13, textAlign: "center" }}>
              <button
                type="button"
                onClick={() => {
                  setNeedsCode(false);
                  setCode("");
                  setError(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: colors.accent,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {tUi(lang, "ui_mfa_back_to_login")}
              </button>
            </p>
          </form>
        </div>
      </Gate>
    );
  }

  return (
    <Gate lang={lang}>
      <div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <LanguagePicker lang={lang} onChange={setLang} />
        </div>
        <form onSubmit={submit} style={ui.card}>
          <h1 style={ui.h1}>{tUi(lang, "ui_login_title")}</h1>
          <p style={{ margin: "4px 0 20px", color: colors.textSecondary, fontSize: 14 }}>
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
          <p style={{ margin: "4px 0 14px", color: colors.textMuted, fontSize: 12 }}>
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

          <p style={{ margin: "16px 0 0", fontSize: 13, textAlign: "center" }}>
            <Link href="/register" style={{ color: colors.accent }}>
              {tUi(lang, "ui_go_register")}
            </Link>
          </p>
        </form>
      </div>
    </Gate>
  );
}
