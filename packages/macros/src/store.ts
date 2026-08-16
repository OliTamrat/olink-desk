// Database side of macros. Everything here filters by organizationId, and
// the seeding is race-safe for the same reason SLA policies are: two agents
// opening the console at the same moment on a fresh workspace both find zero
// macros and both try to create them.

import type { PrismaClient } from "@olink-desk/database";

import { STARTER_MACROS } from "./starters";

/**
 * Make sure a workspace has its starter macros, once, ever.
 *
 * Guarded on the workspace having NO macros at all rather than on each
 * starter being present. That difference is the whole design: an admin who
 * deletes "Ask for more detail" because it does not suit their desk must not
 * find it resurrected on the next page load. Per-row upserting would do
 * exactly that, and it is the kind of bug that reads as the product
 * overriding a deliberate decision.
 *
 * `skipDuplicates` covers the concurrent-first-load race — Prisma's upsert
 * still raises P2002 under real concurrency, which is how the same bug was
 * found in the SLA seeder.
 */
export async function ensureStarterMacros(
  db: PrismaClient,
  organizationId: string,
): Promise<void> {
  const existing = await db.macro.count({ where: { organizationId } });
  if (existing > 0) return;
  await db.macro.createMany({
    data: STARTER_MACROS.map((m) => ({
      organizationId,
      title: m.title,
      category: m.category,
      bodies: m.bodies as object,
      setStatus: m.setStatus,
    })),
    skipDuplicates: true,
  });
}

/**
 * Record that a macro was used. Deliberately fire-and-forget at the call
 * site: a failed counter must never fail the reply the agent actually cares
 * about. The count is what tells an admin which macros earn their place and
 * which are dead weight — the same "what should we write next" signal Bank
 * Assist's content gaps give a bank.
 */
export async function recordMacroUse(
  db: PrismaClient,
  organizationId: string,
  macroId: string,
): Promise<void> {
  await db.macro.updateMany({
    where: { id: macroId, organizationId },
    data: { usageCount: { increment: 1 } },
  });
}
