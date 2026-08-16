// The setup checklist.
//
// Every step is DERIVED from real workspace data — there is no "mark as
// done" anywhere in this file. That is the whole design. A checklist with
// tickable boxes drifts the moment somebody ticks a box for a thing they
// meant to do, and then the product is telling an admin their desk is
// configured when it is not. Deriving costs one query per step and cannot
// lie.
//
// The one thing that IS a stated preference is dismissal — a solo operator
// who will never invite a teammate should be able to put the card away —
// and that is stored explicitly rather than inferred.
import { prisma, UserRole } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../lib/session";

export const dynamic = "force-dynamic";

export interface OnboardingStep {
  key: string;
  done: boolean;
  href: string;
}

export async function GET(request: NextRequest) {
  const principal = await requireUser(request, [
    UserRole.AGENT,
    UserRole.SUPERVISOR,
    UserRole.ADMIN,
    UserRole.AUDITOR,
  ]);
  if (isDenied(principal)) return principal;

  const organizationId = principal.organization.id;

  const [channels, tickets, teammates, slaTouched, ownMacro] = await Promise.all([
    // A connected channel means real credentials exist. The web widget is
    // always available and needs nothing connected, so it deliberately does
    // NOT satisfy this step — otherwise every workspace would start with it
    // already ticked and learn nothing.
    prisma.channelAccount.count({ where: { organizationId } }),
    prisma.ticket.count({ where: { organizationId } }),
    prisma.user.count({ where: { organizationId } }),
    // "Reviewed your hours" cannot be observed from the calendar itself: the
    // seeded default is a legitimate choice, so a workspace that agrees with
    // it looks identical to one that never looked. The audit row is the only
    // evidence that somebody actually opened it and decided.
    prisma.auditLog.count({
      where: { organizationId, action: "settings.sla_updated" },
    }),
    // A macro the TEAM wrote, not one of the three seeded starters — those
    // arrive with the workspace and would tick this step on day zero.
    prisma.macro.count({ where: { organizationId, createdById: { not: null } } }),
  ]);

  const steps: OnboardingStep[] = [
    { key: "connect_channel", done: channels > 0, href: "/channels" },
    { key: "first_ticket", done: tickets > 0, href: "/inbox" },
    { key: "invite_team", done: teammates > 1, href: "/settings" },
    { key: "set_hours", done: slaTouched > 0, href: "/settings" },
    { key: "write_macro", done: ownMacro > 0, href: "/macros" },
  ];

  return NextResponse.json(
    {
      steps,
      complete: steps.every((s) => s.done),
      dismissed: principal.organization.onboardingDismissedAt !== null,
      // Only an admin can put the card away for everyone; an agent seeing it
      // is being shown what their workspace still needs, not given a setting.
      canDismiss: principal.user.role === UserRole.ADMIN,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const principal = await requireUser(request, [UserRole.ADMIN]);
  if (isDenied(principal)) return principal;

  await prisma.organization.update({
    where: { id: principal.organization.id },
    data: { onboardingDismissedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: {
      organizationId: principal.organization.id,
      actorUserId: principal.user.id,
      action: "onboarding.dismissed",
      entityType: "organization",
      entityId: String(principal.organization.id),
      metadata: {},
    },
  });
  return NextResponse.json({ ok: true });
}
