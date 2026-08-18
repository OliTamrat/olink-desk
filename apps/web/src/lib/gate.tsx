"use client";
// The sign-in gate: a pitch on the left, the sign-in on the right.
//
// Ported from Bank Assist (ADR-0029) and then rearranged here, because the two
// panes are doing two different jobs and were in the wrong order for both.
//
//  - LEFT is the pitch. Headline, the channel line, and three claims the
//    product can actually be held to. A prospect reads left-to-right, so the
//    argument goes first and the form is what they arrive at.
//  - RIGHT is the sign-in, and the six-language mock now sits directly above
//    it. It is not decoration and not a stock illustration: it shows the
//    product doing the thing the product is for — one ordinary customer
//    question, answered, arriving in all six languages in turn. Saying "six
//    languages" in a badge is a claim; showing it is an argument, and it is
//    the argument staff and prospects look straight at while they type.
//
// It replaced a single still. A still has to pick ONE language to illustrate a
// product whose whole point is six, and whichever it picks is the wrong one
// for five sixths of the room.
import { SUPPORTED_LANGUAGES, tUi, type Language } from "@olink-desk/i18n";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { colors, displayFont, stage as stageColours } from "./theme";

/* ------------------------------------------------------------ the mock */

// Timing is per MESSAGE, not per character — and that is the whole reason the
// card can carry six languages. A Ge'ez character is a whole syllable, so the
// Amharic answer is a fraction of the English one's length; fixed
// milliseconds-per-character makes the same sentence race in one language and
// crawl in another, on the screen whose entire job is to show six as one
// product.
const Q_MS = 950; // a customer typing
const THINK_MS = 950; // retrieval and a model call, honestly represented
const A_MS = 1650; // the assistant writing
const HOLD_MS = 2500; // long enough to read before the language turns over
const STILL_MS = 4200; // reduced motion: no typing, so only the hold

interface Line {
  lang: Language;
  q: string;
  a: string;
}

/**
 * Starts at the PANEL's language and goes round the ring, so the first
 * exchange anyone sees is one they can read; the other five then make the
 * point.
 */
function script(panel: Language): Line[] {
  const start = Math.max(0, SUPPORTED_LANGUAGES.indexOf(panel));
  return SUPPORTED_LANGUAGES.map((_, i) => {
    const lang = SUPPORTED_LANGUAGES[(start + i) % SUPPORTED_LANGUAGES.length];
    return {
      lang,
      q: tUi(lang, "ui_mock_question"),
      a: tUi(lang, "ui_mock_answer"),
    };
  });
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * One ordinary question, answered six times.
 *
 * Everything ON the card is ONE language — the header, the citation chip and
 * both bubbles all read from `line.lang`, never from the panel's. They did not
 * at first in Bank Assist: the chrome came from the panel's language while the
 * conversation cycled, so a Tigrinya exchange sat under an Amharic header. If
 * the customer is speaking Tigrinya, the whole window is Tigrinya.
 */
function ChatMock({ lang }: { lang: Language }) {
  const [idx, setIdx] = useState(0);
  const [typedQ, setTypedQ] = useState("");
  const [typedA, setTypedA] = useState("");
  const [phase, setPhase] = useState<"q" | "think" | "a" | "hold">("q");
  const lines = useRef<Line[]>(script(lang));
  // Every scheduled callback checks this, so a language change mid-type
  // retires the old run instead of leaving two engines writing one card.
  const run = useRef(0);

  useEffect(() => {
    lines.current = script(lang);
    setIdx(0);
  }, [lang]);

  useEffect(() => {
    const mine = ++run.current;
    const line = lines.current[idx % lines.current.length];
    const reduced = prefersReducedMotion();
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => {
      timers.push(setTimeout(() => run.current === mine && fn(), ms));
    };

    if (reduced) {
      // Same six languages, same order, no movement: the ROTATION is the
      // subject, and dropping it would leave nothing to reduce the motion of.
      setTypedQ(line.q);
      setTypedA(line.a);
      setPhase("hold");
      at(STILL_MS, () => setIdx((i) => i + 1));
      return () => timers.forEach(clearTimeout);
    }

    setTypedQ("");
    setTypedA("");
    setPhase("q");

    // Every offset below is measured from the START of the run, not from
    // whenever the previous callback happened to fire. Scheduling a nested
    // `at(Q_MS + THINK_MS, …)` from INSIDE the typing callback added those
    // milliseconds a second time, so one language took about twelve seconds
    // instead of six and the card never visibly turned over — which is the
    // entire point of it. Absolute offsets from one clock cannot drift that
    // way.
    const type = (text: string, from: number, ms: number, set: (s: string) => void) => {
      const steps = Math.max(1, Math.min(text.length, 34));
      for (let s = 1; s <= steps; s += 1) {
        at(from + (ms / steps) * s, () =>
          set(text.slice(0, Math.ceil((text.length / steps) * s))),
        );
      }
    };

    const qEnds = Q_MS;
    const thinkEnds = qEnds + THINK_MS;
    const aEnds = thinkEnds + A_MS;

    type(line.q, 0, Q_MS, setTypedQ);
    at(qEnds, () => setPhase("think"));
    at(thinkEnds, () => setPhase("a"));
    type(line.a, thinkEnds, A_MS, setTypedA);
    at(aEnds, () => setPhase("hold"));
    at(aEnds + HOLD_MS, () => setIdx((i) => i + 1));

    return () => timers.forEach(clearTimeout);
  }, [idx, lang]);

  const line = lines.current[idx % lines.current.length];

  return (
    <div style={{ width: "100%" }} data-chat-mock>
      <div
        // The widget itself, upright and carrying its OWN dark surface.
        //
        // It used to be a glass card tilted in 3D on a dark stage, which
        // worked because the stage was behind it. It now sits on the sign-in
        // pane, whose background flips with the theme — so translucency would
        // have made it invisible on light and the tilt would have read as a
        // broken element beside a square form. Painting its own field makes it
        // legible on either theme and reads as what it is: a screenshot of the
        // customer's side of the product.
        style={{
          // A top-lit field rather than a flat one. On the LIGHT theme a flat
          // dark rectangle already reads as a device; on DARK it sat within a
          // few points of the page behind it and read as an empty outline.
          // The wash gives it a lit edge, and the ring is what draws its
          // outline on both.
          background: `linear-gradient(168deg, ${stageColours.lift} 0%, ${stageColours.field} 62%)`,
          border: `1px solid ${stageColours.hairline}`,
          borderRadius: 16,
          boxShadow: `0 1px 0 ${stageColours.sheen} inset, 0 18px 44px -24px rgba(0,0,0,.6)`,
          padding: 14,
          display: "grid",
          gap: 9,
          // Reserved so the card does not resize as each language's answer
          // types in — a box that grows and shrinks six times a minute is the
          // most distracting thing that could happen on this screen.
          minHeight: 176,
          alignContent: "start",
          overflow: "hidden",
        }}
        lang={line.lang}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span
            aria-hidden
            style={{
              width: 28,
              height: 28,
              borderRadius: 9,
              background: "rgba(255,255,255,.14)",
              display: "grid",
              placeItems: "center",
              fontSize: 12,
              color: stageColours.ink,
              fontWeight: 700,
            }}
          >
            O
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13, color: stageColours.ink, fontWeight: 600 }}>
              {tUi(line.lang, "ui_mock_assistant")}
            </span>
            <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,.55)" }}>
              {tUi(line.lang, "ui_mock_online")}
            </span>
          </span>
        </div>

        {/* The customer */}
        <div
          style={{
            alignSelf: "end",
            justifySelf: "end",
            maxWidth: "86%",
            background: "rgba(255,255,255,.12)",
            color: stageColours.ink,
            borderRadius: "12px 12px 4px 12px",
            padding: "8px 11px",
            fontSize: 13.5,
            lineHeight: 1.5,
            minHeight: 20,
          }}
        >
          {typedQ}
        </div>

        {/* The desk */}
        {phase === "think" ? (
          <div
            style={{
              justifySelf: "start",
              background: "rgba(255,255,255,.08)",
              borderRadius: "12px 12px 12px 4px",
              padding: "10px 12px",
              display: "flex",
              gap: 4,
            }}
            aria-hidden
          >
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,.6)",
                  animation: `mockDot 1s ${i * 0.15}s infinite ease-in-out`,
                }}
              />
            ))}
          </div>
        ) : phase === "a" || phase === "hold" ? (
          <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
            <div
              style={{
                maxWidth: "92%",
                background: "rgba(255,255,255,.08)",
                color: "rgba(255,255,255,.94)",
                borderRadius: "12px 12px 12px 4px",
                padding: "9px 12px",
                fontSize: 13.5,
                lineHeight: 1.55,
              }}
            >
              {typedA}
            </div>
            {/* The citation lands LAST, because the answer having a source is
                the claim being made, and it only means something once there
                is an answer to attach it to. */}
            <span
              style={{
                fontSize: 10.5,
                letterSpacing: ".04em",
                color: "rgba(255,255,255,.62)",
                border: "1px solid rgba(255,255,255,.16)",
                borderRadius: 999,
                padding: "3px 8px",
                opacity: phase === "hold" ? 1 : 0,
                transition: "opacity .3s",
              }}
            >
              {tUi(line.lang, "ui_mock_sources", { n: 2 })}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- the gate */

/**
 * Whether the mock is worth running at all.
 *
 * Two real costs, not niceties: below 1024px the mock is not shown, so the
 * timer would be pure battery on a phone; and a login page left open in a
 * background tab is the normal case rather than the exception.
 *
 * Width only — the SHORT-viewport cut is CSS, deliberately. A media query
 * that hides the mock cannot be observed from here without a second listener
 * that would then have to agree with the stylesheet, and two rules for one
 * decision drift. The cost of the disagreement is a timer running behind
 * `display: none` on a laptop, which is a fraction of what it saves on a
 * phone.
 */
function useStageActive(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const read = () =>
      setActive(window.innerWidth >= 1024 && !document.hidden);
    read();
    window.addEventListener("resize", read);
    document.addEventListener("visibilitychange", read);
    return () => {
      window.removeEventListener("resize", read);
      document.removeEventListener("visibilitychange", read);
    };
  }, []);
  return active;
}

/**
 * `picker` is a prop rather than part of `children` because of where it has
 * to land. The language control belongs at the top of the sign-in column,
 * above everything — and `children` is the form. Left inside the form's own
 * markup it rendered BETWEEN the mock and the card, floating right, attached
 * to neither.
 */
export function Gate({
  lang,
  picker,
  children,
}: {
  lang: Language;
  picker?: ReactNode;
  children: ReactNode;
}) {
  const stage = useStageActive();
  return (
    <main style={{ minHeight: "100vh", display: "grid" }} data-gate>
      {/* dangerouslySetInnerHTML, not a text child. React HTML-escapes a
          `<style>` child, so the quotes inside the grain's data: URI came
          back as `&quot;` on one side of hydration and `"` on the other —
          a mismatch that made React throw away the server HTML and re-render
          the whole page on the client. Caught by watching the console while
          driving it, not by reading the diff. */}
      <style dangerouslySetInnerHTML={{ __html: gateCss }} />
      <div className="gate-grid">
        {/* The pitch. Hidden below 1024px by CSS — a phone gets the form and
            nothing else, because a promo pane stacked above a login is a
            screenful of scrolling between someone and their work. */}
        <aside className="gate-stage" aria-hidden>
          <div className="aurora">
            <i />
            <i />
            <i />
          </div>
          <div className="stage-inner">
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".16em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,.62)",
              }}
            >
              {tUi(lang, "ui_gate_eyebrow")}
            </div>
            <h2
              className="display stage-line"
              lang={lang}
              style={{
                margin: 0,
                fontFamily: displayFont,
                fontWeight: 500,
                fontSize: "clamp(30px, 3.2vw, 46px)",
                letterSpacing: "-.025em",
                lineHeight: 1.1,
                color: stageColours.ink,
                textShadow: "0 2px 30px rgba(0,0,0,.45)",
              }}
            >
              {tUi(lang, "ui_gate_line")}
            </h2>
            <p
              className="stage-sub"
              lang={lang}
              style={{
                fontSize: 15,
                lineHeight: 1.65,
                color: "rgba(255,255,255,.8)",
                maxWidth: "46ch",
                margin: "-6px 0 0",
              }}
            >
              {tUi(lang, "ui_gate_sub")}
            </p>
            {/* Three claims rather than three adjectives. Each one is
                something the product can be held to in a demo — grounded
                answers, an SLA clock, tenant isolation — which is what makes
                this a pitch rather than a wallpaper with a headline on it. */}
            <ul className="stage-proof" lang={lang}>
              {(["ui_gate_proof_grounded", "ui_gate_proof_sla", "ui_gate_proof_tenancy"] as const).map(
                (key) => (
                  <li key={key}>
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path
                        d="M3.5 8.4l3 3 6-7"
                        stroke={stageColours.bloomB}
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>{tUi(lang, key)}</span>
                  </li>
                ),
              )}
            </ul>
          </div>
        </aside>

        {/* The sign-in */}
        <div className="gate-pane">
          <div style={{ width: "100%", maxWidth: 448 }}>
            {picker ? (
              <div
                style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}
              >
                {picker}
              </div>
            ) : null}
            {/* Above the form, not beside it: it is the last thing read before
                the cursor lands in the first field. Not mounted at all when
                inactive, so no timer runs behind a hidden tab, and dropped
                entirely on a short viewport by CSS — the form must never
                scroll to make room for an animation. */}
            {stage ? (
              <div className="gate-mock">
                <ChatMock lang={lang} />
              </div>
            ) : null}
            {children}
            {/* Sized by the WRAPPER, not by this line. `place-items: center`
                makes a grid item shrink-to-fit, so a nowrap sentence here
                would otherwise decide the width of the card above it — which
                is how Bank Assist's card ended up exactly as wide as this
                sentence happened to be in whichever language was showing. */}
            <p
              style={{
                margin: "14px 0 0",
                fontSize: 11.5,
                lineHeight: 1.6,
                textAlign: "center",
                color: colors.textMuted,
              }}
            >
              {tUi(lang, "ui_gate_trust")}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * The gate's own stylesheet.
 *
 * As a string rather than style objects because three things here have no
 * inline equivalent: `@media`, `@keyframes`, and the `::before`/`::after`
 * layers that carry the grain and the vignette.
 */
const gateCss = `
.gate-grid { min-height: 100vh; display: grid; grid-template-columns: 1fr; }
.gate-pane {
  display: grid; place-items: center; padding: 24px;
  /* border-box LOCALLY. This repo deliberately omits a global one (it would
     silently change the geometry of every fixed-width pane in the console),
     so padding adds to min-height by default — and 100vh + 24px top + 24px
     bottom is a page that scrolls by exactly 48px at EVERY viewport size.
     That constant was the tell: a content problem varies with the content,
     and this did not budge when the type came down. */
  box-sizing: border-box;
  min-height: 100vh; position: relative; z-index: 1;
  /* A wash, and only where the pitch pane is not. Below 1024px this is the
     WHOLE page — flat \`--bg\` with one card on it, which is what a phone was
     getting — while on desktop the same wash would compete with the lit pane
     18px to its left. Overridden back to flat in the desktop query. */
  background:
    radial-gradient(120% 62% at 50% -6%, ${colors.accentFaint} 0%, transparent 64%),
    ${colors.bg};
}
.gate-stage { display: none; }
.gate-mock { margin-bottom: 18px; }

@media (min-width: 1024px) {
  /* The pitch takes the larger share and the form the smaller: a form has a
     fixed comfortable width and gains nothing from more, while the headline
     is what the extra pixels are for. Both are fr units so neither pane can
     eat the other at a narrow desktop width. */
  .gate-grid { grid-template-columns: 1fr minmax(408px, .84fr); }
  .gate-pane { background: ${colors.bg}; }
  .gate-stage {
    display: block; position: relative; overflow: hidden;
    background: ${stageColours.field};
  }
}

/* Aurora. THREE blurred blooms rather than one gradient: a single ramp reads
   as a backdrop, overlapping blooms read as light. They sit in one cool
   quadrant — brand blue, a cyan a few degrees off it, and a deep indigo
   carrying almost no saturation — so the pane reads as depth rather than as
   three colours. The blooms gather toward the INNER edge, next to the form,
   so the light falls across the fold instead of off the far side of the
   screen. */
.aurora { position: absolute; inset: -20%; pointer-events: none; }
.aurora i {
  position: absolute; display: block; border-radius: 50%;
  filter: blur(90px); opacity: .5;
  animation: gateDrift 26s ease-in-out infinite alternate;
}
.aurora i:nth-child(1) {
  width: 48%; height: 54%; top: 0%; right: 4%;
  background: ${stageColours.bloomA};
}
.aurora i:nth-child(2) {
  width: 42%; height: 44%; top: 34%; right: 24%;
  background: ${stageColours.bloomB};
  animation-delay: -9s; animation-duration: 32s;
}
.aurora i:nth-child(3) {
  width: 44%; height: 46%; bottom: 2%; right: 10%;
  background: ${stageColours.bloomC}; opacity: .34;
  animation-delay: -17s; animation-duration: 38s;
}
@keyframes gateDrift {
  from { transform: translate3d(0,0,0) scale(1); }
  to   { transform: translate3d(-6%, 5%, 0) scale(1.14); }
}
@keyframes mockDot {
  0%, 60%, 100% { opacity: .35; transform: translateY(0); }
  30%           { opacity: 1;   transform: translateY(-3px); }
}
@media (prefers-reduced-motion: reduce) {
  .aurora i { animation: none; }
}

/* Grain and a vignette. The grain is not only texture: a large dark area with
   a soft gradient across it BANDS visibly in 8-bit colour, and a little noise
   dithers that away. Inline SVG turbulence — no request, no library. The
   vignette pulls the eye off the edges and onto the headline. */
.gate-stage::before {
  content: ""; position: absolute; inset: 0; z-index: 1; pointer-events: none;
  opacity: .05; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E");
}
.gate-stage::after {
  content: ""; position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background: radial-gradient(ellipse 80% 70% at 34% 42%, transparent 46%, rgba(0,0,0,.52) 100%);
}
.stage-inner {
  position: relative; z-index: 2; height: 100%;
  display: flex; flex-direction: column; justify-content: center;
  gap: 26px; padding: 56px clamp(44px, 5vw, 76px);
}
.stage-proof {
  list-style: none; margin: 0; padding: 0;
  display: grid; gap: 12px; max-width: 44ch;
}
.stage-proof li {
  display: grid; grid-template-columns: 15px 1fr; gap: 11px;
  align-items: start;
  font-size: 13.5px; line-height: 1.55; color: rgba(255,255,255,.76);
}
.stage-proof svg { margin-top: 3px; }

/* A laptop is about 600–660 CSS px tall once the browser's own chrome is out,
   and this pane was built at a size needing ~730 — so it scrolled, and the
   bottom of the pitch was cut off at the fold on the screen whose entire job
   is the first impression. */
@media (min-width: 1024px) and (max-height: 860px) {
  /* The mock goes FIRST, and before anything is squeezed. It sits above a
     form whose height is fixed by its fields, so on a short screen it is the
     one thing that can be removed without making anything else worse — and
     leaving it in is what pushes the sign-in button below the fold. */
  .gate-mock { display: none; }
}
@media (min-width: 1024px) and (max-height: 780px) {
  .stage-inner { gap: 18px; padding: 32px 44px; }
  .stage-line { font-size: clamp(24px, 2.1vw, 32px) !important; }
  .stage-sub { font-size: 13.5px !important; }
  .stage-proof { gap: 9px; }
  .stage-proof li { font-size: 12.5px; }
}
/* Genuinely short: a 13" laptop with a toolbar and a bookmarks bar. The sub
   line is the one thing here that repeats what the headline already said, so
   it is what goes rather than squeezing everything to illegibility. */
@media (min-width: 1024px) and (max-height: 660px) {
  .stage-inner { gap: 14px; padding: 24px 40px; }
  .stage-line { font-size: clamp(22px, 1.9vw, 28px) !important; }
  .stage-sub { display: none; }
}
`;
