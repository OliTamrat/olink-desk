"use client";
// The Channels screen — the Bank Assist connect UX: paste a token in a
// field, click Connect, and read the live state of the connection right
// here. The status card asks Telegram itself (via our API), so "the bot is
// silent" is diagnosed on this page, not in a terminal.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  LanguagePicker,
  tUi,
  ui,
  useConsoleLanguage,
} from "../../lib/console-ui";

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

interface Me {
  organization: { slug: string; name: string };
}

export default function ChannelsPage() {
  const router = useRouter();
  const [lang, setLang] = useConsoleLanguage();
  const [me, setMe] = useState<Me | null>(null);
  const [channels, setChannels] = useState<CatalogueEntry[]>([]);
  const [tg, setTg] = useState<TelegramStatus | null>(null);
  const [tgError, setTgError] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
    let cancelled = false;
    (async () => {
      const resp = await fetch("/api/auth/me");
      if (resp.status === 401) {
        router.replace("/login");
        return;
      }
      const body = (await resp.json()) as Me;
      if (cancelled) return;
      setMe(body);
      await refresh(body.organization.slug);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, router]);

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

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const badge = (status: CatalogueEntry["status"]) => (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        padding: "2px 10px",
        borderRadius: 999,
        background: status === "live" ? "#ecfdf3" : "#eff4ff",
        color: status === "live" ? "#067647" : "#3538cd",
      }}
    >
      {status === "live" ? tUi(lang, "ui_live") : tUi(lang, "ui_available")}
    </span>
  );

  return (
    <main style={{ ...ui.page, padding: "24px 16px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
            gap: 12,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 24 }}>
              {tUi(lang, "ui_channels_title")}
            </h1>
            {me ? (
              <p style={{ margin: "4px 0 0", color: "#475467", fontSize: 14 }}>
                {tUi(lang, "ui_channels_subtitle", { org: me.organization.name })}
              </p>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <LanguagePicker lang={lang} onChange={setLang} />
            <button
              onClick={signOut}
              style={{
                ...ui.button,
                background: "#fff",
                color: "#344054",
                border: "1px solid #d0d5dd",
              }}
            >
              {tUi(lang, "ui_sign_out")}
            </button>
          </div>
        </header>

        {loading ? (
          <p style={{ color: "#475467" }}>{tUi(lang, "ui_loading")}</p>
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
                <h2 style={{ margin: 0, fontSize: 18 }}>Telegram</h2>
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
              <p style={{ margin: "8px 0 0", color: "#667085", fontSize: 12 }}>
                {tUi(lang, "ui_tg_replace_hint")}
              </p>
              {connectError ? (
                <div style={{ ...ui.error, marginTop: 10 }}>{connectError}</div>
              ) : null}
            </section>

            {/* --------------------------------------- rest of catalogue */}
            {channels
              .filter((c) => c.key !== "telegram")
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
                    <h2 style={{ margin: 0, fontSize: 18 }}>{c.name}</h2>
                    {badge(c.status)}
                  </div>
                  <p style={{ margin: 0, color: "#475467", fontSize: 14 }}>
                    {c.blurb}
                  </p>
                  {c.needs.length > 0 ? (
                    <>
                      <p
                        style={{
                          margin: "12px 0 4px",
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        {tUi(lang, "ui_needs")}
                      </p>
                      <ul style={{ margin: 0, paddingLeft: 18, color: "#475467", fontSize: 13 }}>
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
    </main>
  );
}
