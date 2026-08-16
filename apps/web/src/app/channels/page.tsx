"use client";
// The Channels screen — the Bank Assist connect UX: paste a token in a
// field, click Connect, and read the live state of the connection right
// here. The status card asks Telegram itself (via our API), so "the bot is
// silent" is diagnosed on this page, not in a terminal.
import { useCallback, useEffect, useState } from "react";

import type { Language } from "@olink-desk/i18n";

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
import { SETUP, type SetupSpec } from "../../lib/channel-setup";

interface CatalogueEntry {
  key: string;
  name: string;
  status: "live" | "available" | "planned";
  blurb: string;
  needs: string[];
}

interface TelegramStatus {
  connected: boolean;
  tokenValid: boolean | null;
  botUsername: string | null;
  expectedWebhookUrl: string;
  registeredWebhookUrl: string | null;
  webhookMatches: boolean | null;
  pendingUpdates: number | null;
  lastErrorMessage: string | null;
  probeError: string | null;
}

export default function ChannelsPage() {
  const [lang, setLang] = useConsoleLanguage();
  const me = useMe();
  const [channels, setChannels] = useState<CatalogueEntry[]>([]);
  const [tg, setTg] = useState<TelegramStatus | null>(null);
  const [tgError, setTgError] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async (slug: string) => {
    const [catResp, statusResp] = await Promise.all([
      fetch(`/api/orgs/${slug}/channels`),
      fetch(`/api/orgs/${slug}/channels/telegram/status`),
    ]);
    if (catResp.ok) {
      const body = (await catResp.json()) as { channels: CatalogueEntry[] };
      setChannels(body.channels);
    }
    if (statusResp.ok) {
      setTg((await statusResp.json()) as TelegramStatus);
      setTgError(null);
    } else {
      const body = (await statusResp.json().catch(() => null)) as
        | { error?: string }
        | null;
      setTgError(body?.error ?? `HTTP ${statusResp.status}`);
    }
  }, []);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    (async () => {
      await refresh(me.organization.slug);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [me, refresh]);

  async function connectTelegram() {
    if (!me || !token.trim()) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const resp = await fetch(
        `/api/orgs/${me.organization.slug}/channels/telegram/connect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ botToken: token.trim() }),
        },
      );
      if (resp.ok) {
        setToken("");
        await refresh(me.organization.slug);
      } else {
        const body = (await resp.json().catch(() => null)) as
          | { error?: string }
          | null;
        setConnectError(
          tUi(lang, "ui_tg_connect_failed", {
            error: body?.error ?? `HTTP ${resp.status}`,
          }),
        );
      }
    } catch (err) {
      setConnectError(tUi(lang, "ui_tg_connect_failed", { error: String(err) }));
    } finally {
      setConnecting(false);
    }
  }

  const badge = (status: CatalogueEntry["status"]) => (
    <Badge tone={status === "live" ? "success" : "info"}>
      {status === "live" ? tUi(lang, "ui_live") : tUi(lang, "ui_available")}
    </Badge>
  );

  return (
    <ConsoleShell lang={lang} onLang={setLang} me={me} active="channels">
      <div style={{ ...layout.centred }}>
        <header style={{ marginBottom: 20 }}>
          <h1 style={ui.h1}>{tUi(lang, "ui_channels_title")}</h1>
          {me ? (
            <p style={ui.sub}>
              {tUi(lang, "ui_channels_subtitle", { org: me.organization.name })}
            </p>
          ) : null}
        </header>

        {loading ? (
          <p style={{ color: colors.textSecondary }}>{tUi(lang, "ui_loading")}</p>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {/* ------------------------------------------------ Telegram */}
            <section style={ui.card}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <h2 style={ui.h2}>Telegram</h2>
                {badge(tg?.connected && tg.tokenValid ? "live" : "available")}
              </div>

              <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
                {tgError ? (
                  <div style={ui.warn}>
                    {tUi(lang, "ui_status_unknown", { error: tgError })}
                  </div>
                ) : !tg || !tg.connected ? (
                  <div style={ui.warn}>{tUi(lang, "ui_not_connected")}</div>
                ) : (
                  <>
                    {tg.tokenValid === true ? (
                      <div style={ui.ok}>
                        {tUi(lang, "ui_tg_connected_as", {
                          bot: tg.botUsername ?? "?",
                        })}
                      </div>
                    ) : tg.tokenValid === false ? (
                      <div style={ui.error}>{tUi(lang, "ui_tg_token_dead")}</div>
                    ) : (
                      <div style={ui.warn}>
                        {tUi(lang, "ui_status_unknown", {
                          error: tg.probeError ?? "?",
                        })}
                      </div>
                    )}
                    {tg.tokenValid === true && tg.webhookMatches === true ? (
                      <div style={ui.ok}>{tUi(lang, "ui_tg_webhook_ok")}</div>
                    ) : null}
                    {tg.tokenValid === true && tg.webhookMatches === false ? (
                      <div style={ui.warn}>{tUi(lang, "ui_tg_webhook_wrong")}</div>
                    ) : null}
                    {tg.lastErrorMessage ? (
                      <div style={ui.warn}>
                        {tUi(lang, "ui_tg_last_error", {
                          error: tg.lastErrorMessage,
                        })}
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              <label style={ui.label}>{tUi(lang, "ui_tg_token_label")}</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ ...ui.input, flex: 1 }}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="1234567890:AA..."
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  onClick={connectTelegram}
                  disabled={connecting || !token.trim()}
                  style={{ ...ui.button, opacity: connecting || !token.trim() ? 0.6 : 1 }}
                >
                  {connecting
                    ? tUi(lang, "ui_tg_connecting")
                    : tUi(lang, "ui_tg_connect")}
                </button>
              </div>
              <p style={{ margin: "8px 0 0", color: colors.textMuted, fontSize: 12 }}>
                {tUi(lang, "ui_tg_replace_hint")}
              </p>
              {connectError ? (
                <div style={{ ...ui.error, marginTop: 10 }}>{connectError}</div>
              ) : null}
            </section>

            {/* ------------------------------------- website widget */}
            {(() => {
              const web = channels.find((c) => c.key === "web");
              if (!web || !me) return null;
              const origin =
                typeof window !== "undefined" ? window.location.origin : "";
              const snippet = `<script src="${origin}/api/channels/web/${me.organization.slug}/embed" async></script>`;
              return (
                <section style={ui.card}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <h2 style={ui.h2}>{web.name}</h2>
                    {badge("live")}
                  </div>
                  <p style={{ margin: "0 0 14px", color: colors.textSecondary, fontSize: 14 }}>
                    {web.blurb}
                  </p>
                  <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600, color: colors.textBody }}>
                    {tUi(lang, "ui_embed_title")}
                  </p>
                  <pre
                    style={{
                      margin: 0,
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: colors.surfaceRaised,
                      border: `1px solid ${colors.border}`,
                      color: colors.textBody,
                      fontSize: 12,
                      overflowX: "auto",
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {snippet}
                  </pre>
                  <p style={{ margin: "6px 0 12px", color: colors.textMuted, fontSize: 12 }}>
                    {tUi(lang, "ui_embed_hint")}
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => {
                        void navigator.clipboard.writeText(snippet).then(() => {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        });
                      }}
                      style={ui.button}
                    >
                      {copied ? tUi(lang, "ui_copied") : tUi(lang, "ui_copy")}
                    </button>
                    <a
                      href={`/widget/${me.organization.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ ...ui.buttonGhost, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                    >
                      {tUi(lang, "ui_open_widget")}
                    </a>
                  </div>
                </section>
              );
            })()}

            {/* --------------------------------------- rest of catalogue */}
            {channels
              .filter((c) => c.key !== "telegram" && c.key !== "web")
              .map((c) => (
                <section key={c.key} style={ui.card}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <h2 style={ui.h2}>{c.name}</h2>
                    {badge(c.status)}
                  </div>
                  <p style={{ margin: 0, color: colors.textSecondary, fontSize: 14 }}>
                    {c.blurb}
                  </p>
                  {SETUP[c.key] ? (
                    <ChannelSetup
                      lang={lang}
                      slug={me?.organization.slug ?? ""}
                      specs={SETUP[c.key]}
                      onSaved={() => me && void refresh(me.organization.slug)}
                    />
                  ) : null}
                  {c.needs.length > 0 ? (
                    <>
                      <p
                        style={{
                          margin: "12px 0 4px",
                          fontSize: 13,
                          fontWeight: 600,
                          color: colors.textBody,
                        }}
                      >
                        {tUi(lang, "ui_needs")}
                      </p>
                      <ul style={{ margin: 0, paddingLeft: 18, color: colors.textSecondary, fontSize: 13 }}>
                        {c.needs.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </section>
              ))}
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}

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
function ChannelSetup({
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
