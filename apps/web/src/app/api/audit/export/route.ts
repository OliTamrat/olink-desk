// The audit log, as a file somebody can hand to an auditor.
//
// The log has been written since the first ticket; until now the only way to
// read it was a database session, which means in practice nobody read it. An
// audit trail nobody can obtain is not a control — it is a claim.
import { prisma, UserRole } from "@olink-desk/database";
import { csvFile, exportFilename } from "@olink-desk/retention";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../../lib/session";

export const dynamic = "force-dynamic";

/**
 * Admin and Auditor — the role that exists for exactly this and can do
 * nothing else. A supervisor is excluded on purpose: the log records what
 * supervisors did, and the subject of a control should not be the one who
 * decides what the control shows.
 */
const READERS: UserRole[] = [UserRole.ADMIN, UserRole.AUDITOR];

/**
 * A bound, because a tenant's audit log grows forever and a browser
 * downloading an unbounded query is how a page hangs with no explanation.
 * The window is narrowed with `from`/`to` rather than raised.
 */
const MAX_ROWS = 50_000;

export async function GET(request: NextRequest) {
  const principal = await requireUser(request, READERS);
  if (isDenied(principal)) return principal;
  const organizationId = principal.organization.id;

  const params = request.nextUrl.searchParams;
  const from = params.get("from");
  const to = params.get("to");
  // An unparseable date is ignored rather than 400'd: the caller is a date
  // input on a page, and an empty field must mean "no bound", not an error
  // the user has to decode.
  const gte = from && !Number.isNaN(Date.parse(from)) ? new Date(from) : undefined;
  const lte = to && !Number.isNaN(Date.parse(to)) ? new Date(to) : undefined;

  const rows = await prisma.auditLog.findMany({
    where: {
      organizationId,
      ...(gte || lte ? { createdAt: { ...(gte && { gte }), ...(lte && { lte }) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
    select: {
      id: true,
      createdAt: true,
      actorUserId: true,
      action: true,
      entityType: true,
      entityId: true,
      metadata: true,
    },
  });

  // Resolved in a second query rather than through a relation. `actorUserId`
  // is a plain column with no foreign key, deliberately: an audit row has to
  // survive whatever happens to the account that wrote it, and a constraint
  // would let a user row's fate reach back into the record of what they did.
  //
  // A name and an email, because an auditor reading a year-old log needs to
  // know who "a4f1…" was, and the account may since have been renamed or
  // disabled.
  const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter(Boolean))];
  const actors = await prisma.user.findMany({
    where: { organizationId, id: { in: actorIds as string[] } },
    select: { id: true, name: true, email: true },
  });
  const actorById = new Map(actors.map((u) => [u.id, u]));

  const file = csvFile(
    [
      "id",
      "timestamp",
      "actor_name",
      "actor_email",
      "actor_user_id",
      "action",
      "entity_type",
      "entity_id",
      "metadata",
    ],
    rows.map((row) => [
      // BigInt would serialise as "123n" through String(); the id is a
      // sequence number an auditor cross-references, so it has to read as one.
      row.id.toString(),
      row.createdAt,
      (row.actorUserId && actorById.get(row.actorUserId)?.name) || "",
      (row.actorUserId && actorById.get(row.actorUserId)?.email) || "",
      row.actorUserId ?? "",
      row.action,
      row.entityType,
      row.entityId,
      row.metadata === null ? "" : JSON.stringify(row.metadata),
    ]),
  );

  return new NextResponse(file, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${exportFilename(
        principal.organization.name,
        "audit",
        new Date(),
      )}"`,
    },
  });
}
