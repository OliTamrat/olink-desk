"use client";
// The Channels screen — the Bank Assist connect UX: paste a token in a
// field, click Connect, and read the live state of the connection right
// here. The status card asks Telegram itself (via our API), so "the bot is
// silent" is diagnosed on this page, not in a terminal.
import Link from "next/link";
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
import { SETUP } from "../../lib/channel-setup";
import { ChannelSetup } from "./setup";
import { IconTile, stroke } from "../../lib/card";
import { channelHref } from "../../lib/channel-nav";

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
  // Which channel's form is open. One at a time — an accordion, so the page
  // cannot grow back into the wall of forms this replaced.
  const [expanded, setExpanded] = useState<string | null>(null);
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
            {/* Each channel is a LINK to its own page now, not an accordion
                that expands in place. Same reason the sub-nav exists:
                connecting one is a job of its own, and a job with an address
                can be handed to the person who holds that provider's account.

                The accordion this replaces was itself replacing ten forms
                open at once — the card is the same card, it just navigates
                instead of unfolding. */}
            {channels
              .filter((c) => c.key !== "telegram" && c.key !== "web")
              .map((c) => (
                <Link
                  key={c.key}
                  href={channelHref(c.key)}
                  data-channel-link={c.key}
                  style={{
                    ...ui.card,
                    padding: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    textDecoration: "none",
                  }}
                >
                  <IconTile size={34} tint={c.status === "live" ? colors.success : colors.textMuted}>
                    <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
                    </svg>
                  </IconTile>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>
                      {c.name}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 12.5,
                        color: colors.textMuted,
                        marginTop: 2,
                        lineHeight: 1.45,
                      }}
                    >
                      {c.blurb}
                    </span>
                  </span>
                  {badge(c.status)}
                  <span aria-hidden style={{ color: colors.textMuted, flexShrink: 0, width: 14 }}>
                    ›
                  </span>
                </Link>
              ))}
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}
