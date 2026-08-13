# The knowledge base — OKM index

Olink Desk follows the fleet OKM taxonomy from day one, so a reader who knows
Onekof, Dispatch, or School Bus opens this repo the same way.

| Where | What |
|---|---|
| `overview.md` | What Olink Desk is, the deployment tiers, who it's for |
| `architecture.md` | Domain model, multi-tenancy, channel architecture |
| `business/` | Founding market analysis, pricing, GTM material |
| `decisions/` | ADRs — append-only, superseded never edited |
| `runbooks/` | Deploy/backup runbooks (created as they become real) |
| `integrations/` | Per-integration pages: Telegram, SMS aggregators, Chapa/Telebirr, CDR (created as built) |

## Rules

1. One source per fact — pages link to the file that owns a value; if a pointer
   and its target disagree, the target wins.
2. Decisions are append-only ADRs; a session that decides something real ends
   by appending one.
3. The operational briefing is `PROJECT_BRIEFING.md` at the repo root; standing
   rules are `PROJECT_GUIDELINES.md`. Durable knowledge graduates here.
