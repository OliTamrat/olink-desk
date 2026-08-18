// The second step of signing in: prove a code, and the half-finished session
// becomes a real one.
//
// This is the ONLY route that may act on a pending session, and it does so
// through `pendingMfaUser` rather than `requireUser` — which by construction
// cannot resolve one. Adding a second route that reads a pending session would
// be adding a second door.
import { completeChallenge } from "@olink-desk/auth";
import { signSession } from "@olink-desk/auth";
import { prisma } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { pendingMfaUser, sessionCookie } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const pending = await pendingMfaUser(request);
  if (!pending) {
    // Covers an expired five-minute window, a tampered cookie, and somebody
    // arriving here without having given a password at all. The client's job
    // is to send them back to the start; distinguishing the cases would only
    // tell an attacker which half they got right.
    return NextResponse.json({ error: "no_pending_login" }, { status: 401 });
  }

  let code = "";
  try {
    const payload = (await request.json()) as { code?: unknown };
    code = typeof payload.code === "string" ? payload.code : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await completeChallenge(prisma, pending.user, code, {
    nowMs: Date.now(),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  const organization = await prisma.organization.findUnique({
    where: { id: pending.user.organizationId },
  });
  if (!organization) {
    return NextResponse.json({ error: "no_pending_login" }, { status: 401 });
  }

  // A NEW token without the pending claim, and with the full lifetime. The
  // pending one is not "upgraded" — it is replaced, so a copy of it taken
  // mid-login never becomes a signed-in session.
  const token = await signSession({
    userId: pending.user.id,
    organizationId: organization.id,
    role: pending.user.role,
  });

  await prisma.auditLog.create({
    data: {
      organizationId: organization.id,
      actorUserId: pending.user.id,
      action: result.usedRecoveryCode ? "mfa.recovery_used" : "mfa.verified",
      entityType: "user",
      entityId: String(pending.user.id),
      // How many are left is the thing worth alerting on: somebody working
      // through a paper list is somebody who has lost their phone.
      metadata: result.usedRecoveryCode
        ? { recoveryCodesLeft: result.recoveryCodesLeft }
        : {},
    },
  });

  const response = NextResponse.json({
    ok: true,
    usedRecoveryCode: result.usedRecoveryCode,
    recoveryCodesLeft: result.recoveryCodesLeft,
    user: { name: pending.user.name, role: pending.user.role },
    organization: { slug: organization.slug, name: organization.name },
  });
  response.cookies.set(sessionCookie(token));
  return response;
}
