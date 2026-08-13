# Olink Desk — overview

**Olink Desk is a multi-tenant support desk for Ethiopian organizations:**
omnichannel ticketing (Telegram bot, phone call logging, SMS, web, email,
walk-in), call tracking with dispositions and callback queues, and a task
engine with SLAs and escalation. It is the system of record for customer
interactions — it never carries voice traffic.

**Who it's for:** fintech/banks/MFIs, ride-hailing and delivery, BPO call
centers, government service desks and SOEs, utilities — and, from day one, the
Olink/DAPS products' own support desks (Onekof PM launch support is the first
live tenant).

**Deployment tiers** (fleet convention, most→least sovereign):

| Tier | Where | For |
|---|---|---|
| 1 | Ethio Telecom ECS / Telecloud | Default for Ethiopian tenants — satisfies Proclamation 1321/2024 Art. 22 residency |
| 2 | On-premise (single Docker image, LAN-capable) | Government, regional, shutdown-sensitive customers |
| 3 | EU cloud | Non-Ethiopian tenants only |

**Languages:** English, Amharic, Afaan Oromo, Tigrinya, Somali. Ge'ez script
via Abyssinica SIL. Ethiopian calendar and July-start fiscal year in SLAs and
reporting.

**Billing:** ETB, push-payment (Chapa primary, Telebirr fallback, proforma
invoice for enterprise). Annual prepay = 2 months free. No card-on-file —
Ethiopia has no such rail.

The full market case, competitive landscape, pricing rationale, and regulatory
map live in `business/ETHIOPIA_SUPPORT_CALL_TRACKING_MARKET_ANALYSIS.md`.
