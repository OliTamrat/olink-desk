// Per-priority SLA targets — the Zendesk-standard model (ADR 0006). One
// SlaPolicy row per priority per org, created lazily with these defaults;
// every number is data, editable from Settings later without touching code.
// Channel overrides live at the policy layer when Settings lands; v1 ships
// none (deferred, recorded in the ADR).
import type { PrismaClient, SlaPolicy, TicketPriority } from "@olink-desk/database";

import { addBusinessMinutes, defaultCalendar, parseCalendar } from "./calendar";

export interface SlaTargets {
  firstResponseMinutes: number;
  resolveMinutes: number;
}

// A business day on the default calendar is 9h = 540 minutes.
export const DEFAULT_TARGETS: Record<TicketPriority, SlaTargets> = {
  URGENT: { firstResponseMinutes: 15, resolveMinutes: 240 },
  HIGH: { firstResponseMinutes: 60, resolveMinutes: 540 },
  NORMAL: { firstResponseMinutes: 240, resolveMinutes: 1620 }, // 3 business days
  LOW: { firstResponseMinutes: 540, resolveMinutes: 2700 }, // 5 business days
};

export const PRIORITY_ORDER: TicketPriority[] = ["URGENT", "HIGH", "NORMAL", "LOW"];

/**
 * The org's per-priority policies, created on first use. Lazy seeding means
 * a tenant registered before this feature existed gets policies the moment
 * its first ticket needs one — no backfill migration, no special cases.
 */
export async function ensureOrgPolicies(
  db: PrismaClient,
  organizationId: string,
): Promise<Map<TicketPriority, SlaPolicy>> {
  const existing = await db.slaPolicy.findMany({ where: { organizationId } });
  const byName = new Map(existing.map((p) => [p.name, p]));
  const out = new Map<TicketPriority, SlaPolicy>();
  for (const priority of PRIORITY_ORDER) {
    let policy = byName.get(priority);
    if (!policy) {
      policy = await db.slaPolicy
        .create({
          data: {
            organizationId,
            name: priority,
            firstResponseMinutes: DEFAULT_TARGETS[priority].firstResponseMinutes,
            resolveMinutes: DEFAULT_TARGETS[priority].resolveMinutes,
            businessHours: defaultCalendar() as object,
            isDefault: priority === "NORMAL",
          },
        })
        // Two tickets racing on a fresh org: loser re-reads the winner's row.
        .catch(async () => {
          const again = await db.slaPolicy.findFirst({
            where: { organizationId, name: priority },
          });
          if (!again) throw new Error(`SLA policy seed failed for ${priority}`);
          return again;
        });
    }
    out.set(priority, policy);
  }
  return out;
}

export interface SlaDates {
  slaPolicyId: string;
  firstResponseDueAt: Date;
  resolveDueAt: Date;
}

/** Due dates for a ticket created `at` with `priority`, on the org's policy. */
export async function slaDatesFor(
  db: PrismaClient,
  organizationId: string,
  priority: TicketPriority,
  at: Date,
): Promise<SlaDates> {
  const policies = await ensureOrgPolicies(db, organizationId);
  const policy = policies.get(priority) ?? policies.get("NORMAL")!;
  const calendar = parseCalendar(policy.businessHours);
  return {
    slaPolicyId: policy.id,
    firstResponseDueAt: addBusinessMinutes(at, policy.firstResponseMinutes, calendar),
    resolveDueAt: addBusinessMinutes(at, policy.resolveMinutes, calendar),
  };
}
