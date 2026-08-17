// The switch that lets the desk answer customers itself.
//
// Its own route rather than a field on the workspace profile, because it is a
// different kind of decision: renaming a workspace changes what staff see, and
// this changes what a CUSTOMER receives in the organisation's name. Those
// deserve separate confirmations even though both are org-level and both are
// admin-only.
//
// Reads are open to any signed-in member — an agent looking at a ticket that
// was answered without them should be able to find out why — and writes are
// ADMIN, same shape as the retention policy.
import { prisma, UserRole } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const principal = await requireUser(request);
  if (isDenied(principal)) return principal;
  const { organization } = principal;

  // How many published articles exist, per language, because the toggle on
  // its own is misleading. Turning it on with an empty knowledge base changes
  // nothing at all — retrieval finds nothing and every message falls through
  // to a person — and an administrator who is not told that concludes the
  // feature is broken rather than that they have not written anything yet.
  const published = await prisma.kbArticle.count({
    where: { organizationId: organization.id, isPublished: true },
  });
  const drafts = await prisma.kbArticle.count({
    where: { organizationId: organization.id, isPublished: false },
  });

  // How often it has actually answered. A switch with no readout is a switch
  // somebody flips and then cannot evaluate.
  const answered = await prisma.ticketMessage.count({
    where: { organizationId: organization.id, autoAnswered: true },
  });

  return NextResponse.json(
    {
      enabled: organization.autoAnswerEnabled,
      canEdit: principal.user.role === UserRole.ADMIN,
      publishedArticles: published,
      draftArticles: drafts,
      answeredCount: answered,
      // Whether the model is reachable at all. Without this the screen cannot
      // distinguish "you have not turned it on" from "it is on and the model
      // is unconfigured", which look identical from the customer's side.
      modelReady: Boolean(process.env.GOOGLE_CLOUD_PROJECT),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: NextRequest) {
  const principal = await requireUser(request, [UserRole.ADMIN]);
  if (isDenied(principal)) return principal;

  let payload: { enabled?: unknown };
  try {
    payload = (await request.json()) as { enabled?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof payload.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  }

  const organization = await prisma.organization.update({
    where: { id: principal.organization.id },
    data: { autoAnswerEnabled: payload.enabled },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: organization.id,
      actorUserId: principal.user.id,
      action: payload.enabled ? "auto_answer.enabled" : "auto_answer.disabled",
      entityType: "organization",
      entityId: String(organization.id),
      // Who turned it on and when is the question asked after the first
      // customer complains about something the desk said by itself.
      metadata: { enabled: payload.enabled },
    },
  });

  return NextResponse.json({ ok: true, enabled: organization.autoAnswerEnabled });
}
