import { authenticate, requiresMfa, signSession } from "@olink-desk/auth";
import { prisma } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { sessionCookie } from "../../../../lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const asString = (v: unknown) => (typeof v === "string" ? v : "");
  const result = await authenticate(prisma, {
    orgSlug: asString(payload.orgSlug),
    email: asString(payload.email),
    password: asString(payload.password),
  });
  if (!result.ok) {
    if (result.reason === "locked") {
      return NextResponse.json(
        { error: "Too many attempts — try again later", lockedUntil: result.until },
        { status: 423 },
      );
    }
    if (result.reason === "disabled") {
      return NextResponse.json({ error: "Account disabled" }, { status: 403 });
    }
    return NextResponse.json({ error: "Wrong workspace, email or password" }, { status: 401 });
  }
  // The password was accepted. If this account carries a second factor, that
  // is only half a login: the cookie it gets back resolves to NOBODY until a
  // code is proved, and it expires in minutes rather than hours.
  const mfaRequired = requiresMfa(result.user);
  const token = await signSession({
    userId: result.user.id,
    organizationId: result.organization.id,
    role: result.user.role,
    pendingMfa: mfaRequired,
  });
  const response = NextResponse.json({
    // Deliberately the only thing said about the account while the login is
    // half-finished: a name and a role are exactly what an attacker with a
    // stolen password would like confirmed before deciding whether to keep
    // going after the second factor.
    ...(mfaRequired
      ? { mfaRequired: true }
      : {
          user: { name: result.user.name, role: result.user.role },
          organization: {
            slug: result.organization.slug,
            name: result.organization.name,
          },
        }),
  });
  response.cookies.set(sessionCookie(token, { pendingMfa: mfaRequired }));
  return response;
}
