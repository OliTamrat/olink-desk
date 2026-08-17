// Serving an attachment's bytes back.
//
// This is the dangerous direction. Uploading a hostile file only stores it;
// handing it back is where it can execute. Three things keep that shut, and
// none of them is optional:
//
//  1. **The type served is the SNIFFED one**, stored at upload. The browser's
//     claim never reaches a response header, so an HTML page cannot arrive
//     labelled `image/png` and be served back as something a browser runs.
//  2. **`X-Content-Type-Options: nosniff`**, so the browser does not re-guess
//     and undo point 1.
//  3. **Only images and audio are ever `inline`.** Everything else is
//     `attachment`, which downloads rather than renders — the difference
//     between a PDF viewer and arbitrary script in this app's origin.
import { prisma } from "@olink-desk/database";
import { isAudio, isInlineRenderable } from "@olink-desk/tickets";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const principal = await requireUser(req);
  if (isDenied(principal)) return principal;

  // Scoped to the session's organization. An attachment id is a uuid in a URL
  // — the only thing standing between one workspace's files and another's is
  // this `where`.
  const row = await prisma.attachment.findFirst({
    where: { id: params.id, organizationId: principal.organization.id },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // An erased attachment is 410, not a zero-byte download. The row survives so
  // the ticket still records that a file was here; the bytes are gone. Serving
  // an empty file instead would land as a corrupt image on the agent's disk
  // and read as a bug in the upload rather than as a policy that ran.
  if (row.redactedAt) {
    return NextResponse.json(
      { error: "redacted", redactedAt: row.redactedAt },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
  }

  const inline = isInlineRenderable(row.contentType) || isAudio(row.contentType);

  // The filename goes in twice: ASCII-stripped for old clients, and
  // percent-encoded UTF-8 for everything else, so an Amharic filename
  // survives instead of arriving as question marks.
  const ascii = row.filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  const disposition =
    `${inline ? "inline" : "attachment"}; filename="${ascii}"; ` +
    `filename*=UTF-8''${encodeURIComponent(row.filename)}`;

  return new NextResponse(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.contentType,
      "Content-Length": String(row.byteSize),
      "Content-Disposition": disposition,
      "X-Content-Type-Options": "nosniff",
      // A file is immutable once stored — its id never points at different
      // bytes — but it is also private, so the cache must be the browser's
      // own and never a shared one.
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const principal = await requireUser(req);
  if (isDenied(principal)) return principal;

  const row = await prisma.attachment.findFirst({
    where: { id: params.id, organizationId: principal.organization.id },
    select: { id: true, ticketId: true, filename: true },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.attachment.delete({ where: { id: row.id } });
  await prisma.auditLog.create({
    data: {
      organizationId: principal.organization.id,
      actorUserId: principal.user.id,
      action: "attachment.delete",
      entityType: "ticket",
      entityId: String(row.ticketId),
      // The event, never the bytes. The filename is kept because an operator
      // asking "who removed the receipt" needs to know which file went.
      metadata: { filename: row.filename },
    },
  });

  return NextResponse.json({ ok: true });
}
