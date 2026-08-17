// The workspace's data-lifecycle policy: how long this desk keeps what it is
// told, and how long it keeps the record of having kept it.
//
// Reads are open to any signed-in member — an agent looking at a closed
// ticket is entitled to know it will be erased, and a policy nobody can see
// surprises somebody the first time it runs. Writes are ADMIN only: this is
// the one setting in the product whose effect cannot be undone by changing it
// back.
import { prisma, UserRole } from "@olink-desk/database";
import {
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  policyProblems,
  RETENTION_PRESETS,
} from "@olink-desk/retention";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const principal = await requireUser(request);
  if (isDenied(principal)) return principal;
  const { organization } = principal;

  return NextResponse.json(
    {
      ticketRetentionDays: organization.ticketRetentionDays,
      auditRetentionDays: organization.auditRetentionDays,
      canEdit: principal.user.role === UserRole.ADMIN,
      // The bounds travel with the values so the form can label its own
      // limits without a second source of truth to drift from.
      minDays: MIN_RETENTION_DAYS,
      maxDays: MAX_RETENTION_DAYS,
      presets: RETENTION_PRESETS,
      // Whether anything will actually happen. A window set on a deployment
      // with no scheduler is a promise to a customer that nothing keeps, and
      // the screen should be able to say so rather than implying otherwise.
      scheduled: Boolean(process.env.CRON_SECRET),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** `null`, a whole number, or `undefined` when the field was not sent. */
function readWindow(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (value === undefined || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
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

  const ticket = readWindow(payload.ticketRetentionDays);
  const audit = readWindow(payload.auditRetentionDays);

  // Validated as the pair they will BE, not as the pair that was sent. A
  // request that only shortens the audit window has to be checked against the
  // content window already stored, or the ordering rule is enforceable only
  // when both arrive together — which is exactly when nobody gets it wrong.
  const proposed = {
    ticketRetentionDays:
      ticket === undefined ? principal.organization.ticketRetentionDays : ticket,
    auditRetentionDays:
      audit === undefined ? principal.organization.auditRetentionDays : audit,
  };

  const problems = policyProblems(proposed);
  if (problems.length > 0) {
    // Machine-readable reasons, not sentences — this screen is read in six
    // languages and the words live in the i18n table.
    return NextResponse.json({ error: "invalid_policy", problems }, { status: 400 });
  }

  const organization = await prisma.organization.update({
    where: { id: principal.organization.id },
    data: proposed,
  });

  await prisma.auditLog.create({
    data: {
      organizationId: organization.id,
      actorUserId: principal.user.id,
      action: "retention.updated",
      entityType: "organization",
      entityId: String(organization.id),
      // Both the old and the new value. "Someone set it to 90 days" does not
      // answer the question an auditor actually asks, which is what it was
      // before and therefore what got destroyed as a result.
      metadata: {
        from: {
          ticketRetentionDays: principal.organization.ticketRetentionDays,
          auditRetentionDays: principal.organization.auditRetentionDays,
        },
        to: proposed,
      },
    },
  });

  return NextResponse.json({ ok: true, ...proposed });
}
