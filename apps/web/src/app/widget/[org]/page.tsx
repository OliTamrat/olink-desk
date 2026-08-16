"use client";
// The customer-facing chat widget — the org's front door on its own
// website. Session identity is a random id in localStorage (per org); it
// is the authentication and grants exactly this conversation, nothing
// else. Messages post to the web channel; agent replies arrive on a poll.
// Runs standalone or inside the embed loader's iframe.
import { useCallback, useEffect, useRef, useState } from "react";

import { tUi, useConsoleLanguage, type Language } from "../../../lib/console-ui";
import { colors, font, radius } from "../../../lib/theme";
import {
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
} from "@olink-desk/i18n";

interface WireMessage {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  createdAt: string;
}

function sessionIdFor(org: string): string {
  const key = `desk_web_session_${org}`;
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = `w-${Array.from(crypto.getRandomValues(new Uint8Array(12)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}`;
    window.localStorage.setItem(key, id);
  }
  return id;
}

export default function WidgetPage({ params }: { params: { org: string } }) {
  const org = params.org;
  const [lang, setLang] = useConsoleLanguage();
  const [orgName, setOrgName] = useState<string | null>(null);
  const [messages, setMessages] = useState<WireMessage[]>([]);
  // A deflection offer: articles that may answer what the customer just
  // typed, shown BEFORE a ticket exists. `pending` holds their message so it
  // can still be sent if the articles do not help — losing what somebody
  // typed because we guessed wrong would be unforgivable.
  const [offer, setOffer] = useState<Array<{ id: string; title: string; body: string }>>([]);
  const [pending, setPending] = useState("");
  const [openArticle, setOpenArticle] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sessionRef.current = sessionIdFor(org);
  }, [org]);

  useEffect(() => {
    void (async () => {
      const resp = await fetch(`/api/channels/web/${org}/info`);
      if (resp.ok) {
        const body = (await resp.json()) as {
          name: string;
          defaultLanguage: string;
        };
        setOrgName(body.name);
      }
    })();
  }, [org]);

  const poll = useCallback(async () => {
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    const resp = await fetch(
      `/api/channels/web/${org}/messages?sessionId=${sessionId}`,
    );
    if (resp.ok) {
      const body = (await resp.json()) as { messages?: WireMessage[] };
      if (body.messages) setMessages(body.messages);
    }
  }, [org]);

  useEffect(() => {
    void poll();
    const timer = setInterval(poll, 4_000);
    return () => clearInterval(timer);
  }, [poll]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  /** Deliver for real — used both by the first send and by "still need help". */
  async function deliver(body: string) {
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    setSending(true);
    setError(null);
    try {
      const resp = await fetch(`/api/channels/web/${org}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: body,
          language: lang,
          clientMessageId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        }),
      });
      if (resp.ok) {
        setText("");
        setOffer([]);
        setPending("");
        setOpenArticle(null);
        await poll();
      } else {
        setError(tUi(lang, "w_send_failed"));
      }
    } catch {
      setError(tUi(lang, "w_send_failed"));
    } finally {
      setSending(false);
    }
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;

    // Before opening a ticket, look for an article that already answers this.
    // Only on the FIRST message of a conversation: once a person is involved,
    // interrupting the thread with search results is not help, it is a
    // machine talking over the conversation.
    if (messages.length === 0) {
      try {
        const resp = await fetch(`/api/kb/${org}/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: body, language: lang }),
        });
        if (resp.ok) {
          const data = (await resp.json()) as { articles?: typeof offer };
          if (data.articles && data.articles.length > 0) {
            setOffer(data.articles);
            setPending(body);
            setText("");
            return;
          }
        }
      } catch {
        // Search is an optimisation. If it fails the customer must still be
        // able to reach a person, so this falls straight through to sending.
      }
    }
    await deliver(body);
  }

  /** The customer says an article answered them: the ticket is never opened. */
  async function markHelpful(id: string) {
    try {
      await fetch(`/api/kb/${org}/helpful`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      // The counter is not worth failing the customer's experience over.
    }
    setOffer([]);
    setPending("");
    setOpenArticle(null);
  }

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        background: colors.bg,
        color: colors.textBody,
        fontFamily: font,
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          background: colors.surface,
          borderBottom: `1px solid ${colors.border}`,
          flexShrink: 0,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentStrong})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: colors.onAccent,
            fontWeight: 700,
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          {(orgName ?? org).slice(0, 1).toUpperCase()}
        </span>
        <span
          style={{
            fontWeight: 700,
            fontSize: 15,
            color: colors.textPrimary,
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {orgName ?? org}
        </span>
        <select
          aria-label="Language"
          value={lang}
          onChange={(e) => setLang(e.target.value as Language)}
          style={{
            padding: "5px 8px",
            borderRadius: radius.sm,
            border: `1px solid ${colors.border}`,
            background: colors.surfaceRaised,
            color: colors.textBody,
            fontSize: 12,
            fontFamily: font,
          }}
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_NAMES[l]}
            </option>
          ))}
        </select>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "grid", gap: 10, alignContent: "start" }}>
        <p style={{ margin: "4px 0 8px", color: colors.textMuted, fontSize: 13, textAlign: "center" }}>
          {tUi(lang, "w_intro")}
        </p>
        {messages.map((m) => {
          const mine = m.direction === "INBOUND"; // the customer's own words
          return (
            <div key={m.id} style={{ justifySelf: mine ? "end" : "start", maxWidth: "84%" }}>
              <div
                style={{
                  padding: "9px 13px",
                  borderRadius: 12,
                  borderBottomRightRadius: mine ? 4 : 12,
                  borderTopLeftRadius: mine ? 12 : 4,
                  background: mine ? colors.accentStrong : colors.surfaceRaised,
                  color: mine ? colors.onAccent : colors.textBody,
                  fontSize: 14,
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                }}
              >
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <div
          style={{
            margin: "0 14px 8px",
            padding: "8px 12px",
            borderRadius: radius.sm + 2,
            background: colors.dangerBg,
            border: `1px solid ${colors.danger}44`,
            color: colors.danger,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      {/* The deflection offer. It sits ABOVE the composer and never replaces
          it: "No, I still need help" is always one tap away, and the message
          the customer already typed is held so it can still be sent. A
          customer trapped in a search result is worse served than one who
          waited for a person. */}
      {offer.length > 0 ? (
        <div
          style={{
            padding: "12px 14px",
            borderTop: `1px solid ${colors.border}`,
            background: colors.surface,
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 8 }}>
            {tUi(lang, "w_kb_intro")}
          </div>
          <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
            {offer.map((a) => (
              <div
                key={a.id}
                style={{
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  padding: 10,
                  background: colors.surfaceRaised,
                }}
              >
                <div style={{ fontSize: 14, color: colors.textPrimary, fontWeight: 600 }}>
                  {a.title}
                </div>
                {openArticle === a.id ? (
                  <p
                    style={{
                      margin: "6px 0 0",
                      fontSize: 13.5,
                      lineHeight: 1.55,
                      color: colors.textBody,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {a.body}
                  </p>
                ) : (
                  <button
                    onClick={() => setOpenArticle(a.id)}
                    style={{
                      marginTop: 4,
                      border: "none",
                      background: "transparent",
                      color: colors.accent,
                      fontSize: 13,
                      cursor: "pointer",
                      padding: 0,
                      fontFamily: "inherit",
                    }}
                  >
                    {tUi(lang, "w_kb_read")}
                  </button>
                )}
                {openArticle === a.id ? (
                  <button
                    onClick={() => void markHelpful(a.id)}
                    style={{
                      marginTop: 8,
                      padding: "6px 12px",
                      borderRadius: 6,
                      border: "none",
                      background: colors.accent,
                      color: colors.onAccent,
                      fontSize: 13,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {tUi(lang, "w_kb_helpful")}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <button
            onClick={() => void deliver(pending)}
            style={{
              width: "100%",
              padding: "9px 12px",
              borderRadius: 8,
              border: `1px solid ${colors.borderStrong}`,
              background: "transparent",
              color: colors.textBody,
              fontSize: 13.5,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {tUi(lang, "w_kb_still")}
          </button>
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "10px 14px 8px",
          borderTop: `1px solid ${colors.border}`,
          background: colors.surface,
          flexShrink: 0,
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void send();
          }}
          placeholder={tUi(lang, "w_input_placeholder")}
          // 16px minimum: iOS Safari auto-zooms a smaller focused input,
          // which widens the viewport and breaks the layout (fleet gotcha).
          style={{
            flex: 1,
            minWidth: 0,
            padding: "10px 12px",
            borderRadius: radius.sm + 2,
            border: `1px solid ${colors.borderStrong}`,
            background: colors.surfaceRaised,
            color: colors.textPrimary,
            fontSize: 16,
            fontFamily: font,
          }}
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          style={{
            padding: "10px 16px",
            borderRadius: radius.sm + 2,
            border: "none",
            background: colors.accent,
            color: colors.onAccent,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: font,
            opacity: sending || !text.trim() ? 0.6 : 1,
          }}
        >
          {tUi(lang, "ui_send")}
        </button>
      </div>
      <p
        style={{
          margin: 0,
          padding: "0 14px 8px",
          textAlign: "center",
          fontSize: 11,
          color: colors.textMuted,
          background: colors.surface,
        }}
      >
        {tUi(lang, "w_powered")}
      </p>
    </main>
  );
}
