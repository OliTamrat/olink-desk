// Interim operator guard until the Onekof auth/RBAC port lands (build plan,
// Month 1). Same doctrine as every other secret: constant-time comparison,
// fails closed — an unset DESK_ADMIN_SECRET means these routes return 503
// rather than opening up. Replace call sites with real session auth when the
// auth module ports; this guard must not outlive it.
import { secretsMatch } from "@olink-desk/channels";
import { NextResponse, type NextRequest } from "next/server";

export function requireAdminSecret(request: NextRequest): NextResponse | null {
  const expected = process.env.DESK_ADMIN_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "Admin access is not configured on this deployment" },
      { status: 503 },
    );
  }
  if (!secretsMatch(expected, request.headers.get("x-desk-admin"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
