import { authenticate, signSession } from "@olink-desk/auth";
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
  const token = await signSession({
    userId: result.user.id,
    organizationId: result.organization.id,
    role: result.user.role,
  });
  const response = NextResponse.json({
    user: { name: result.user.name, role: result.user.role },
    organization: { slug: result.organization.slug, name: result.organization.name },
  });
  response.cookies.set(sessionCookie(token));
  return response;
}
