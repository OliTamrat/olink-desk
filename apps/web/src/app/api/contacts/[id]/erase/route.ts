// Right to erasure, for one person, on request.
//
// Proclamation 1321/2024 gives a data subject the right to have their
// personal data deleted. This is that right made operable: an administrator
// takes the request, confirms it, and the desk stops holding anything that
// identifies the person — across every ticket, every message they wrote, and
// every file they sent, on every channel.
//
// What survives is deliberate and is documented on the schema: the contact
// row becomes a bare counter so last quarter's volume, SLA and satisfaction
// figures do not silently change, and the audit row recording the erasure
// outlives the content it describes.
import { prisma, UserRole } from "@olink-desk/database";
import {
  alreadyErased,
  erasedContact,
  redactedAttachment,
  redactedMessage,
} from "@olink-desk/retention";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

/**
 * Admin only, and not merely by convention.
 *
 * An agent can already read everything this touches, so the restriction is
 * not about secrecy — it is that erasure is irreversible and arrives as a
 * legal request to the organisation, not as a step in handling a ticket. A
 * supervisor clearing their queue must not be able to do this by accident.
 */
const ERASERS: UserRole[] = [UserRole.ADMIN];

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const principal = await requireUser(request, ERASERS);
  if (isDenied(principal)) return principal;
  const organizationId = principal.organization.id;

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, organizationId },
    select: { id: true, erasedAt: true },
  });
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Idempotent rather than an error. A double-submitted confirmation, or a
  // request that arrives twice through different staff, must not read as a
  // failure — the person is already forgotten, which is what was asked for.
  if (alreadyErased(contact)) {
    return NextResponse.json(
      { ok: true, alreadyErased: true, erasedAt: contact.erasedAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const now = new Date();
  const stripped = redactedAttachment(now);

  const [messages, attachments] = await prisma.$transaction([
    // Everything this person wrote, wherever it landed. Keyed on contactId
    // rather than on their tickets: a message they sent on a conversation
    // that was later attached to somebody else's ticket is still theirs.
    prisma.ticketMessage.updateMany({
      where: { organizationId, contactId: contact.id, redactedAt: null },
      data: redactedMessage(now),
    }),
    prisma.attachment.updateMany({
      where: { organizationId, contactId: contact.id, redactedAt: null },
      data: {
        data: Buffer.from(stripped.data),
        filename: stripped.filename,
        redactedAt: stripped.redactedAt,
      },
    }),
    prisma.contact.update({
      where: { id: contact.id },
      data: erasedContact(now),
    }),
    // The conversation rows carry the channel-side identity — a Telegram chat
    // id, a widget session id. Each is a durable handle on the same person
    // and has to go with the rest, or the desk still knows how to find them.
    prisma.conversation.updateMany({
      where: { organizationId, contactId: contact.id },
      data: { contactId: null },
    }),
  ]);

  // Written AFTER the transaction commits, and outside it: an audit row for
  // an erasure that rolled back would be a record of something that did not
  // happen, which is worse than a missing record of something that did.
  await prisma.auditLog.create({
    data: {
      organizationId,
      actorUserId: principal.user.id,
      action: "contact.erase",
      entityType: "Contact",
      // TEXT by fleet convention — String(uuid), never a raw UUID.
      entityId: String(contact.id),
      // Counts, never content. The point of the row is that it can outlive
      // the data it describes without becoming a copy of it.
      metadata: {
        messagesRedacted: messages.count,
        attachmentsRedacted: attachments.count,
      },
    },
  });

  return NextResponse.json(
    {
      ok: true,
      erasedAt: now,
      messagesRedacted: messages.count,
      attachmentsRedacted: attachments.count,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
