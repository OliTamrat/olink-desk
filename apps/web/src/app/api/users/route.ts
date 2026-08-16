// The org's staff roster, for assignment dropdowns. Names and roles only —
// never emails or anything an agent list doesn't need.
import { prisma, UserStatus } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

import { isDenied, requireUser } from "../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const principal = await requireUser(request);
  if (isDenied(principal)) return principal;
  const users = await prisma.user.findMany({
    where: {
      organizationId: principal.organization.id,
      status: UserStatus.ACTIVE,
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });
  return NextResponse.json({ users });
}
