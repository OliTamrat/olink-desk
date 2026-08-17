// Files and voice notes on a ticket.
//
// Two rules run through everything below, and both are about the request being
// hostile rather than merely wrong:
//
//  1. **The organization comes from the SESSION, never the URL.** A ticket id
//     is a uuid somebody can paste, so every query filters on the signed-in
//     user's org and a cross-tenant id gets a 404 rather than a file.
//  2. **Nothing the browser declares about a file is believed.** The type is
//     sniffed from the bytes, the size is measured from the bytes, and the
//     filename is stripped of anything that could be a path or break a header.
import { prisma } from "@olink-desk/database";
import {
  cleanAttachment,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from "@olink-desk/tickets";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

/** The list for one ticket. Metadata only — the bytes are a separate fetch. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const principal = await requireUser(req);
  if (isDenied(principal)) return principal;
  const orgId = principal.organization.id;

  const ticket = await prisma.ticket.findFirst({
    where: { id: params.id, organizationId: orgId },
    select: { id: true },
  });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await prisma.attachment.findMany({
    where: { organizationId: orgId, ticketId: ticket.id },
    orderBy: { createdAt: "asc" },
    // `data` is deliberately absent: listing ten attachments must not pull ten
    // files' worth of bytes through Postgres, the app and the wire to render a
    // row of filenames.
    select: {
      id: true,
      filename: true,
      contentType: true,
      byteSize: true,
      kind: true,
      durationSeconds: true,
      // So the list can show a tombstone rather than a nameless zero-byte row.
      redactedAt: true,
      createdAt: true,
      messageId: true,
      uploadedByUser: { select: { name: true } },
    },
  });

  return NextResponse.json({
    attachments: rows.map((a) => ({
      id: a.id,
      filename: a.filename,
      contentType: a.contentType,
      byteSize: a.byteSize,
      kind: a.kind,
      durationSeconds: a.durationSeconds,
      redactedAt: a.redactedAt,
      createdAt: a.createdAt,
      messageId: a.messageId,
      uploadedBy: a.uploadedByUser?.name ?? null,
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const principal = await requireUser(req);
  if (isDenied(principal)) return principal;
  const orgId = principal.organization.id;

  const ticket = await prisma.ticket.findFirst({
    where: { id: params.id, organizationId: orgId },
    select: { id: true },
  });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // multipart, so a file never has to be base64'd through JSON — that costs a
  // third of the payload and turns a 10 MB cap into an inconsistent one.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file upload" }, { status: 400 });
  }

  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No file was sent" }, { status: 400 });
  }
  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return NextResponse.json(
      { error: `At most ${MAX_ATTACHMENTS_PER_MESSAGE} files at a time` },
      { status: 400 },
    );
  }

  const kindRaw = form.get("kind");
  const kind = kindRaw === "VOICE" ? "VOICE" : "FILE";
  const durationRaw = form.get("durationSeconds");
  const durationSeconds = typeof durationRaw === "string" ? Number(durationRaw) : undefined;

  const messageIdRaw = form.get("messageId");
  let messageId: string | null = null;
  if (typeof messageIdRaw === "string" && messageIdRaw) {
    // Scoped like everything else: a message id from another workspace must
    // not become the parent of a file in this one.
    const msg = await prisma.ticketMessage.findFirst({
      where: { id: messageIdRaw, organizationId: orgId, ticketId: ticket.id },
      select: { id: true },
    });
    if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
    messageId = msg.id;
  }

  const created = [];
  for (const file of files) {
    // The cheap check first, on the declared size, so a huge upload is
    // rejected before it is read into memory. It is not TRUSTED — the real
    // check is on the bytes below — it just avoids buffering 2 GB to find out.
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json(
        { error: `Files can be at most ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB` },
        { status: 413 },
      );
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const clean = cleanAttachment({ filename: file.name, bytes, kind, durationSeconds });
    if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 });

    const row = await prisma.attachment.create({
      data: {
        organizationId: orgId,
        ticketId: ticket.id,
        messageId,
        filename: clean.value.filename,
        contentType: clean.value.contentType,
        byteSize: clean.value.byteSize,
        kind: clean.value.kind,
        durationSeconds: clean.value.durationSeconds,
        data: Buffer.from(bytes),
        uploadedByUserId: principal.user.id,
      },
      select: {
        id: true,
        filename: true,
        contentType: true,
        byteSize: true,
        kind: true,
        durationSeconds: true,
        createdAt: true,
      },
    });
    created.push(row);
  }

  await prisma.auditLog.create({
    data: {
      organizationId: orgId,
      actorUserId: principal.user.id,
      action: "attachment.upload",
      entityType: "ticket",
      // TEXT column — always the string form.
      entityId: String(ticket.id),
      metadata: { count: created.length, kind },
    },
  });

  return NextResponse.json({ attachments: created }, { status: 201 });
}
