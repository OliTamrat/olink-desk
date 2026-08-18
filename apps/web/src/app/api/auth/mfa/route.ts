// Your own second factor: see it, turn it on, turn it off, replace the codes.
//
// **Personal settings carry NO role permission.** This is your own account, so
// every signed-in member reaches it — an agent who cannot turn on their own
// two-factor is an agent whose account stays weaker than the product allows,
// and the reason would be a permission check that had nothing to do with them.
// Tenancy still applies, via the session, as everywhere else.
import {
  beginEnrolment,
  confirmEnrolment,
  disableMfa,
  mfaState,
  regenerateRecoveryCodes,
  verifyPassword,
} from "@olink-desk/auth";
import { prisma } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";

import { isDenied, requireUser } from "../../../../lib/session";

export const dynamic = "force-dynamic";

/**
 * The provisioning URI as an inline SVG.
 *
 * Markup rather than a URL because an authenticated image endpoint for a
 * credential is a second thing to get wrong: it would need the same session
 * check, the same rate limit, and a `Cache-Control` nobody would remember to
 * set. Inline, it inherits this response's protections exactly and never
 * touches disk or a cache.
 *
 * Dark modules on a WHITE plate, never on the panel's own dark surface.
 * Inverted QR codes are out of spec — the finder patterns are defined as
 * dark-on-light — and while some phones cope, "some phones" is not a property
 * to ship on the screen that turns on two-factor. The 4-module quiet zone is
 * what lets a camera find the symbol at all, so it is set rather than left to
 * a default that might change.
 */
async function qrSvg(uri: string): Promise<string> {
  return QRCode.toString(uri, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 4,
    // Photographing a screen is far harder than decoding a clean bitmap —
    // glare, moiré against the pixel grid, focus, angle. A generous intrinsic
    // size keeps every module boundary on a whole pixel; the stylesheet must
    // not force it smaller.
    width: 264,
    color: { dark: "#0b1220", light: "#ffffff" },
  });
}

export async function GET(request: NextRequest) {
  const principal = await requireUser(request);
  if (isDenied(principal)) return principal;
  const { user } = principal;
  return NextResponse.json(
    {
      state: mfaState(user),
      verifiedAt: user.mfaVerifiedAt,
      recoveryCodesLeft: user.mfaVerifiedAt
        ? await prisma.mfaRecoveryCode.count({ where: { userId: user.id } })
        : 0,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Start enrolment: mint a secret and return the QR. Grants nothing on its
 *  own — the factor is off until a code is proved. */
export async function POST(request: NextRequest) {
  const principal = await requireUser(request);
  if (isDenied(principal)) return principal;

  const started = await beginEnrolment(prisma, principal.user, {
    // What the authenticator app files the entry under. The workspace name
    // rather than the product's, because somebody who supports two tenants
    // needs to tell their two entries apart.
    issuer: principal.organization.name,
  });
  if (!started.ok) {
    return NextResponse.json({ error: started.error }, { status: 409 });
  }
  return NextResponse.json(
    {
      // The secret in text as well, because a QR is unusable to somebody on
      // the same device as their authenticator, or using a screen reader.
      secret: started.secret,
      uri: started.uri,
      qr: await qrSvg(started.uri),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Prove the first code. Returns the recovery codes ONCE. */
export async function PUT(request: NextRequest) {
  const principal = await requireUser(request);
  if (isDenied(principal)) return principal;

  let code = "";
  try {
    const payload = (await request.json()) as { code?: unknown };
    code = typeof payload.code === "string" ? payload.code : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await confirmEnrolment(prisma, principal.user, code, {
    nowMs: Date.now(),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  await prisma.auditLog.create({
    data: {
      organizationId: principal.organization.id,
      actorUserId: principal.user.id,
      action: "mfa.enabled",
      entityType: "user",
      entityId: String(principal.user.id),
      metadata: {},
    },
  });
  return NextResponse.json(
    { ok: true, recoveryCodes: result.recoveryCodes },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Turn it off, or replace the recovery codes — both re-ask for the password.
 *
 * Removing a second factor from a session somebody walked away from is exactly
 * the attack this feature exists to stop, and a signed-in cookie is not
 * evidence that the person at the keyboard is the account holder. The password
 * is; it is the one thing the borrowed session does not carry.
 */
export async function DELETE(request: NextRequest) {
  const principal = await requireUser(request);
  if (isDenied(principal)) return principal;

  let password = "";
  let action = "disable";
  try {
    const payload = (await request.json()) as { password?: unknown; action?: unknown };
    password = typeof payload.password === "string" ? payload.password : "";
    if (payload.action === "regenerate") action = "regenerate";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!verifyPassword(password, principal.user.passwordHash)) {
    return NextResponse.json({ error: "bad_password" }, { status: 403 });
  }
  if (mfaState(principal.user) !== "on" && action === "regenerate") {
    return NextResponse.json({ error: "not_enrolled" }, { status: 409 });
  }

  if (action === "regenerate") {
    const codes = await regenerateRecoveryCodes(prisma, principal.user);
    await prisma.auditLog.create({
      data: {
        organizationId: principal.organization.id,
        actorUserId: principal.user.id,
        action: "mfa.recovery_regenerated",
        entityType: "user",
        entityId: String(principal.user.id),
        metadata: {},
      },
    });
    return NextResponse.json(
      { ok: true, recoveryCodes: codes },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  await disableMfa(prisma, principal.user);
  await prisma.auditLog.create({
    data: {
      organizationId: principal.organization.id,
      actorUserId: principal.user.id,
      action: "mfa.disabled",
      entityType: "user",
      entityId: String(principal.user.id),
      metadata: {},
    },
  });
  return NextResponse.json({ ok: true });
}
