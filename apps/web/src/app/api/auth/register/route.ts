import { registerOrganization, signSession } from "@olink-desk/auth";
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
  const result = await registerOrganization(prisma, {
    organizationName: asString(payload.organizationName),
    slug: asString(payload.slug),
    name: asString(payload.name),
    email: asString(payload.email),
    password: asString(payload.password),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const token = await signSession({
    userId: result.user.id,
    organizationId: result.organization.id,
    role: result.user.role,
  });
  const response = NextResponse.json({
    organization: { slug: result.organization.slug, name: result.organization.name },
  });
  response.cookies.set(sessionCookie(token));
  return response;
}
