// Stateless sessions: an HS256 JWT carrying (userId, organizationId, role).
// Stateless is a deliberate infrastructure decision (ADR 0004) — no session
// store means the app image runs identically on Cloud Run, ECS and on-prem.
//
// JWT_SECRET fails closed: unset or short means no session can be minted OR
// verified. An unset secret is a deploy mistake fixable in a minute; sessions
// signed with a guessable default are not.
import { jwtVerify, SignJWT } from "jose";

import type { UserRole } from "@olink-desk/database";

const SESSION_HOURS = 12;
const MIN_SECRET_LENGTH = 32;

export interface SessionPayload {
  userId: string;
  organizationId: string;
  role: UserRole;
}

function key(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw || raw.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be set (>= ${MIN_SECRET_LENGTH} chars) — refusing to handle sessions`,
    );
  }
  return new TextEncoder().encode(raw);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    organizationId: payload.organizationId,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(key());
}

/** null on anything wrong — bad signature, expired, malformed. Callers treat
 * null as "not signed in", never as an error to surface. */
export async function verifySession(
  token: string | null | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    const userId = payload.sub;
    const organizationId = payload.organizationId;
    const role = payload.role;
    if (
      typeof userId !== "string" ||
      typeof organizationId !== "string" ||
      typeof role !== "string"
    ) {
      return null;
    }
    return { userId, organizationId, role: role as UserRole };
  } catch {
    return null;
  }
}
