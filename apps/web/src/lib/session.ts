// Session cookie plumbing + the tenancy guard every staff route goes
// through. The organization scope comes from the VERIFIED session token,
// never from a URL segment — a request cannot name its way into another
// tenant (product invariant: multi-tenancy from day one).
import { verifySession, type SessionPayload } from "@olink-desk/auth";
import { prisma, UserStatus, type Organization, type User, type UserRole } from "@olink-desk/database";
import { NextResponse, type NextRequest } from "next/server";

export const SESSION_COOKIE = "desk_session";
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
// Matches the pending token's own expiry. The cookie outliving the JWT would
// only mean the browser keeps sending something already dead — harmless, but
// it turns "your code took too long" into a silent 401 with no session at all,
// which reads as a bug rather than a timeout.
const PENDING_MFA_MAX_AGE_SECONDS = 5 * 60;

export function sessionCookie(token: string, opts?: { pendingMfa?: boolean }) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: opts?.pendingMfa ? PENDING_MFA_MAX_AGE_SECONDS : SESSION_MAX_AGE_SECONDS,
  };
}

export function clearedSessionCookie() {
  return { ...sessionCookie(""), maxAge: 0 };
}

export interface Principal {
  session: SessionPayload;
  user: User;
  organization: Organization;
}

/**
 * Resolve the caller or say why not. Re-reads the user row on every request
 * so a disabled account or a role change takes effect immediately, not at
 * token expiry — a 12-hour token must not outlive a revocation.
 */
export async function currentPrincipal(
  request: NextRequest,
): Promise<Principal | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) return null;
  // The password was right; the second factor was not given. THIS IS THE ONLY
  // PLACE THAT DECIDES, deliberately: every staff route in the product reaches
  // its caller through here, so a route written before MFA existed — or after,
  // by somebody who did not think about it — is still unreachable with a
  // half-finished login. Fail closed, in one place. Never add a second path
  // that resolves a pending session to a user.
  if (session.pendingMfa) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (
    !user ||
    user.organizationId !== session.organizationId ||
    user.status !== UserStatus.ACTIVE
  ) {
    return null;
  }
  const organization = await prisma.organization.findUnique({
    where: { id: user.organizationId },
  });
  if (!organization) return null;
  // Role comes from the database, not the token, for the same reason.
  return { session: { ...session, role: user.role }, user, organization };
}

/**
 * The half-authenticated user a token names, for the MFA step ONLY.
 *
 * Deliberately separate from `currentPrincipal` and deliberately not returning
 * a Principal: this is the one caller that must see past the pending flag, and
 * handing it a bare user keeps it obvious at the call site that nobody is
 * signed in yet. Two callers may use it — proving a code, and abandoning the
 * attempt — and nothing else in the product should ever import it.
 */
export async function pendingMfaUser(
  request: NextRequest,
): Promise<{ session: SessionPayload; user: User } | null> {
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session || !session.pendingMfa) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (
    !user ||
    user.organizationId !== session.organizationId ||
    user.status !== UserStatus.ACTIVE
  ) {
    return null;
  }
  return { session, user };
}

/** Guard for API routes: a Principal, or the 401/403 response to return. */
export async function requireUser(
  request: NextRequest,
  roles?: UserRole[],
): Promise<Principal | NextResponse> {
  const principal = await currentPrincipal(request);
  if (!principal) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (roles && !roles.includes(principal.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return principal;
}

export function isDenied(value: Principal | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
