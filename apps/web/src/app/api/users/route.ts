// The org's staff roster, for assignment dropdowns. Names and roles only —
// never emails or anything an agent list doesn't need.
import { prisma, UserStatus } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const principal = await requireUser(request);
  if (isDenied(principal)) return principal;
  // Assignment dropdowns want only people who can work; the Team screen
  // wants everyone, including the deactivated.
  const all = request.nextUrl.searchParams.get("all") === "true";
  const users = await prisma.user.findMany({
    where: {
      organizationId: principal.organization.id,
      ...(all ? {} : { status: UserStatus.ACTIVE }),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true, status: true, email: all },
  });
  return NextResponse.json({ users }, { headers: { "Cache-Control": "no-store" } });
}
