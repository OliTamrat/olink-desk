"use client";
// One channel, one page — the Olink Bank Assist shape.
//
// Connecting WhatsApp and connecting SMS are separate jobs, usually done on
// separate days by whoever holds that provider's account. A page each means
// the address can be sent to that person, the browser's back button works, and
// the screen shows exactly the one set of credentials being pasted rather than
// nine sets somebody has to scroll past.
import Link from "next/link";
import { notFound } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { CHANNEL_KEYS } from "../../../lib/channel-nav";
import { SETUP } from "../../../lib/channel-setup";
import { CardHead, EmptyState, stroke } from "../../../lib/card";
import {
  Badge,
  colors,
  ConsoleShell,
  layout,
  tUi,
  ui,
  useConsoleLanguage,
  useMe,
} from "../../../lib/console-ui";
import { ChannelSetup } from "../setup";

interface CatalogueEntry {
  key: string;
  name: string;
  status: "live" | "available" | "planned";
  blurb: string;
  needs: string[];
}

export default function ChannelPage({ params }: { params: { channel: string } }) {
  const [lang, setLang] = useConsoleLanguage();
  const me = useMe();
  const [entry, setEntry] = useState<CatalogueEntry | null>(null);
  const [loading, setLoading] = useState(true);

  // A key that is not a channel is a 404, not a page with nothing on it. The
  // set is validated here rather than trusted from the URL.
  if (!CHANNEL_KEYS.has(params.channel)) notFound();

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    const resp = await fetch(`/api/orgs/${me.organization.slug}/channels`);
    if (resp.ok) {
      const body = (await resp.json()) as { channels: CatalogueEntry[] };
      setEntry(body.channels.find((c) => c.key === params.channel) ?? null);
    }
    setLoading(false);
  }, [me, params.channel]);

  useEffect(() => {
    void load();
  }, [load]);

  const specs = SETUP[params.channel];

  return (
    <ConsoleShell lang={lang} onLang={setLang} me={me} active="channels">
      <div style={{ ...layout.wide, display: "grid", gap: 16 }}>
        {/* Back to the catalogue. The sub-nav is the fast way between
            channels; this is for anyone who arrived on a link. */}
        <Link
          href="/channels"
          style={{ color: colors.textMuted, textDecoration: "none", fontSize: 13 }}
        >
          ← {tUi(lang, "ui_channels_title")}
        </Link>

        {loading && !entry ? (
          <p style={{ color: colors.textSecondary }}>{tUi(lang, "ui_loading")}</p>
        ) : !entry ? (
          <div style={ui.card}>
            <EmptyState
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
                </svg>
              }
              title={tUi(lang, "ui_channel_missing")}
              hint={tUi(lang, "ui_channel_missing_hint")}
            />
          </div>
        ) : (
          <>
            <header style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <h1 style={ui.h1}>{entry.name}</h1>
                  <Badge tone={entry.status === "live" ? "success" : "muted"}>
                    {tUi(lang, entry.status === "live" ? "ui_live" : "ui_available")}
                  </Badge>
                </div>
                <p style={{ ...ui.sub, maxWidth: 620 }}>{entry.blurb}</p>
              </div>
            </header>

            {specs ? (
              <div style={ui.card}>
                <CardHead
                  icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
                      <path d="M21 2v6h-6" />
                      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                      <path d="M3 22v-6h6" />
                      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                    </svg>
                  }
                  title={tUi(lang, "ui_setup_save")}
                  blurb={tUi(lang, "ui_channel_page_blurb")}
                />
                <ChannelSetup
                  lang={lang}
                  slug={me?.organization.slug ?? ""}
                  specs={specs}
                  onSaved={() => void load()}
                />
              </div>
            ) : null}

            {entry.needs.length > 0 ? (
              <div style={ui.card}>
                <CardHead
                  icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
                      <path d="m9 11 3 3L22 4" />
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                  }
                  title={tUi(lang, "ui_needs")}
                  blurb={tUi(lang, "ui_channel_needs_blurb")}
                />
                <ul
                  style={{
                    margin: 0,
                    paddingInlineStart: 18,
                    color: colors.textSecondary,
                    fontSize: 13.5,
                    lineHeight: 1.65,
                  }}
                >
                  {entry.needs.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    </ConsoleShell>
  );
}
