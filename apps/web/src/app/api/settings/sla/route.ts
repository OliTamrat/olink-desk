// SLA settings: the per-priority targets and the shared business calendar.
// Reading is SUPERVISOR+; writing is ADMIN only — an SLA number is a promise
// the whole team is measured against, not an agent-level preference.
import { prisma, UserRole } from "@olink-desk/database";
import { defaultCalendar, ensureOrgPolicies, parseCalendar } from "@olink-desk/sla";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../../lib/session";

export const dynamic = "force-dynamic";

const MAX_MINUTES = 60 * 24 * 90; // 90 days — past this it is not an SLA

export async function GET(request: NextRequest) {
  const principal = await requireUser(request, [UserRole.SUPERVISOR, UserRole.ADMIN]);
  if (isDenied(principal)) return principal;

  const policies = await ensureOrgPolicies(prisma, principal.organization.id);
  const rows = [...policies.entries()].map(([priority, p]) => ({
    priority,
    firstResponseMinutes: p.firstResponseMinutes,
    resolveMinutes: p.resolveMinutes,
  }));
  // Every policy shares one calendar; NORMAL's copy is the one served.
  const calendar = parseCalendar(policies.get("NORMAL")?.businessHours);
  return NextResponse.json(
    { policies: rows, calendar, defaults: defaultCalendar() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: NextRequest) {
  const principal = await requireUser(request, [UserRole.ADMIN]);
  if (isDenied(principal)) return principal;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const policies = await ensureOrgPolicies(prisma, principal.organization.id);
  const changes = Array.isArray(payload.policies) ? payload.policies : [];

  for (const raw of changes) {
    const row = raw as {
      priority?: unknown;
      firstResponseMinutes?: unknown;
      resolveMinutes?: unknown;
    };
    if (typeof row.priority !== "string") continue;
    const policy = policies.get(row.priority as never);
    if (!policy) continue;
    const first = Number(row.firstResponseMinutes);
    const resolve = Number(row.resolveMinutes);
    if (!Number.isFinite(first) || !Number.isFinite(resolve)) continue;
    if (first < 1 || resolve < 1 || first > MAX_MINUTES || resolve > MAX_MINUTES) {
      return NextResponse.json(
        { error: `Targets must be between 1 minute and 90 days (${row.priority})` },
        { status: 400 },
      );
    }
    // A first response due after the resolution is not a tighter promise,
    // it is an incoherent one — refuse rather than store nonsense.
    if (first > resolve) {
      return NextResponse.json(
        { error: `First response cannot be later than resolution (${row.priority})` },
        { status: 400 },
      );
    }
    await prisma.slaPolicy.update({
      where: { id: policy.id },
      data: {
        firstResponseMinutes: Math.round(first),
        resolveMinutes: Math.round(resolve),
      },
    });
  }

  if (payload.calendar && typeof payload.calendar === "object") {
    const calendar = parseCalendar(payload.calendar);
    if (calendar.startMinute >= calendar.endMinute) {
      return NextResponse.json(
        { error: "The working day must start before it ends" },
        { status: 400 },
      );
    }
    // One calendar per tenant, written to every policy so the clock cannot
    // disagree with itself between priorities.
    await prisma.slaPolicy.updateMany({
      where: { organizationId: principal.organization.id },
      data: { businessHours: calendar as object },
    });
  }

  await prisma.auditLog.create({
    data: {
      organizationId: principal.organization.id,
      actorUserId: principal.user.id,
      action: "settings.sla_updated",
      entityType: "organization",
      entityId: String(principal.organization.id),
      metadata: {},
    },
  });
  return NextResponse.json({ ok: true });
}
