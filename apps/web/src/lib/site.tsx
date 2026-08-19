"use client";
// The public product page: what Olink Desk is, shown rather than described.
//
// It replaced a placeholder — an h1, one sentence and a Sign in button on an
// empty background — which is what a prospect met before they ever reached
// the console. The reference the founder gave was Zendesk's platform page and
// Sunshine Conversations' split sign-in: a page that DEMONSTRATES the service
// instead of listing adjectives about it.
//
// So the centrepiece is not a screenshot. `LiveDesk` runs the product's whole
// loop in front of the reader: a customer message arrives on a real channel,
// a ticket opens, the language and urgency are read, a reply is drafted from
// the organization's own answers, and the first reply lands inside the SLA —
// then the channel and the language change and it happens again. Every claim
// the page makes below the fold has already been shown above it.
//
// The same argument as the sign-in gate's mock (ADR 0029 in Bank Assist), one
// level up: a still has to pick ONE language to illustrate a product whose
// point is six, and whichever it picks is wrong for five sixths of the room.
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import {
  colors,
  displayFont,
  radius,
  stage as stageColours,
} from "./theme";
import { LanguagePicker, tUi, useConsoleLanguage } from "./console-ui";
import { SUPPORTED_LANGUAGES, type Language } from "@olink-desk/i18n";

/* ------------------------------------------------------------- glyphs */

// Stroke-based, currentColor, inline. No emoji anywhere in this product, and
// no icon font or CDN on the one page a stranger loads cold.
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function Glyph({ d, size = 20 }: { d: readonly string[]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden>
      {d.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

const GLYPH = {
  grounded: ["M4 4.5h11a3 3 0 0 1 3 3V20", "M4 4.5V17h11a3 3 0 0 1 3 3", "M7.5 8.5h6", "M7.5 12h4"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3.2 1.9"],
  languages: ["M3 6h10", "M7.6 4v2c0 3.6-1.9 6.6-4.6 8.4", "M6 10.6c1.4 2.4 3.6 4.2 6 5", "M12.5 20l4.2-9.6L21 20", "M14.4 16.4h4.6"],
  shield: ["M12 3.2 5 6v5.4c0 4.2 2.9 7.7 7 9.4 4.1-1.7 7-5.2 7-9.4V6l-7-2.8z", "M12 8.6v6.4"],
  macro: ["M4.5 6.5h15", "M4.5 12h9", "M4.5 17.5h6", "M16.6 14.6l4.4 2.6-4.4 2.6z"],
  chart: ["M4 20V4", "M4 20h16", "M8.5 20v-6", "M13 20V9", "M17.5 20v-9.5"],
  check: ["M4 12.4l4.6 4.6L20 6"],
  arrow: ["M5 12h13", "M12.5 6l6 6-6 6"],
  bolt: ["M13.2 3 5 13.6h5.6L10.2 21 19 10.2h-5.6z"],
  lock: ["M6 10.5h12v9H6z", "M8.8 10.5V7.8a3.2 3.2 0 0 1 6.4 0v2.7"],
  ledger: ["M5 3.5h11.5L19 6v14.5H5z", "M8.4 8h7.2", "M8.4 12h7.2", "M8.4 16h4.4"],
  eraser: ["M8.6 20.5 3.9 15.8a1.6 1.6 0 0 1 0-2.3l8.3-8.3a1.6 1.6 0 0 1 2.3 0l5 5a1.6 1.6 0 0 1 0 2.3l-8 8z", "M20.5 20.5h-12"],
} as const;

/* ------------------------------------------------ the demonstration */

/**
 * The channels the demo cycles, in the order a desk actually connects them.
 *
 * Five rather than all nine: the point is made by the SECOND one, and a
 * customer's phone that changes chrome nine times reads as a slideshow of
 * logos. The full nine are named in the channel strip below, which is where
 * completeness belongs.
 */
const DEMO_CHANNELS = ["telegram", "whatsapp", "sms", "ussd", "web"] as const;

const CHANNEL_KEY: Record<(typeof DEMO_CHANNELS)[number], string> = {
  telegram: "ui_ch_telegram",
  whatsapp: "ui_ch_whatsapp",
  sms: "ui_ch_sms_channel",
  ussd: "ui_ch_ussd",
  web: "ui_ch_web",
};

// Timing, measured from the START of a cycle rather than chained from the
// previous callback. Chaining adds each offset a second time — the sign-in
// mock took twelve seconds per language instead of six that way, and never
// visibly turned over, which was the entire point of it.
const T_Q_END = 1300; // the customer has finished typing
const T_ARRIVE = 1450; // it became a ticket
const T_READ = 2250; // language and urgency decided
const T_DRAFT_START = 2950;
const T_DRAFT_END = 4650;
const T_SOURCES = 4800;
const T_SENT = 5600;
const T_CYCLE = 8800;
const T_CYCLE_STILL = 6200; // reduced motion: no typing, so only the reading

type Beat = 0 | 1 | 2 | 3 | 4;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Runs only while it can be seen.
 *
 * A marketing page is the page most likely to sit open in a background tab,
 * and the demo is a timer that would otherwise keep firing there. The
 * IntersectionObserver half matters more here than on the gate: this page is
 * long, and the demo is off screen for most of it.
 */
function useVisible<T extends Element>(): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let onScreen = false;
    const sync = () => setSeen(onScreen && !document.hidden);
    const io = new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((e) => e.isIntersecting);
        sync();
      },
      { rootMargin: "80px" },
    );
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  return [ref, seen];
}

/**
 * One customer question, all the way through the desk — then again, on the
 * next channel, in the next language.
 *
 * The question and the answer are the SAME pair the sign-in mock uses. That
 * is deliberate rather than lazy: the two screens a prospect sees are the
 * product answering one ordinary question, and using different examples on
 * each would read as two features rather than one loop.
 */
function LiveDesk({ panel }: { panel: Language }) {
  const [box, visible] = useVisible<HTMLDivElement>();
  const [cycle, setCycle] = useState(0);
  const [beat, setBeat] = useState<Beat>(0);
  const [typedQ, setTypedQ] = useState("");
  const [typedA, setTypedA] = useState("");
  const [sources, setSources] = useState(false);
  const run = useRef(0);

  // The panel's own language goes first, so the first pass anyone reads is
  // one they can read; the five after it are what make the argument.
  const start = Math.max(0, SUPPORTED_LANGUAGES.indexOf(panel));
  const lang = SUPPORTED_LANGUAGES[(start + cycle) % SUPPORTED_LANGUAGES.length];
  const channel = DEMO_CHANNELS[cycle % DEMO_CHANNELS.length];
  const q = tUi(lang, "ui_mock_question");
  const a = tUi(lang, "ui_mock_answer");

  useEffect(() => {
    if (!visible) return;
    const mine = ++run.current;
    const reduced = prefersReducedMotion();
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => {
      timers.push(setTimeout(() => run.current === mine && fn(), ms));
    };

    if (reduced) {
      setTypedQ(q);
      setTypedA(a);
      setSources(true);
      setBeat(4);
      at(T_CYCLE_STILL, () => setCycle((c) => c + 1));
      return () => timers.forEach(clearTimeout);
    }

    setTypedQ("");
    setTypedA("");
    setSources(false);
    setBeat(0);

    const type = (text: string, from: number, ms: number, set: (s: string) => void) => {
      const steps = Math.max(1, Math.min(text.length, 30));
      for (let s = 1; s <= steps; s += 1) {
        at(from + (ms / steps) * s, () =>
          set(text.slice(0, Math.ceil((text.length / steps) * s))),
        );
      }
    };

    type(q, 0, T_Q_END, setTypedQ);
    at(T_ARRIVE, () => setBeat(1));
    at(T_READ, () => setBeat(2));
    at(T_DRAFT_START, () => setBeat(3));
    type(a, T_DRAFT_START, T_DRAFT_END - T_DRAFT_START, setTypedA);
    at(T_SOURCES, () => setSources(true));
    at(T_SENT, () => setBeat(4));
    at(T_CYCLE, () => setCycle((c) => c + 1));

    return () => timers.forEach(clearTimeout);
  }, [cycle, visible, q, a]);

  const steps: Array<{ key: string; on: boolean }> = [
    { key: "ui_site_demo_arrive", on: beat >= 1 },
    { key: "ui_site_demo_read", on: beat >= 2 },
    { key: "ui_site_demo_draft", on: beat >= 3 },
    { key: "ui_site_demo_sent", on: beat >= 4 },
  ];

  return (
    <div className="demo" ref={box}>
      {/* The customer's side. The chrome changes with the channel, because
          "wherever they already are" is a claim about THEIR app, not ours. */}
      <div className="demo-pane demo-phone" lang={lang}>
        <div className="demo-head">
          <span className="demo-dot" aria-hidden />
          <span className="demo-head-name">{tUi(lang, CHANNEL_KEY[channel])}</span>
          <span className="demo-head-role">{tUi(lang, "ui_customer")}</span>
        </div>
        <div className="demo-bubble">{typedQ}</div>
        {beat >= 4 ? <div className="demo-bubble demo-bubble-in">{a}</div> : null}
      </div>

      {/* The message travelling from the customer's app into the desk. It is
          the one thing on this page that is pure decoration, and it earns its
          place: the two cards otherwise read as two unrelated screenshots
          stacked up, and the whole claim is that they are the same message. */}
      <div className={beat >= 1 ? "demo-link on" : "demo-link"} aria-hidden>
        <span className="demo-link-dot" />
      </div>

      {/* The desk's side: the same message as work, with an owner and a clock. */}
      <div className="demo-pane demo-desk" lang={lang}>
        <div className="demo-head">
          <span className="demo-head-name">{tUi(lang, "ui_site_demo_desk")}</span>
          <span className={beat >= 4 ? "demo-pill demo-pill-done" : "demo-pill"}>
            {tUi(lang, beat >= 4 ? "ui_st_resolved" : "ui_st_new")}
          </span>
        </div>

        <ol className="demo-steps">
          {steps.map((s) => (
            <li key={s.key} className={s.on ? "on" : undefined}>
              <span className="demo-tick" aria-hidden>
                <Glyph d={GLYPH.check} size={12} />
              </span>
              <span>{tUi(lang, s.key)}</span>
            </li>
          ))}
        </ol>

        <div className="demo-draft" aria-live="off">
          <span className="demo-draft-label">{tUi(lang, "ui_site_demo_draft_label")}</span>
          <p>{typedA}</p>
          <span className="demo-src" style={{ opacity: sources ? 1 : 0 }}>
            {tUi(lang, "ui_mock_sources", { n: 2 })}
          </span>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- the sections */

function Section({
  id,
  kicker,
  line,
  sub,
  children,
  tone = "page",
}: {
  id?: string;
  kicker: string;
  line: string;
  sub?: string;
  children?: ReactNode;
  tone?: "page" | "raised";
}) {
  return (
    <section id={id} className={tone === "raised" ? "sec sec-raised" : "sec"}>
      <div className="wrap">
        <p className="kicker">{kicker}</p>
        <h2 className="display sec-line">{line}</h2>
        {sub ? <p className="sec-sub">{sub}</p> : null}
        {children}
      </div>
    </section>
  );
}

/** The nine channels, as the catalogue orders them: self-serve first. */
const ALL_CHANNELS = [
  "ui_ch_telegram",
  "ui_ch_web",
  "ui_ch_whatsapp",
  "ui_ch_messenger",
  "ui_ch_instagram",
  "ui_ch_viber",
  "ui_ch_sms_channel",
  "ui_ch_email",
  "ui_ch_ussd",
] as const;

const CAPABILITIES = [
  { icon: GLYPH.grounded, t: "ui_site_cap_grounded_t", b: "ui_site_cap_grounded_b" },
  { icon: GLYPH.clock, t: "ui_site_cap_sla_t", b: "ui_site_cap_sla_b" },
  { icon: GLYPH.languages, t: "ui_site_cap_lang_t", b: "ui_site_cap_lang_b" },
  { icon: GLYPH.shield, t: "ui_site_cap_tenancy_t", b: "ui_site_cap_tenancy_b" },
  { icon: GLYPH.macro, t: "ui_site_cap_macros_t", b: "ui_site_cap_macros_b" },
  { icon: GLYPH.chart, t: "ui_site_cap_reports_t", b: "ui_site_cap_reports_b" },
] as const;

const TRUST = [
  { icon: GLYPH.lock, k: "ui_site_trust_1" },
  { icon: GLYPH.ledger, k: "ui_site_trust_2" },
  { icon: GLYPH.eraser, k: "ui_site_trust_3" },
  { icon: GLYPH.bolt, k: "ui_site_trust_4" },
] as const;

/**
 * The console, drawn rather than photographed.
 *
 * A screenshot would be a PNG that goes stale the first time the rail moves,
 * would carry whatever tenant's data happened to be on screen, and would be
 * one theme on a product whose theming is part of the pitch. Built from the
 * same tokens as the real console, it is instead always current and follows
 * the reader's own theme — which is the claim the section is making.
 */
function ConsoleShot({ lang }: { lang: Language }) {
  const rows = [
    { k: "ui_st_new", pr: "ui_pr_urgent", ch: "ui_ch_telegram", hot: true },
    { k: "ui_st_open", pr: "ui_pr_high", ch: "ui_ch_whatsapp", hot: false },
    { k: "ui_st_pending", pr: "ui_pr_normal", ch: "ui_ch_web", hot: false },
    { k: "ui_st_open", pr: "ui_pr_normal", ch: "ui_ch_sms_channel", hot: false },
    { k: "ui_st_resolved", pr: "ui_pr_low", ch: "ui_ch_ussd", hot: false },
  ] as const;
  return (
    <div className="shot" aria-hidden>
      <div className="shot-rail">
        {[GLYPH.chart, GLYPH.grounded, GLYPH.macro, GLYPH.languages, GLYPH.shield].map(
          (d, i) => (
            <span key={i} className={i === 1 ? "shot-rail-item on" : "shot-rail-item"}>
              <Glyph d={d} size={16} />
            </span>
          ),
        )}
      </div>
      <div className="shot-list">
        {rows.map((r, i) => (
          <div key={i} className={r.hot ? "shot-row hot" : "shot-row"}>
            <span className="shot-bar" />
            <span className="shot-cell">{tUi(lang, r.ch)}</span>
            <span className="shot-chip">{tUi(lang, r.k)}</span>
            <span className="shot-chip shot-chip-quiet">{tUi(lang, r.pr)}</span>
            <span className="shot-clock">
              {tUi(lang, r.hot ? "ui_sla_first_due" : "ui_sla_met", { t: "18m" })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- the page */

export function SitePage() {
  const [lang, setLang] = useConsoleLanguage();
  return (
    <main className="site" lang={lang}>
      <style dangerouslySetInnerHTML={{ __html: siteCss }} />

      <header className="nav">
        <div className="wrap nav-in">
          <span className="brand">{tUi(lang, "ui_gate_eyebrow")}</span>
          <nav className="nav-right">
            <LanguagePicker lang={lang} onChange={setLang} />
            <Link href="/login" className="btn btn-ghost">
              {tUi(lang, "ui_sign_in")}
            </Link>
            <Link href="/register" className="btn btn-solid">
              {tUi(lang, "ui_register")}
            </Link>
          </nav>
        </div>
      </header>

      {/* ── The hero. Dark in BOTH themes, like the sign-in pitch pane: it is
          a stage, not a page surface, and wiring it to --bg would turn the
          one screen whose job is to look like something white. ── */}
      <section className="hero">
        <div className="aurora" aria-hidden>
          <i />
          <i />
          <i />
        </div>
        <div className="wrap hero-in">
          <div className="hero-copy">
            <p className="eyebrow">{tUi(lang, "ui_site_hero_eyebrow")}</p>
            <h1 className="display hero-line">{tUi(lang, "ui_site_hero_line")}</h1>
            <p className="hero-sub">{tUi(lang, "ui_site_hero_sub")}</p>
            <div className="hero-cta">
              <Link href="/register" className="btn btn-solid btn-lg">
                {tUi(lang, "ui_register")}
              </Link>
              <a href="#how" className="btn btn-outline btn-lg">
                {tUi(lang, "ui_site_hero_see")}
                <Glyph d={GLYPH.arrow} size={16} />
              </a>
            </div>
            <p className="hero-note">{tUi(lang, "ui_site_hero_note")}</p>
          </div>
          <LiveDesk panel={lang} />
        </div>
      </section>

      {/* ── Channels ── */}
      <Section
        kicker={tUi(lang, "ui_channels_title")}
        line={tUi(lang, "ui_site_ch_line")}
        sub={tUi(lang, "ui_site_ch_sub")}
      >
        <ul className="chips">
          {ALL_CHANNELS.map((k) => (
            <li key={k}>{tUi(lang, k)}</li>
          ))}
        </ul>
      </Section>

      {/* ── The loop ── */}
      <Section
        id="how"
        tone="raised"
        kicker={tUi(lang, "ui_site_loop_kicker")}
        line={tUi(lang, "ui_site_loop_line")}
      >
        <ol className="loop">
          {(
            [
              ["ui_site_loop_1_t", "ui_site_loop_1_b"],
              ["ui_site_loop_2_t", "ui_site_loop_2_b"],
              ["ui_site_loop_3_t", "ui_site_loop_3_b"],
            ] as const
          ).map(([t, b], i) => (
            <li key={t}>
              <span className="loop-n">{i + 1}</span>
              <h3>{tUi(lang, t)}</h3>
              <p>{tUi(lang, b)}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* ── Capabilities ── */}
      <Section
        kicker={tUi(lang, "ui_site_cap_kicker")}
        line={tUi(lang, "ui_site_cap_line")}
      >
        <div className="cards">
          {CAPABILITIES.map((c) => (
            <article key={c.t} className="card">
              <span className="card-ico">
                <Glyph d={c.icon} />
              </span>
              <h3>{tUi(lang, c.t)}</h3>
              <p>{tUi(lang, c.b)}</p>
            </article>
          ))}
        </div>
      </Section>

      {/* ── The console ── */}
      <Section
        tone="raised"
        kicker={tUi(lang, "ui_site_console_kicker")}
        line={tUi(lang, "ui_site_console_line")}
        sub={tUi(lang, "ui_site_console_sub")}
      >
        <ConsoleShot lang={lang} />
      </Section>

      {/* ── Trust ── */}
      <Section
        kicker={tUi(lang, "ui_site_trust_kicker")}
        line={tUi(lang, "ui_site_trust_line")}
      >
        <ul className="trust">
          {TRUST.map((row) => (
            <li key={row.k}>
              <span className="trust-ico">
                <Glyph d={row.icon} size={18} />
              </span>
              <span>{tUi(lang, row.k)}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── Close ── */}
      <section className="close">
        <div className="wrap close-in">
          <h2 className="display close-line">{tUi(lang, "ui_site_cta_line")}</h2>
          <p className="close-sub">{tUi(lang, "ui_site_cta_sub")}</p>
          <div className="hero-cta">
            <Link href="/register" className="btn btn-solid btn-lg">
              {tUi(lang, "ui_register")}
            </Link>
            <Link href="/login" className="btn btn-outline btn-lg">
              {tUi(lang, "ui_sign_in")}
            </Link>
          </div>
        </div>
      </section>

      <footer className="foot">
        <div className="wrap foot-in">
          <span className="brand">{tUi(lang, "ui_gate_eyebrow")}</span>
          <span>{tUi(lang, "ui_site_footer")}</span>
        </div>
      </footer>
    </main>
  );
}

/**
 * The page's stylesheet.
 *
 * A string rather than style objects because almost everything on this page
 * needs something inline styles cannot express: media queries for a layout
 * that goes from one column to three, keyframes for the aurora, and the
 * pseudo-element layers that carry the grain and the vignette on the hero.
 *
 * Colour is interpolated from the token file, never typed. The hero and the
 * closing band use the `stage` tokens — dark in both themes on purpose, the
 * same decision as the sign-in pitch pane — and everything between them uses
 * `colors`, so the middle of the page follows the reader's own theme.
 */
const siteCss = `
/* border-box scoped to this page. The repo deliberately omits a global one:
   it would silently change the geometry of every fixed-width pane in the
   console. Nothing outside .site is touched. */
.site, .site *, .site *::before, .site *::after { box-sizing: border-box; }

.site { position: relative; background: ${colors.bg}; color: ${colors.textBody}; overflow-x: hidden; }
.wrap { max-width: 1180px; margin: 0 auto; padding: 0 24px; width: 100%; }
.brand {
  font-family: ${displayFont}; font-weight: 600; font-size: 17px;
  letter-spacing: -.01em; color: ${stageColours.ink};
  /* Two words, and on a 390px phone the row is tight enough that it wrapped
     to two lines under the language picker. A product name that breaks in
     half is the first thing a stranger sees. */
  white-space: nowrap;
}

/* ---------------------------------------------------------------- nav */
/* Over the hero rather than above it, so the dark field starts at the very
   top of the window. It does NOT stick: a bar pinned over a page that flips
   from a dark stage to a light surface needs a background of its own, and any
   background it could take is wrong on one half of the page. */
.nav { position: absolute; top: 0; left: 0; right: 0; z-index: 3; padding: 18px 0; }
.nav-in { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.nav-right { display: flex; align-items: center; gap: 10px; }

.btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 16px; border-radius: ${radius.md}px;
  font-size: 14px; font-weight: 600; text-decoration: none;
  border: 1px solid transparent; cursor: pointer; white-space: nowrap;
  transition: background .15s, border-color .15s, transform .15s;
}
.btn-lg { padding: 13px 22px; font-size: 15px; }
.btn-solid { background: ${colors.accentSolid}; color: ${colors.onAccent}; }
.btn-solid:hover { transform: translateY(-1px); }
.btn-ghost { color: rgba(255,255,255,.86); }
.btn-ghost:hover { background: rgba(255,255,255,.10); }
.btn-outline {
  color: ${stageColours.ink}; border-color: rgba(255,255,255,.28);
  background: rgba(255,255,255,.05);
}
.btn-outline:hover { background: rgba(255,255,255,.12); transform: translateY(-1px); }

/* --------------------------------------------------------------- hero */
.hero {
  position: relative; overflow: hidden;
  background: ${stageColours.field};
  padding: 116px 0 84px;
}
.hero-in { position: relative; z-index: 2; display: grid; gap: 44px; }
.hero-copy { display: grid; gap: 20px; align-content: center; }
.eyebrow {
  margin: 0; font-size: 11px; font-weight: 700; letter-spacing: .16em;
  text-transform: uppercase; color: rgba(255,255,255,.62);
}
.hero-line {
  margin: 0; font-family: ${displayFont}; font-weight: 500;
  font-size: clamp(34px, 5vw, 62px); letter-spacing: -.03em; line-height: 1.06;
  color: ${stageColours.ink}; text-shadow: 0 2px 34px rgba(0,0,0,.45);
}
.hero-sub {
  margin: 0; font-size: 16.5px; line-height: 1.68;
  color: rgba(255,255,255,.8); max-width: 54ch;
}
.hero-cta { display: flex; flex-wrap: wrap; gap: 12px; }
.hero-note { margin: 0; font-size: 13px; color: rgba(255,255,255,.55); }

/* Aurora — three blurred blooms rather than one gradient. A single ramp reads
   as a backdrop; overlapping blooms read as light. One cool quadrant only, so
   the field reads as depth rather than as three colours. */
.aurora { position: absolute; inset: -25%; pointer-events: none; z-index: 0; }
.aurora i {
  position: absolute; display: block; border-radius: 50%;
  filter: blur(110px); opacity: .46;
  animation: siteDrift 30s ease-in-out infinite alternate;
}
.aurora i:nth-child(1) { width: 46%; height: 56%; top: -4%; right: 2%; background: ${stageColours.bloomA}; }
.aurora i:nth-child(2) { width: 40%; height: 46%; top: 30%; right: 26%; background: ${stageColours.bloomB}; animation-delay: -11s; animation-duration: 36s; }
.aurora i:nth-child(3) { width: 46%; height: 50%; bottom: -8%; left: 4%; background: ${stageColours.bloomC}; opacity: .3; animation-delay: -19s; animation-duration: 42s; }
@keyframes siteDrift {
  from { transform: translate3d(0,0,0) scale(1); }
  to   { transform: translate3d(-5%, 4%, 0) scale(1.16); }
}
/* Grain, and not only as texture: a large dark area with a soft gradient
   across it BANDS visibly in 8-bit colour, and noise dithers that away.
   Inline SVG turbulence — no request, no library. */
.hero::before, .close::before {
  content: ""; position: absolute; inset: 0; z-index: 1; pointer-events: none;
  opacity: .05; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E");
}
@media (prefers-reduced-motion: reduce) { .aurora i { animation: none; } }

/* --------------------------------------------------------------- demo */
.demo { display: grid; gap: 12px; align-content: center; }
.demo-pane {
  background: linear-gradient(168deg, ${stageColours.lift} 0%, ${stageColours.field} 64%);
  border: 1px solid ${stageColours.hairline};
  border-radius: 18px; padding: 15px;
  box-shadow: 0 1px 0 ${stageColours.sheen} inset, 0 26px 60px -30px rgba(0,0,0,.75);
}
/* The customer's phone sits narrower and to the right, the desk full width
   beneath it — two objects in one composition rather than two stacked boxes. */
.demo-phone { width: min(100%, 350px); margin-left: auto; display: grid; gap: 9px; }
.demo-desk { display: grid; gap: 13px; min-height: 268px; align-content: start; }
/* The connector. The rail is always drawn so the composition does not jump;
   only the travelling dot waits for the ticket to open. */
.demo-link { position: relative; height: 26px; margin-right: 120px; }
.demo-link::before {
  content: ""; position: absolute; left: 50%; top: 0; bottom: 0; width: 1px;
  background: linear-gradient(${stageColours.hairline}, rgba(34,211,238,.35));
}
.demo-link-dot {
  position: absolute; left: 50%; top: 0; width: 6px; height: 6px;
  margin-left: -3px; border-radius: 50%; opacity: 0;
  background: ${stageColours.bloomB}; box-shadow: 0 0 10px 2px rgba(34,211,238,.55);
}
.demo-link.on .demo-link-dot { animation: siteTravel 1.5s ease-in-out 2; }
@keyframes siteTravel {
  0%   { opacity: 0; transform: translateY(-6px); }
  25%  { opacity: 1; }
  85%  { opacity: 1; transform: translateY(24px); }
  100% { opacity: 0; transform: translateY(26px); }
}
@media (prefers-reduced-motion: reduce) { .demo-link-dot { display: none; } }

.demo-head { display: flex; align-items: center; gap: 9px; }
.demo-head-name { font-size: 12.5px; font-weight: 600; color: ${stageColours.ink}; }
.demo-head-role { font-size: 11px; color: rgba(255,255,255,.5); margin-left: auto; }
.demo-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: ${stageColours.bloomB}; box-shadow: 0 0 0 3px rgba(34,211,238,.16);
}
.demo-bubble {
  align-self: end; justify-self: end; max-width: 92%;
  background: rgba(255,255,255,.13); color: ${stageColours.ink};
  border-radius: 13px 13px 4px 13px; padding: 9px 12px;
  font-size: 13.5px; line-height: 1.5; min-height: 38px;
}
.demo-bubble-in {
  justify-self: start; background: rgba(255,255,255,.07);
  color: rgba(255,255,255,.9); border-radius: 13px 13px 13px 4px;
}
.demo-pill {
  margin-left: auto; font-size: 10.5px; font-weight: 700; letter-spacing: .06em;
  text-transform: uppercase; padding: 3px 9px; border-radius: 999px;
  background: rgba(91,157,255,.18); color: ${stageColours.bloomA};
  border: 1px solid rgba(91,157,255,.3);
}
.demo-pill-done {
  background: rgba(52,211,153,.16); color: ${colors.success};
  border-color: rgba(52,211,153,.32);
}
.demo-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 9px; }
.demo-steps li {
  display: grid; grid-template-columns: 18px 1fr; gap: 10px; align-items: center;
  font-size: 12.5px; line-height: 1.45; color: rgba(255,255,255,.34);
  transition: color .35s;
}
.demo-steps li.on { color: rgba(255,255,255,.84); }
.demo-tick {
  width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center;
  border: 1px solid rgba(255,255,255,.16); color: transparent;
  transition: background .35s, border-color .35s, color .35s;
}
.demo-steps li.on .demo-tick {
  background: rgba(34,211,238,.18); border-color: rgba(34,211,238,.45);
  color: ${stageColours.bloomB};
}
.demo-draft {
  border: 1px solid rgba(255,255,255,.1); border-radius: 12px;
  background: rgba(255,255,255,.04); padding: 11px 12px; display: grid; gap: 7px;
}
.demo-draft-label {
  font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
  color: rgba(255,255,255,.44);
}
/* Reserved height. A box that grows and shrinks as each language's answer
   types in is the most distracting thing that could happen on this page. */
.demo-draft p {
  margin: 0; font-size: 13px; line-height: 1.55; color: rgba(255,255,255,.9);
  min-height: 3.1em;
}
.demo-src {
  justify-self: start; font-size: 10.5px; letter-spacing: .04em;
  color: rgba(255,255,255,.62); border: 1px solid rgba(255,255,255,.16);
  border-radius: 999px; padding: 3px 9px; transition: opacity .3s;
}

/* ----------------------------------------------------------- sections */
.sec { padding: 80px 0; }
.sec-raised { background: ${colors.surface}; border-block: 1px solid ${colors.border}; }
.kicker {
  margin: 0 0 12px; font-size: 11px; font-weight: 700; letter-spacing: .16em;
  text-transform: uppercase; color: ${colors.accent};
}
.sec-line {
  margin: 0; font-family: ${displayFont}; font-weight: 500;
  font-size: clamp(26px, 3.6vw, 42px); letter-spacing: -.025em; line-height: 1.12;
  color: ${colors.textPrimary};
}
.sec-sub {
  margin: 16px 0 0; font-size: 16px; line-height: 1.7;
  color: ${colors.textSecondary}; max-width: 62ch;
}

.chips { list-style: none; margin: 34px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 9px; }
.chips li {
  border: 1px solid ${colors.border}; border-radius: 999px;
  padding: 8px 15px; font-size: 13.5px; color: ${colors.textBody};
  background: ${colors.surface};
}

.loop { list-style: none; margin: 40px 0 0; padding: 0; display: grid; gap: 26px; }
.loop li { display: grid; gap: 10px; align-content: start; }
.loop-n {
  width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center;
  font-family: ${displayFont}; font-size: 15px; font-weight: 600;
  background: ${colors.accentFaint}; color: ${colors.accent};
  border: 1px solid ${colors.border};
}
.loop h3 { margin: 0; font-size: 18px; color: ${colors.textPrimary}; letter-spacing: -.01em; }
.loop p { margin: 0; font-size: 14.5px; line-height: 1.7; color: ${colors.textSecondary}; }

.cards { margin-top: 40px; display: grid; gap: 16px; }
.card {
  border: 1px solid ${colors.border}; border-radius: ${radius.lg}px;
  background: ${colors.surface}; padding: 22px; display: grid; gap: 10px;
  align-content: start; transition: border-color .15s, transform .15s;
}
.card:hover { border-color: ${colors.borderStrong}; transform: translateY(-2px); }
.card-ico {
  width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center;
  background: ${colors.accentFaint}; color: ${colors.accent};
}
.card h3 { margin: 4px 0 0; font-size: 16.5px; color: ${colors.textPrimary}; letter-spacing: -.01em; }
.card p { margin: 0; font-size: 14px; line-height: 1.65; color: ${colors.textSecondary}; }

/* The console, drawn from the same tokens as the real one — so it follows the
   reader's theme, which is the claim this section is making. */
.shot {
  margin-top: 38px; display: grid; grid-template-columns: 52px 1fr;
  border: 1px solid ${colors.border}; border-radius: ${radius.lg}px;
  background: ${colors.bg}; overflow: hidden; box-shadow: ${colors.shadow};
}
.shot-rail {
  display: grid; gap: 6px; align-content: start; padding: 12px 0;
  background: ${colors.surface}; border-right: 1px solid ${colors.border};
  justify-items: center;
}
.shot-rail-item {
  width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center;
  color: ${colors.textMuted};
}
.shot-rail-item.on { background: ${colors.accentFaint}; color: ${colors.accent}; }
.shot-list { display: grid; }
.shot-row {
  display: grid; grid-template-columns: 3px 1fr auto auto auto; gap: 12px;
  align-items: center; padding: 13px 16px 13px 0;
  border-bottom: 1px solid ${colors.border}; font-size: 13px;
}
.shot-row:last-child { border-bottom: 0; }
.shot-bar { height: 100%; background: transparent; }
.shot-row.hot .shot-bar { background: ${colors.danger}; }
.shot-cell { color: ${colors.textBody}; }
.shot-chip {
  font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px;
  background: ${colors.accentFaint}; color: ${colors.accent};
}
.shot-chip-quiet { background: ${colors.surfaceHover}; color: ${colors.textSecondary}; }
.shot-clock { font-size: 12px; color: ${colors.textMuted}; white-space: nowrap; }
.shot-row.hot .shot-clock { color: ${colors.danger}; }

.trust { list-style: none; margin: 36px 0 0; padding: 0; display: grid; gap: 18px; }
.trust li {
  display: grid; grid-template-columns: 34px 1fr; gap: 14px; align-items: start;
  font-size: 14.5px; line-height: 1.65; color: ${colors.textSecondary};
}
.trust-ico {
  width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center;
  background: ${colors.surfaceHover}; color: ${colors.accent};
  border: 1px solid ${colors.border};
}

/* --------------------------------------------------------------- close */
.close { position: relative; overflow: hidden; background: ${stageColours.field}; padding: 80px 0; }
.close-in { position: relative; z-index: 2; display: grid; gap: 18px; justify-items: center; text-align: center; }
.close-line {
  margin: 0; font-family: ${displayFont}; font-weight: 500;
  font-size: clamp(28px, 4vw, 48px); letter-spacing: -.03em; line-height: 1.08;
  color: ${stageColours.ink};
}
.close-sub { margin: 0; font-size: 16px; line-height: 1.65; color: rgba(255,255,255,.76); max-width: 52ch; }

.foot { background: ${stageColours.field}; border-top: 1px solid rgba(255,255,255,.08); padding: 26px 0 34px; }
.foot-in { display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: baseline; font-size: 13px; color: rgba(255,255,255,.55); }

/* ------------------------------------------------------ narrow screens */
/* The nav is four things in a row — brand, language, sign in, create — and
   that is about 480px of content in 342px of phone. The ghost Sign in is the
   one to drop: it is repeated at the bottom of the page, while the language
   picker is not repeated anywhere and the solid button is the point. */
@media (max-width: 560px) {
  .nav .btn-ghost { display: none; }
  .brand { font-size: 15px; }
  .nav-right { gap: 8px; }
  .nav .btn { padding: 8px 11px; font-size: 13.5px; }
  /* The picker renders whole language names, and "Afaan Oromoo" is wider
     than the phone can spare beside a product name and a button. A select
     truncates its own label natively, and the open list is unaffected. */
  .nav-right select { max-width: 78px; padding-inline: 7px; }
}
/* The console row is five columns; on a phone the priority chip is the one
   that carries the least — status and the clock are the two that make the
   section's argument. */
@media (max-width: 760px) {
  .shot { grid-template-columns: 42px 1fr; }
  .shot-chip-quiet { display: none; }
  .shot-row { grid-template-columns: 3px 1fr auto auto; gap: 8px; padding-right: 12px; }
  .shot-clock { font-size: 11px; }
  .shot-cell { font-size: 12.5px; }
}

/* -------------------------------------------------------- wider screens */
@media (min-width: 760px) {
  .loop { grid-template-columns: repeat(3, 1fr); gap: 30px; }
  .cards { grid-template-columns: repeat(2, 1fr); }
  .trust { grid-template-columns: repeat(2, 1fr); gap: 22px 32px; }
}
@media (min-width: 1000px) {
  /* The copy takes the smaller share: a headline reads badly past about 20
     words a line, while the demonstration is what the extra pixels are for. */
  .hero-in { grid-template-columns: 1fr 1.02fr; gap: 56px; align-items: center; }
  .hero { padding: 132px 0 100px; }
  .cards { grid-template-columns: repeat(3, 1fr); }
  .sec { padding: 96px 0; }
}
`;
