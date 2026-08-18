"use client";
// Your own account. Deliberately NOT under workspace Settings.
//
// Settings is administration of the organisation and sits behind admin roles.
// Your own password and your own second factor are not administration — and
// putting them there would mean an agent could not turn on their own
// two-factor, which is a permission check standing between somebody and the
// security of their own account. Every signed-in member reaches this page.
import { useCallback, useEffect, useState } from "react";

import { IconTile, stroke } from "../../lib/card";
import {
  Badge,
  colors,
  ConsoleShell,
  layout,
  tUi,
  ui,
  useConsoleLanguage,
  useMe,
} from "../../lib/console-ui";

type State = "off" | "pending" | "on";

interface Status {
  state: State;
  verifiedAt: string | null;
  recoveryCodesLeft: number;
}

interface Enrolment {
  secret: string;
  uri: string;
  qr: string;
}

export default function AccountPage() {
  const [lang, setLang] = useConsoleLanguage();
  const me = useMe();
  const [status, setStatus] = useState<Status | null>(null);
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  // Shown exactly once, straight after they are minted. Held in state rather
  // than refetched because there is nothing to refetch — only their hashes
  // were stored.
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirming, setConfirming] = useState<"disable" | "regenerate" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const resp = await fetch("/api/auth/mfa");
    if (resp.ok) setStatus((await resp.json()) as Status);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/auth/mfa", { method: "POST" });
      if (!resp.ok) throw new Error(String(resp.status));
      setEnrolment((await resp.json()) as Enrolment);
    } catch {
      setError(tUi(lang, "ui_save_failed", { error: "—" }));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/auth/mfa", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!resp.ok) {
        setError(tUi(lang, "ui_mfa_bad_code"));
        setCode("");
        return;
      }
      const body = (await resp.json()) as { recoveryCodes: string[] };
      setCodes(body.recoveryCodes);
      setEnrolment(null);
      setCode("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  /** Turning it off and replacing the codes both re-ask for the password: a
   *  signed-in cookie is not evidence that the person at the keyboard is the
   *  account holder, and an unattended session is exactly the attack this
   *  feature exists to stop. */
  async function withPassword(action: "disable" | "regenerate") {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/auth/mfa", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, action }),
      });
      if (!resp.ok) {
        setError(tUi(lang, "ui_mfa_bad_password"));
        return;
      }
      const body = (await resp.json().catch(() => null)) as {
        recoveryCodes?: string[];
      } | null;
      if (body?.recoveryCodes) setCodes(body.recoveryCodes);
      setConfirming(null);
      setPassword("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  const on = status?.state === "on";

  return (
    <ConsoleShell lang={lang} onLang={setLang} me={me} active="account">
      <div style={{ ...layout.centred, display: "grid", gap: 16 }}>
        <div>
          <h1 style={ui.h1}>{tUi(lang, "ui_account")}</h1>
        </div>

        {error ? <div style={ui.error}>{error}</div> : null}

        <section style={{ ...ui.card, display: "grid", gap: 12 }} data-mfa-card>
          <div style={{ display: "flex", gap: 11, alignItems: "center", flexWrap: "wrap" }}>
            <IconTile size={34}>
              <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </IconTile>
            <h2 style={{ ...ui.h2, margin: 0, flex: 1 }}>{tUi(lang, "ui_mfa_title")}</h2>
            <Badge tone={on ? "success" : "muted"}>
              {tUi(lang, on ? "ui_mfa_on" : "ui_mfa_off")}
            </Badge>
          </div>

          <p style={{ ...ui.sub, margin: 0, maxWidth: 620 }}>{tUi(lang, "ui_mfa_blurb")}</p>

          {/* ---- enrolment: the QR, the typed key, and the first code ---- */}
          {enrolment ? (
            <div style={{ display: "grid", gap: 12 }} data-mfa-enrol>
              <div style={{ fontSize: 13, color: colors.textBody }}>
                {tUi(lang, "ui_mfa_scan")}
              </div>
              {/* On a white plate, never on the panel's dark surface: inverted
                  QR codes are out of spec and "some phones cope" is not a
                  property to ship on the screen that turns on two-factor. */}
              <div
                style={{
                  background: "#ffffff",
                  borderRadius: 12,
                  padding: 12,
                  width: "fit-content",
                  lineHeight: 0,
                }}
                dangerouslySetInnerHTML={{ __html: enrolment.qr }}
              />
              <div style={{ fontSize: 13, color: colors.textBody }}>
                {tUi(lang, "ui_mfa_manual")}
              </div>
              {/* The QR is unusable to somebody whose authenticator is on this
                  same device, or reading by screen reader. This is the other
                  half of the same step, not a fallback. */}
              <code
                style={{
                  fontSize: 14,
                  letterSpacing: ".12em",
                  color: colors.textPrimary,
                  background: colors.surfaceHover,
                  padding: "10px 12px",
                  borderRadius: 8,
                  wordBreak: "break-all",
                }}
              >
                {enrolment.secret}
              </code>

              <label style={ui.label}>
                {tUi(lang, "ui_mfa_enter_code")}
                <input
                  style={{
                    ...ui.input,
                    marginTop: 6,
                    letterSpacing: ".18em",
                    fontVariantNumeric: "tabular-nums",
                    maxWidth: 220,
                  }}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  data-mfa-confirm
                  disabled={busy || !code.trim()}
                  onClick={() => void confirm()}
                  style={ui.button}
                >
                  {tUi(lang, "ui_mfa_confirm")}
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    setEnrolment(null);
                    setCode("");
                  }}
                  style={ui.buttonGhost}
                >
                  {tUi(lang, "ui_cancel")}
                </button>
              </div>
            </div>
          ) : null}

          {/* ---- the codes, shown exactly once ---- */}
          {codes ? (
            <div
              style={{
                display: "grid",
                gap: 10,
                border: `1px solid ${colors.warnBorder}`,
                background: colors.warnBg,
                borderRadius: 10,
                padding: 14,
              }}
              data-mfa-codes
            >
              <strong style={{ fontSize: 14, color: colors.textPrimary }}>
                {tUi(lang, "ui_mfa_recovery_title")}
              </strong>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: colors.textBody }}>
                {tUi(lang, "ui_mfa_recovery_blurb")}
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                  gap: 6,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 14,
                  color: colors.textPrimary,
                }}
              >
                {codes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => void navigator.clipboard?.writeText(codes.join("\n"))}
                  style={ui.buttonGhost}
                >
                  {tUi(lang, "ui_mfa_copy")}
                </button>
                <button onClick={() => setCodes(null)} style={ui.button}>
                  {tUi(lang, "ui_mfa_done")}
                </button>
              </div>
            </div>
          ) : null}

          {/* ---- the password confirmation, for the two dangerous ones ---- */}
          {confirming ? (
            <div style={{ display: "grid", gap: 8, maxWidth: 320 }} data-mfa-confirm-password>
              <label style={ui.label}>
                {tUi(lang, "ui_mfa_password_confirm")}
                <input
                  style={{ ...ui.input, marginTop: 6 }}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  disabled={busy || !password}
                  onClick={() => void withPassword(confirming)}
                  style={ui.button}
                >
                  {tUi(lang, "ui_mfa_confirm")}
                </button>
                <button
                  onClick={() => {
                    setConfirming(null);
                    setPassword("");
                    setError(null);
                  }}
                  style={ui.buttonGhost}
                >
                  {tUi(lang, "ui_cancel")}
                </button>
              </div>
            </div>
          ) : null}

          {/* ---- the controls ---- */}
          {!enrolment && !confirming ? (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {on ? (
                <>
                  <button
                    data-mfa-disable
                    onClick={() => setConfirming("disable")}
                    style={ui.buttonGhost}
                  >
                    {tUi(lang, "ui_mfa_turn_off")}
                  </button>
                  <button onClick={() => setConfirming("regenerate")} style={ui.buttonGhost}>
                    {tUi(lang, "ui_mfa_recovery_new")}
                  </button>
                  <span style={{ fontSize: 12.5, color: colors.textMuted }}>
                    {tUi(lang, "ui_mfa_recovery_left", {
                      n: status?.recoveryCodesLeft ?? 0,
                    })}
                  </span>
                </>
              ) : (
                <button
                  data-mfa-enable
                  disabled={busy}
                  onClick={() => void begin()}
                  style={ui.button}
                >
                  {tUi(lang, "ui_mfa_turn_on")}
                </button>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </ConsoleShell>
  );
}
