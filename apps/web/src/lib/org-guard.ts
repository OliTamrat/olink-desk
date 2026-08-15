// Guard for per-org admin operations (channel connect, credential store).
// Two doors, in order:
//   1. A signed-in ADMIN of that same org — the console path. The org scope
//      comes from the VERIFIED session, and the URL segment must agree with
//      it; a session cannot name its way into another tenant.
//   2. The DESK_ADMIN_SECRET header — kept for automation and break-glass,
//      same constant-time, fail-closed rules as before.
// Door 2 exists because door 1 requires a browser; door 1 exists because
// door 2 required PowerShell, which is not an operator experience.
import { secretsMatch } from "@olink-desk/channels";
import { prisma, UserRole, type Organization } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { currentPrincipal } from "./session";

export async function requireOrgAdmin(
  request: NextRequest,
  orgSlug: string,
): Promise<{ organization: Organization } | NextResponse> {
  const principal = await currentPrincipal(request);
  if (principal) {
    if (
      principal.organization.slug !== orgSlug ||
      principal.user.role !== UserRole.ADMIN
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return { organization: principal.organization };
  }

  const expected = process.env.DESK_ADMIN_SECRET;
  const header = request.headers.get("x-desk-admin");
  if (header !== null && expected && secretsMatch(expected, header)) {
    const organization = await prisma.organization.findUnique({
      where: { slug: orgSlug },
    });
    if (!organization) {
      return NextResponse.json(
        { error: "Unknown organization" },
        { status: 404 },
      );
    }
    return { organization };
  }

  return NextResponse.json({ error: "Not signed in" }, { status: 401 });
}

export function isGuardDenied(
  value: { organization: Organization } | NextResponse,
): value is NextResponse {
  return value instanceof NextResponse;
}
