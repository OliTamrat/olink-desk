# Customer Support / Task & Call Tracking System — Ethiopia Market Analysis

> Prepared 2026-08-13. Status: **analysis for a product decision** — a new, standalone
> customer-support, task and call tracking product to be built ahead of the Onekof PM
> launch (~3 months out), sold to any Ethiopian organization, not only DAPS/Onekof
> customers. Facts below were researched 2026-08-13 from public sources; each section
> flags confidence and the items that still need primary verification. Figures in ETB
> use the ~161 ETB/USD official rate of August 2026.

---

## 1. Executive summary

**The opportunity is real and the timing is unusually good.** Ethiopia has no
established local helpdesk/ticketing product. The international incumbents
(Zendesk, Freshdesk, Intercom) are effectively locked out of the domestic market by
the payment rail — Stripe and PayPal cannot pay out to Ethiopian entities, ordinary
firms need bank FX approval to pay USD subscriptions, and none of them support
Amharic/Ge'ez UI, Telegram-first workflows, ETB billing, or in-country hosting.
Meanwhile the demand side is exploding: 136M mobile-money accounts, 9.7T ETB of
digital transactions in the last fiscal year (+129%), 32 banks, 18 insurers, two
telcos with ~105M combined subscribers, ~42 ride-hailing companies in Addis alone,
and a BPO sector growing >23%/yr — every one of these generates complaint, dispute,
and call volume that is today handled in Excel, paper logs, and personal Telegram
accounts.

**The strategy that fits the market:** build a **system-of-record support desk**
(omnichannel ticketing + task tracking + call logging), *not* a cloud-telephony
platform. Voice infrastructure in Ethiopia runs through the two licensed operators;
Ethio Telecom already sells a CCaaS product (~5,000–7,000 ETB/mo at 2022 pricing)
and is both gatekeeper and competitor for anything that carries calls. The winning
position is the layer Ethio Telecom does not provide: the ticket, the SLA, the
follow-up task, the Telegram bot, the Amharic UI, the CSAT survey by SMS, the
manager dashboard — running on top of whatever phone lines the customer already has.

**Unfair advantages already in hand (from the Onekof/Olink codebases):** an
INSA-certified security baseline, a working Ethio Telecom ECS deployment path and
in-country data-residency machinery (Proclamation 1321/2024 Art. 22), 5-language
i18n with Ge'ez script support, Ethiopian calendar/fiscal-year handling, a
single-image offline-deployable Docker architecture, multi-tenant auth/RBAC, and a
proven invoice + push-payment subscription flow (from Olink Dispatch) that matches
how Ethiopian companies actually pay. No competitor — local or international —
starts with that stack.

**Recommendation:** build it as a standalone product on the Onekof platform
architecture, launch it in lockstep with Onekof PM as its own support desk
("the desk that supports Onekof"), price per-agent in ETB far below Western norms
(agent wages are 6,000–16,000 ETB/month — see §7), and use the Startup
Proclamation 1396/2025 procurement set-asides as the government go-to-market lever.

---

## 2. Product definition

**Working definition:** a multi-tenant SaaS (with on-prem option) that gives an
Ethiopian organization one place to receive, track, assign, and resolve every
customer interaction — whatever channel it arrives on — and to manage the internal
tasks those interactions create.

Three capabilities in one product, deliberately:

1. **Omnichannel ticketing** — Telegram bot, phone call log, SMS, web widget/form,
   email, WhatsApp (later), and walk-in entry all create the same ticket object.
2. **Call tracking** — inbound/outbound call logging with disposition codes,
   callback queues, agent assignment, duration, outcome, and follow-up tasks.
   *Logging and orchestration of calls carried on the customer's existing lines* —
   not carrying the calls ourselves (see §5 telephony strategy).
3. **Task tracking** — tickets convert to tasks with assignees, due dates, SLAs,
   and escalation; teams that aren't "support" (operations, field service,
   maintenance, government service desks) can use the same engine for request
   tracking. This is also the native integration surface with Onekof PM
   (ticket → project task).

**Not in scope for v1:** carrying voice traffic (SIP trunking, virtual PBX,
call recording infrastructure), a full CRM/sales pipeline, and social-media
listening. Each is a later phase or a partner integration.

### Naming (open decision)

Options, in rough order of preference:
- **Onekof Desk** — leverages the Onekof brand at exactly the moment it launches;
  positions the pair as a suite (PM + support). Risk: ties the product's identity
  to Onekof when the mandate is "sell to anyone."
- **Olink Desk / Olink Assist** — fleet-neutral, consistent with the Olink product
  family (there is already a "Bank Assist" on the docs portal), independent brand.
- A standalone Amharic-friendly name — strongest local identity, most marketing
  work from zero.

---

## 3. Why now — market context

| Signal | Fact (2025–26) | Confidence |
|---|---|---|
| Digital finance volume | 136M mobile-money accounts; 9.7T ETB digital transactions last FY (+129%); Telebirr ~60M users, 4.19T ETB in FY2025/26; CBE alone 45M accounts, 80% of transactions digital | High |
| Connectivity base | Ethio Telecom 90.1M subscribers (Jul 2026); Safaricom Ethiopia 14.7M; internet penetration 21.3% (~28.6M users); smartphone penetration ~15% of population | High |
| Support demand | Every transaction platform above generates dispute/complaint volume; EEU runs a 24-hr hotline (905) and has announced call-center expansion; Ethio Telecom's own 994 line spans SMS/Telegram/social | Med–High |
| Supply gap | **No established local helpdesk/ticketing product found**; Odoo partner ecosystem (2 Gold Partners) is the de-facto competitor via its Helpdesk module riding on ERP deals | Med–High |
| Payment moat | Stripe/PayPal cannot serve Ethiopian merchants; USD SaaS requires FX approval and auto-inflates ~10–30%/yr in ETB terms as the birr slides (57 → ~161/USD since June 2024) | High |
| Policy tailwind | Startup Proclamation 1396/2025: 5-yr income-tax exemption for labeled startups, **5% of government ICT procurement reserved for startups**, SOEs (Ethio Telecom, CBE) mandated to pilot ≥1 startup project/year, ETB 2B startup fund | High |
| BPO growth | Addis BPO/call-center firms (Ablaze Labs, Zoha, Echelon, Flownexs, AIT, MMYC); sector growth claimed >23%/yr; their tooling is not publicly known — likely spreadsheets/foreign tools | Med |

### Target segments, in priority order

1. **Fintech, banks & microfinance** (32 commercial banks, 18 insurers, dozens of
   MFIs): the highest complaint volume in the country (payment disputes), an NBE
   directive already requiring information-security discipline, and buyers who will
   demand INSA audit + in-country hosting — which we can uniquely satisfy.
2. **Ride-hailing, delivery & e-commerce** (~42 registered ride-hailing companies
   in Addis; RIDE, Feres, ZayRide): press coverage explicitly flags weak
   safety/support; young companies, fast decisions, ETB budgets.
3. **BPO / outsourced call centers**: they *are* the product's power users; a
   per-seat ETB tool with Telegram + SMS channels is their whole stack.
4. **Government service desks & SOEs**: the 5% procurement set-aside and the
   SOE-pilot mandate are a door-opener; immigration, trade registration, kebele
   service points, EEU, water utilities all run request queues on paper today.
5. **Airlines, hospitals, universities**: later — longer sales cycles, but
   Ethiopian Airlines alone runs a global multi-country contact-center operation.
6. **Olink/DAPS internal** (launch customers, day one): Onekof PM launch support,
   Olink Dispatch carrier support, Olink School Bus parent support, DAPS client
   support. Real ticket volume from week one, and the credibility story.

---

## 4. Competitive landscape

| Competitor | Position | Why we win |
|---|---|---|
| **Ethio Telecom CCaaS** (launched Oct 2022; ~5,000–7,000 ETB/mo at launch pricing) | Voice-centric contact center as a service; ACD, IVR, some omnichannel claims | It carries calls; it is not a system of record. No task tracking, no local-language depth, no on-prem, SOE sales motion. We should *integrate beside it*, not fight it — a customer can run Ethio CCaaS for voice and our product as the ticket/task layer. Also the anchor that legitimizes our price point. |
| **Odoo + local partners** (Atheer, ETTA are Gold Partners) | Helpdesk module bundled into 4–12-week ERP projects | Odoo Helpdesk is an ERP afterthought: no Telegram-native flow, no Ge'ez-script polish, no SMS/USSD thinking, needs consultants. We are product-led, self-serve, support-specialized. |
| **Zendesk / Freshdesk / Intercom** | Global feature leaders | Cannot take ETB, no local channels, no Amharic, no residency story, $19–55+/agent/mo USD ≈ 3,000–9,000 ETB — per agent — against agent wages of 6,000–16,000 ETB/mo. Only viable for exporters with FX access. |
| **Local CRM/ERP builders** (ZalaTech, Addis Software, etc.) | Custom CRM projects | Services businesses, not products; no ticketing specialization. Potential *channel partners* rather than threats. |
| **Spreadsheets + personal Telegram** | The real incumbent in 90% of accounts | This is the actual competition. The product must be adoptable in a day and cheaper than the chaos it replaces. |

**Watch item:** NBE's February 2026 FX relaxations (100% retention for service
exporters, corporate FX debit cards) slightly weaken the "can't pay Zendesk" moat
for *export-oriented* tech companies. The moat holds for domestic banks, SOEs,
government, and ordinary firms — which is the core market anyway.

---

## 5. What the Ethiopian market requires of the product

This is the heart of the analysis: the concrete requirements that make an
Ethiopia-fit support product different from a Zendesk clone.

### 5.1 Channels — Telegram first, voice as logging, SMS as fallback

- **Telegram is the primary digital channel.** Ethiopia is one of ~2 African
  countries where WhatsApp is *not* the leading messenger; banks, retailers,
  government offices, and Ethio Telecom itself already run support on Telegram.
  v1 must ship a first-class **Telegram bot per tenant**: customers open tickets,
  get status updates, and answer CSAT surveys inside Telegram; agents can work
  from the web console or a supervised Telegram interface. Bot API access is
  unrestricted and free.
- **Voice = the biggest channel by volume, handled as *tracking*, not carriage.**
  Only ~15% of the population has a smartphone; the majority of customer contact
  for mass-market businesses is a phone call to a GSM number or hotline. v1 ships:
  click-to-log call capture (agent logs caller, reason, disposition in <15s),
  callback queues, missed-call follow-up tasks, and call-outcome analytics.
  Integration with Ethio Telecom CCaaS / PBX call-detail records is a fast-follow
  (CSV/API import), giving automatic call ↔ ticket matching without us touching
  voice infrastructure.
- **SMS via local aggregators** (AfroMessage — integrated with both operators;
  GeezSMS; FalconVAS publishes ~0.163 ETB/SMS incl. VAT at enterprise volume):
  outbound notifications ("your ticket ETH-1042 is resolved"), CSAT surveys, and
  OTP. International routes (Twilio ~$0.34/SMS) are commercially unusable —
  the SMS layer must be built on local aggregator APIs from day one. Inbound SMS
  and dedicated shortcodes are enterprise add-ons (shortcode acquisition is
  opaque and negotiated — get quotes from AfroMessage/ZalaTech; ECA numbering
  fees apply).
- **Web widget + hosted form** for the smartphone/desktop minority and for B2B
  tenants; must be lightweight enough for 2G/3G connections.
- **Email**: supported but deprioritized — email is a thin channel in Ethiopian
  consumer life; it matters mainly for B2B and government correspondence.
- **WhatsApp Business API**: Phase 2. Works in Ethiopia via BSPs, but secondary
  to Telegram and adds per-conversation Meta fees in USD.
- **USSD**: Phase 3, enterprise-only. Third-party USSD is real (banks/fintechs use
  it; 0.21 ETB per 30-second session on both operators) but requires negotiated
  operator agreements — offer "check your ticket status by USSD" as an enterprise
  feature for banks/utilities once volume justifies it.
- **Walk-in entry**: a deliberately simple counter-mode form. Ethiopian service
  culture is heavily in-person; branches and service counters need one-tap ticket
  creation on behalf of a walk-in customer.

### 5.2 Language & locale — reuse Onekof's i18n wholesale

- **English, Amharic, Afaan Oromo, Tigrinya, Somali** — Onekof already ships all
  five with Abyssinica SIL for Ge'ez script. The support product inherits the
  locale files, the reviewed-translation pipeline, and the linguist workflow.
- **Both calendars.** Ethiopian calendar display (and fiscal-year-July reporting)
  is already solved in Onekof; SLAs and reports must respect Ethiopian public
  holidays and the local working week.
- **Ge'ez-script full-text search** on tickets is a differentiator no importer
  offers — plan for it in the search design (Postgres FTS with proper
  normalization; test with real Amharic corpora).
- Customer-facing bot/SMS content must be per-tenant bilingual (their choice of
  languages), not merely per-agent.

### 5.3 Resilience — shutdowns and low bandwidth are design inputs

Ethiopia had ~30 internet shutdowns 2016–2024, including an ~11-month regional
data blackout (Amhara, 2023–24) and a 5-month national social-media block that
included Telegram (Feb–Jul 2023). Exam-period national cuts recur annually.
Consequences for the product:

- **Multi-channel redundancy is a resilience feature, not just reach**: when data
  is down, SMS and voice often still work — the call-log + SMS layers keep the
  desk alive through a data shutdown.
- **On-premise deployment option** (Onekof's single-Docker-image, USB-deployable
  pattern) is a real seller for government/regional customers whose connectivity
  is unreliable — the desk keeps working on the LAN.
- **Low-bandwidth web console**: aggressive payload budgets, offline-tolerant PWA
  behavior for the agent console (queue actions locally, sync on reconnect).
- **Telegram-only is not acceptable as the sole digital channel** — the 2023
  block is the precedent. Every tenant gets at minimum web + one more channel.

### 5.4 Payments & billing — no card-on-file exists; build for push payments

Structural fact (high confidence): **there is no true card-on-file auto-renewal
rail in Ethiopia.** Stripe cannot onboard Ethiopian merchants; PayPal cannot pay
out. Subscription collection is therefore:

- **Chapa** as primary gateway (NBE-licensed; aggregates Telebirr, CBE Birr,
  M-Pesa, cards; ~2.5–3% standard, ~1% negotiated at >1M ETB/mo volume; the only
  Ethiopian gateway with public evidence of subscription tooling — **verify the
  recurring mechanics directly with Chapa before committing**).
- **Telebirr merchant integration as direct fallback.** The January 2026
  Ministry-of-Justice freeze of ~10 payment gateways (ArifPay among them, over
  ETB 818M in assessed taxes) is the cautionary tale: never depend on a single
  aggregator. Telebirr's ~60M wallets and Ethio Telecom's stability make it the
  safe second rail; M-Pesa (5.7M wallets) third.
- **The Olink Dispatch subscription architecture transfers almost unchanged**:
  status/period-end/enforcement columns, an idempotent webhook applying renewals,
  a monthly expiry cron, renewal walls in the UI, and enforcement that never
  strands an end customer mid-interaction. Swap Stripe Checkout for
  Chapa/Telebirr checkout; keep the invoice + push-payment renewal model, which is
  exactly how Ethiopian businesses expect to pay.
- **Annual prepay discount is not just margin — it is FX protection** for us and
  price certainty for the customer while the birr depreciates (~65% against USD
  since June 2024; official rate ~161.8 as of 2026-08-12; inflation back up to
  ~11.7%). Contracts need an explicit annual ETB repricing clause.
- Enterprise/government deals will pay by **bank transfer against a proforma
  invoice** — the billing system must treat manually-confirmed invoices as a
  first-class payment method, not an exception.

### 5.5 Regulatory & compliance — our strongest moat if done early

| Requirement | What it means for us | Status/asset |
|---|---|---|
| **ECA class license** (Licensing Directive 792/2021; fees Directive 1024/2024) | Call Center Service and VAS class licenses exist at **35,000 ETB/yr + 1% of gross revenue** regulatory charge. A call-*tracking* SaaS that does not carry voice most plausibly needs a VAS or Call Center class license — or possibly none. Cheap either way; the diligence question is *which*. | **Action: written ECA inquiry + pull Directive 1024/2024 full text.** Do this in month 1 — it's a ~$220/yr cost and a sales asset ("ECA-licensed"). |
| **VoIP/SIP** | No longer criminal (Proclamation 1148/2019 repealed the 2012 fraud law) but commercial voice carriage is licensable and interconnection runs through the operators. | Confirms the §5.1 strategy: don't carry calls in v1. Revisit only with a partner/operator agreement. |
| **Personal Data Protection Proclamation 1321/2024** (in force Jul 2024) | Art. 22 requires personal data collected in Ethiopia to be stored in-country; support tickets are full of personal data; complaint/health-adjacent content can be *sensitive* data (cross-border transfer needs prior approval). | **Solved by inheritance**: Onekof's Tier 1 (Ethio Telecom ECS) / Tier 2 (on-prem) deployments and the `residency.ts` gating pattern. The support product should launch on in-country hosting *by default* — a marketing headline, not a burden. |
| **INSA** | Financial institutions are "critical infrastructure"; banks are bound by NBE's 2023 infosec directive; government/financial buyers will demand INSA audit of the vendor and likely in-country hosting. | **Onekof's INSA certification (2026-07-03, ~6-month validity) is the template** — same security baseline (P1–P6), same audit playbook. Budget a certification cycle for this product before the first bank deal. Verify with INSA whether vendor-level certification is mandatory or buyer-driven. |
| **Call recording consent** | If/when recording ships (Phase 3), consent norms under 1321/2024 apply. | Design disposition-logging (no audio) for v1 — sidesteps the issue entirely. |
| **Startup Proclamation 1396/2025** | 5-yr income-tax exemption, duty-free imports, **5% of government ICT procurement reserved for startups**, SOE pilot mandates, ETB 2B fund. | **Action: pursue startup labeling for the operating entity** — it is both economics and the government GTM wedge. |

### 5.6 Hosting

- **Primary: Ethio Telecom ECS/Telecloud** — the path Onekof has already priced
  and been approved on (reference config: 4c/32GB/4Mbps + daily backup ≈
  126,815 ETB/6mo). Hosts the national digital ID; the credibility default for
  government/finance.
- **Colocation alternatives**: Wingu.Africa and Raxio ET1 (both Tier III,
  ICT Park, Addis) for growth/redundancy.
- **On-prem**: the Onekof single-image Docker deployment, unchanged.
- **No hyperscaler is in-country** (nearest AWS is Cape Town) — global-cloud
  hosting fails Art. 22 by default and adds shutdown exposure at the
  international gateway. An EU-hosted tier (like Onekof Tier 3) can exist for
  non-Ethiopian customers later, but Ethiopia sales lead with sovereignty.

---

## 6. Product specification (v1 scope)

### Core objects

- **Ticket** — id, tenant, contact, channel, language, category, priority,
  status, assignee, team/queue, SLA timers, linked tasks, merged-duplicates,
  full interaction timeline (every message/call/note across channels in one
  thread).
- **Call log** — direction, phone number, contact match, agent, start/duration,
  disposition code (configurable per tenant), outcome notes, follow-up task,
  optional link to CDR import row.
- **Task** — the Onekof task shape: assignee, due date, checklist, watchers;
  created from tickets or standalone; two-way link to Onekof PM projects for
  tenants who run both.
- **Contact** — phone-number-first identity (phone is the primary key of
  Ethiopian customer identity; email optional), Telegram id, language
  preference, consent flags, interaction history.
- **SLA policy** — per-tenant, business-hours aware (Ethiopian holidays,
  configurable work week), escalation chains, breach alerts.
- **CSAT** — post-resolution survey by the channel the ticket arrived on
  (Telegram inline buttons / SMS reply / web).

### Consoles

- **Agent console** (web, low-bandwidth PWA): unified inbox across channels,
  keyboard-first triage, canned responses per language, 15-second call logging.
- **Supervisor console**: live queue wallboard, SLA breach board, agent
  workload, reassignment, approval of outbound bulk notifications.
- **Analytics**: volume by channel/category/branch, first-response and
  resolution times, CSAT trends, agent performance, exportable (and a natural
  DAPS Analytics upsell: advanced analytics as a service on top).
- **Admin**: tenant branding, channels, SLA policies, disposition codes, roles
  (agent / supervisor / admin / read-only auditor), audit log.

### Platform properties (inherited from Onekof/Olink patterns)

Multi-tenant isolation enforced at the middleware/query layer with tests;
RBAC; bcrypt/JWT auth with lockout; structured audit logging of every agent
action; Postgres + Prisma; single-image Docker; env-driven tier config;
i18n×5; INSA P1–P6 security baseline; Chapa/Telebirr billing service with
renewal walls.

---

## 7. Pricing

**The constraint that shapes everything: an Addis support agent costs an employer
roughly 6,000–16,000 ETB/month ($37–100).** Zendesk-style $19–55/agent/month
(≈3,000–9,000 ETB) would equal 30–90% of an agent's wage — dead on arrival.
Local anchors: Ethio Telecom CCaaS launched at ~5,000–7,000 ETB/month flat;
Yonet's SME SaaS starts at 5,000 ETB/month; local B2B SaaS clusters at roughly
3,000–15,000 ETB/month per company.

Proposed structure (ETB, launch pricing — revisit against pilot feedback):

| Tier | Price | Includes | Target |
|---|---|---|---|
| **Free** | 0 | 2 agents, web + 1 Telegram bot, 100 tickets/mo, community support | Adoption engine; the spreadsheet replacement |
| **Team** | **~4,500 ETB/mo** (~$28) flat | Up to 5 agents, all channels except shortcode/USSD, SLA, CSAT, analytics | SMEs, startups, ride-hailing/delivery ops teams |
| **Business** | **~1,500 ETB/agent/mo** (~$9), min 5 agents | Unlimited everything above + CDR import, API, custom roles, priority support | BPOs, mid-size fintech, insurers |
| **Enterprise / Government** | Custom (annual, invoice) | On-prem or dedicated Tier-1 hosting, INSA documentation pack, shortcode/USSD add-ons, SSO, SLA contract | Banks, SOEs, ministries, EEU-class utilities |

- **Annual prepay: 2 months free** (matches the Olink Dispatch convention) —
  doubles as FX protection.
- SMS passes through at cost + margin (metered wallet, ~0.35–0.50 ETB/SMS to the
  tenant against ~0.16–0.25 aggregator cost) — a genuine secondary revenue line
  at volume.
- Keep a USD price list only for non-Ethiopian/BPO-export customers.

**Revenue sanity check** (illustrative, not a forecast): 150 paying SME/Team
tenants + 25 Business tenants averaging 10 agents + 4 enterprise deals at
~600k ETB/yr ≈ **14–15M ETB/yr (~$90k)** ARR by end of year one — modest in USD,
meaningful in ETB, and the enterprise pipeline (32 banks, 2 telcos, SOE pilot
mandates) is where the real curve is.

---

## 8. Build strategy

**Recommendation: standalone product, shared platform.**

- **New repo/app** in the Olink fleet, built on the Onekof web stack (Next.js +
  TypeScript + Prisma + Postgres + the single-image Docker pipeline), importing
  the proven patterns rather than forking the monolith: auth/RBAC, tenant
  isolation middleware + its guard tests, i18n framework and locale
  infrastructure, audit logging, residency gating, and the Olink Dispatch
  subscription/billing service adapted to Chapa/Telebirr.
- **Why not an Onekof module:** the buyer is different (support managers vs
  project teams), the sales motion is different (per-agent vs per-user), the
  mandate is explicitly "sell to anyone," and coupling it into Onekof's release
  train would slow both. The Onekof *integration* (ticket ↔ task sync, shared
  SSO for tenants who run both) is a feature, not an architecture.
- **What is genuinely new to build:** the omnichannel inbox/threading engine,
  the Telegram bot framework (per-tenant bot tokens, webhook fan-in), the SMS
  aggregator abstraction (AfroMessage/GeezSMS/FalconVAS adapters behind one
  interface), call-log UX + CDR import, SLA/business-hours engine, and the
  supervisor wallboard.

### Three-month plan (aligned to the Onekof launch)

| Month | Engineering | Non-engineering (founder/ops) |
|---|---|---|
| **1** | Multi-tenant core, auth, ticket + contact + task model, agent console, web channel, Telegram bot MVP, call logging | ECA written inquiry + license application; Chapa merchant onboarding + recurring-billing verification; startup-labeling application; SMS aggregator quotes (AfroMessage first) |
| **2** | SMS integration (send + CSAT), SLA engine + business hours/holidays, supervisor console, analytics v1, billing (Chapa + Telebirr + invoice mode), AM/EN locales complete | Pilot recruitment: 3–5 design partners (one ride-hailing/delivery, one MFI or fintech, one BPO) alongside internal Olink/DAPS desks; Telecloud hosting order |
| **3** | Hardening, audit logging, OM/TI/SO locales, CDR import, on-prem build, INSA readiness pack, load/perf on low bandwidth | Dogfood as the live Onekof support desk; linguist review; pricing validation with pilots; launch alongside Onekof PM |

**Launch story:** Onekof PM goes live supported *by* this product — every Onekof
customer sees it working (Telegram support bot, ticket numbers, CSAT pings) before
being sold it. DAPS/Olink's other products (Dispatch, School Bus) migrate their
support onto it in the same window, so it launches with real multi-tenant volume.

---

## 9. Risks and open items

| # | Risk / open item | Mitigation / action |
|---|---|---|
| 1 | **Which ECA license class applies** (VAS vs Call Center vs none) — directive texts not yet read in full | Pull Directives 792/2021 + 1024/2024 full text; written ECA inquiry month 1. Cost of over-complying is only 35,000 ETB/yr. |
| 2 | **Chapa recurring-billing mechanics unverified**; gateway sector under regulatory pressure (Jan 2026 freezes) | Verify with Chapa directly; build Telebirr direct as second rail from day one; invoice+manual-confirm as universal fallback. |
| 3 | **Ethio Telecom competes** (CCaaS) and controls voice/SMS/USSD infrastructure | Position as complementary system-of-record; integrate with their CCaaS rather than replacing it; the SOE-pilot mandate under 1396/2025 makes Ethio Telecom a potential *customer/partner*. |
| 4 | **Internet shutdowns** hit SaaS availability | On-prem option, SMS/voice channel redundancy, offline-tolerant console (§5.3). |
| 5 | **Birr depreciation** erodes USD-equivalent revenue; inflation pressures ETB price points | Annual repricing clause; annual-prepay incentives; SMS metering as an inflation-linked revenue line. |
| 6 | **INSA certification lead time** before bank/government deals | Reuse Onekof's P1–P6 baseline and audit playbook; start the pack in month 3, before the first regulated-buyer negotiation. |
| 7 | **Zendesk-via-FX for exporters** (Feb 2026 FX relaxations) | Accept it — exporters are not the core market; compete there on Telegram/Amharic/price, not on FX friction. |
| 8 | **Shortcode/USSD costs opaque** | Treat as enterprise add-ons priced after operator quotes; never on the v1 critical path. |
| 9 | Fact-freshness: several figures (CCaaS pricing 2022; salary data mixed-vintage; aggregator prices) predate 2026 tariff rises | Re-quote during month-1 vendor conversations; do not print pricing collateral from this document alone. |

---

## 10. Verification needed before committing (summary)

1. Full text of ECA Directives 792/2021 and 1024/2024 → which class license, exact fees, numbering/shortcode charges.
2. Chapa subscription/recurring API mechanics + current fee schedule; post-freeze status of ArifPay/SantimPay et al.
3. Telebirr merchant API terms (fee %, settlement) — negotiated, not public.
4. 2026 A2P SMS rate cards (Ethio Telecom, Safaricom, AfroMessage) and shortcode acquisition quotes.
5. Whether INSA vendor certification is mandatory for SaaS serving banks or buyer-demanded; current MFI count (NBE annual report).
6. EEU call-center scale and the existence/ownership of any national "8000"-style citizen hotline (unverified — do not cite).

---

*Research compiled 2026-08-13 from public sources (ECA directives coverage, NBE,
DataReportal 2025, operator FY2025/26 disclosures, Shega, Addis Insight, Addis
Fortune, TechAfrica News, Freedom House FOTN 2025, and others). Where a claim
rests on secondary coverage rather than a primary document it is flagged in-line.
This document is market analysis, not legal advice.*
