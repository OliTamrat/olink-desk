// The retention pass.
//
// Every other scheduled job in this product is recoverable: an escalation
// missed at 2am can be raised at 3am. This one destroys data permanently, so
// it is written to be boring — it does the smallest thing that satisfies the
// window, it never touches a tenant that has not asked for it, and it reports
// exactly what it removed.
//
// It is deliberately NOT in any read path. A tenant with no window set is
// untouched; a cron that stops running degrades the product to "content is
// kept longer than promised", which is a compliance conversation, never to
// "the numbers are wrong".
import { prisma } from "@olink-desk/database";
import {
  cutoff,
  redactedAttachment,
  redactedMessage,
} from "@olink-desk/retention";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * How many tickets one pass will process per tenant.
 *
 * A bound rather than "everything", because the first pass after an
 * administrator sets a window has years of backlog behind it and would
 * otherwise hold a transaction open across the tenant's whole history. The
 * pass is idempotent and scheduled, so a backlog drains over successive runs
 * — and `remaining` in the response says so rather than letting a partial
 * pass look complete.
 */
const TICKETS_PER_PASS = 500;

/** Same bound for the audit purge, which is a single delete per tenant. */
const AUDIT_ROWS_PER_PASS = 5000;

/** Fail-closed shared-secret check (fleet pattern — see the escalation pass). */
function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET ?? "";
  const given = request.headers.get("x-cron-secret") ?? "";
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface TenantResult {
  organizationId: string;
  ticketsProcessed: number;
  ticketsRemaining: number;
  messagesRedacted: number;
  attachmentsRedacted: number;
  auditRowsDeleted: number;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();

  // Only tenants that asked. The OR is what keeps this true: a tenant with an
  // audit window and no content window still gets its audit purged, and a
  // tenant with neither is never read at all.
  const organizations = await prisma.organization.findMany({
    where: {
      OR: [
        { ticketRetentionDays: { not: null } },
        { auditRetentionDays: { not: null } },
      ],
    },
    select: {
      id: true,
      ticketRetentionDays: true,
      auditRetentionDays: true,
    },
  });

  const results: TenantResult[] = [];

  for (const org of organizations) {
    const result: TenantResult = {
      organizationId: org.id,
      ticketsProcessed: 0,
      ticketsRemaining: 0,
      messagesRedacted: 0,
      attachmentsRedacted: 0,
      auditRowsDeleted: 0,
    };

    const contentBefore = cutoff(org.ticketRetentionDays, now);
    if (contentBefore) {
      // Eligibility is `closedAt`, never `createdAt` — an old ticket that is
      // still open is still being worked on. See packages/retention.
      const where = {
        organizationId: org.id,
        closedAt: { lt: contentBefore },
        // "Has something left to redact", not "has an unredacted message".
        // The narrower form skips a ticket whose only content is a file — a
        // scanned form or a voicemail, which is exactly the content a
        // retention window is most obviously about — and skips it silently,
        // forever, because nothing would ever bring it back into scope.
        OR: [
          { messages: { some: { redactedAt: null } } },
          { attachments: { some: { redactedAt: null } } },
        ],
      };

      const eligible = await prisma.ticket.findMany({
        where,
        select: { id: true },
        orderBy: { closedAt: "asc" },
        take: TICKETS_PER_PASS,
      });
      const ids = eligible.map((t) => t.id);
      result.ticketsProcessed = ids.length;

      if (ids.length > 0) {
        const messages = await prisma.ticketMessage.updateMany({
          where: { organizationId: org.id, ticketId: { in: ids }, redactedAt: null },
          data: redactedMessage(now),
        });
        result.messagesRedacted = messages.count;

        const stripped = redactedAttachment(now);
        const attachments = await prisma.attachment.updateMany({
          where: { organizationId: org.id, ticketId: { in: ids }, redactedAt: null },
          data: {
            data: Buffer.from(stripped.data),
            filename: stripped.filename,
            redactedAt: stripped.redactedAt,
          },
        });
        result.attachmentsRedacted = attachments.count;

        // A count, not a boolean: "3,200 still to go" is the difference
        // between a pass that is working through a backlog and one that is
        // silently doing nothing.
        result.ticketsRemaining = await prisma.ticket.count({ where });
      }
    }

    const auditBefore = cutoff(org.auditRetentionDays, now);
    if (auditBefore) {
      // Audit rows are the one thing genuinely deleted rather than emptied.
      // There is nothing left in the row once its actor, action and entity go
      // — an audit row IS its content.
      const doomed = await prisma.auditLog.findMany({
        where: { organizationId: org.id, createdAt: { lt: auditBefore } },
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: AUDIT_ROWS_PER_PASS,
      });
      if (doomed.length > 0) {
        const deleted = await prisma.auditLog.deleteMany({
          where: { id: { in: doomed.map((row) => row.id) } },
        });
        result.auditRowsDeleted = deleted.count;
      }
    }

    // Only report a tenant something happened to. A nightly response listing
    // every quiet tenant buries the one that is actually deleting.
    if (
      result.ticketsProcessed > 0 ||
      result.auditRowsDeleted > 0 ||
      result.ticketsRemaining > 0
    ) {
      results.push(result);
    }
  }

  return NextResponse.json(
    {
      ok: true,
      scannedOrganizations: organizations.length,
      tenants: results,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
