import { NextResponse, type NextRequest } from "next/server";

import { currentPrincipal } from "../../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const principal = await currentPrincipal(request);
  if (!principal) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  return NextResponse.json({
    user: {
      id: principal.user.id,
      name: principal.user.name,
      email: principal.user.email,
      role: principal.user.role,
      locale: principal.user.locale,
    },
    organization: {
      slug: principal.organization.slug,
      name: principal.organization.name,
      languages: principal.organization.languages,
    },
  });
}
