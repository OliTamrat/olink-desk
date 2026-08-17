// The workspace's own identity: what it is called, where it is, and which
// languages it staffs.
//
// Every one of these columns has existed since the first migration and none of
// them had a screen. A workspace could not be renamed after registration, its
// time zone was whatever the default said whatever country it was in, and the
// language set that decides what a customer is answered in was unreachable.
//
// Reads are open to any signed-in member — an agent needs to know which
// languages the desk serves. Writes are ADMIN only: the default language
// decides what a customer is answered in when nothing else says, which is not
// a preference an individual should be able to change for everybody.
import { prisma, UserRole } from "@olink-desk/database";
import { cleanWorkspaceProfile } from "@olink-desk/i18n";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const principal = await requireUser(request);
  if (isDenied(principal)) return principal;
  const { organization } = principal;
  return NextResponse.json(
    {
      name: organization.name,
      slug: organization.slug,
      timezone: organization.timezone,
      languages: organization.languages,
      defaultLanguage: organization.defaultLanguage,
      // The slug is deliberately NOT editable. It is in the widget embed
      // snippet on a customer's website and in every channel webhook URL a
      // gateway has been pointed at; changing it silently breaks all of them.
      canRename: principal.user.role === UserRole.ADMIN,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: NextRequest) {
  const principal = await requireUser(request, [UserRole.ADMIN]);
  if (isDenied(principal)) return principal;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = cleanWorkspaceProfile(payload);
  if (!result.ok || !result.profile) {
    // The error is an i18n KEY, not a sentence: this is the one settings
    // screen an admin may well be reading in Amharic.
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const organization = await prisma.organization.update({
    where: { id: principal.organization.id },
    data: {
      name: result.profile.name,
      timezone: result.profile.timezone,
      languages: result.profile.languages,
      defaultLanguage: result.profile.defaultLanguage,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: organization.id,
      actorUserId: principal.user.id,
      action: "workspace.updated",
      entityType: "organization",
      entityId: String(organization.id),
      metadata: {
        timezone: organization.timezone,
        languages: organization.languages,
        defaultLanguage: organization.defaultLanguage,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    name: organization.name,
    timezone: organization.timezone,
    languages: organization.languages,
    defaultLanguage: organization.defaultLanguage,
  });
}
