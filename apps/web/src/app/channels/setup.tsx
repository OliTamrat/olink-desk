"use client";
// The connect form for one channel.
//
// Lifted out of the channels page so the per-channel pages can use it too —
// a component defined inside a page file cannot be shared, and duplicating a
// credential form is how two copies drift into disagreeing about what a
// provider needs.
import { useState } from "react";

import type { Language } from "@olink-desk/i18n";

import { type SetupSpec } from "../../lib/channel-setup";
import { colors, tUi, ui } from "../../lib/console-ui";

/**
 * The connect form for a channel the API can store but nothing could reach.
 *
 * Two halves, and the second is the one that was missing everywhere. Storing
 * credentials only tells the desk how to send. A channel is connected when
 * messages ARRIVE, and messages arrive because somebody pasted our inbound URL
 * and its secret into Postmark, or the aggregator's dashboard. So the URL and
 * the header name are shown as plainly as the fields are, and the secret is
 * shown ONCE, because the API returns it once and never again.
 */
export function ChannelSetup({
  lang,
  slug,
  specs,
  onSaved,
}: {
  lang: Language;
  slug: string;
  specs: SetupSpec[];
  onSaved: () => void;
}) {
  const [vendor, setVendor] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const spec = specs[vendor] ?? specs[0];
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const missing = spec.fields.filter((f) => !f.optional && !values[f.name]?.trim());

  async function save() {
    if (!slug || missing.length > 0) return;
    setSaving(true);
    setError(null);
    setSecret(null);
    try {
      const body: Record<string, string> = {};
      for (const f of spec.fields) {
        const v = values[f.name]?.trim();
        if (v) body[f.name] = v;
      }
      const resp = await fetch(`/api/orgs/${slug}/channels/${spec.kind}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await resp.json().catch(() => null)) as
        | { error?: string; webhookSecret?: string }
        | null;
      if (resp.ok) {
        // The credentials are gone from the form the moment they are stored:
        // leaving an access token sitting in a text box on a shared desk is
        // not a saving of anybody's time.
        setValues({});
        setSaved(true);
        if (data?.webhookSecret) setSecret(data.webhookSecret);
        onSaved();
      } else {
        setError(data?.error ?? `HTTP ${resp.status}`);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 14, display: "grid", gap: 10 }} data-channel-setup={spec.kind}>
      {specs.length > 1 ? (
        <div>
          <label style={ui.label}>{tUi(lang, "ui_setup_provider")}</label>
          <select
            aria-label={tUi(lang, "ui_setup_provider")}
            value={vendor}
            onChange={(e) => {
              setVendor(Number(e.target.value));
              // A field name is shared between providers but a credential is
              // not. Carrying one vendor's key into another's form is how a
              // config gets saved that can never authenticate.
              setValues({});
              setSecret(null);
              setSaved(false);
            }}
            style={{ ...ui.input, maxWidth: 260 }}
          >
            {specs.map((s, i) => (
              <option key={s.kind} value={i}>
                {s.vendor ?? s.kind}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {spec.fields.map((f) => (
        <div key={f.name}>
          <label style={ui.label} htmlFor={`${spec.kind}-${f.name}`}>
            {tUi(lang, f.label)}
            {f.optional ? (
              <span style={{ color: colors.textMuted, fontWeight: 400 }}>
                {" "}
                · {tUi(lang, "ui_setup_optional")}
              </span>
            ) : null}
          </label>
          <input
            id={`${spec.kind}-${f.name}`}
            style={ui.input}
            type={f.secret ? "password" : "text"}
            value={values[f.name] ?? ""}
            placeholder={f.placeholder}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
          />
          {f.hint ? (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: colors.textMuted }}>
              {tUi(lang, f.hint)}
            </p>
          ) : null}
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={save}
          disabled={saving || missing.length > 0}
          style={{ ...ui.button, opacity: saving || missing.length > 0 ? 0.6 : 1 }}
        >
          {saving ? tUi(lang, "ui_setup_saving") : tUi(lang, "ui_setup_save")}
        </button>
        {saved && !secret ? (
          <span style={{ fontSize: 13, color: colors.success }}>
            {tUi(lang, "ui_setup_saved")}
          </span>
        ) : null}
      </div>
      {error ? <div style={ui.error}>{error}</div> : null}

      {/* Shown once, because the API returns it once. A secret re-readable
          from a page is a secret sitting in every browser cache that page
          touched; saving again mints a new one. */}
      {secret ? (
        <div style={{ ...ui.ok, display: "grid", gap: 6 }} data-webhook-secret>
          <strong>{tUi(lang, "ui_setup_secret_once")}</strong>
          <code
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              background: colors.surfaceRaised,
              border: `1px solid ${colors.border}`,
              color: colors.textPrimary,
              fontSize: 12,
              overflowWrap: "anywhere",
            }}
          >
            {secret}
          </code>
        </div>
      ) : null}

      {spec.webhook ? (
        <div
          data-webhook-target
          style={{
            marginTop: 4,
            padding: "10px 12px",
            borderRadius: 8,
            background: colors.surfaceRaised,
            border: `1px solid ${colors.border}`,
            display: "grid",
            gap: 4,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: colors.textBody }}>
            {tUi(lang, "ui_setup_webhook_title")}
          </span>
          <code
            style={{ fontSize: 12, color: colors.textPrimary, overflowWrap: "anywhere" }}
          >
            {origin}
            {spec.webhook.path(slug)}
          </code>
          <span style={{ fontSize: 12, color: colors.textMuted }}>
            {spec.webhook.header
              ? tUi(lang, "ui_setup_webhook_header", { header: spec.webhook.header })
              : tUi(lang, spec.webhook.note ?? "ui_setup_webhook_title")}
          </span>
        </div>
      ) : null}
    </div>
  );
}
