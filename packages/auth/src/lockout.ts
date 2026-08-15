// Progressive lockout — the Onekof pattern: free attempts, then a lock whose
// duration doubles with each further failure, capped. Pure functions so the
// policy is testable without a database or a clock.

export const FREE_ATTEMPTS = 5;
const BASE_LOCK_MINUTES = 1;
const MAX_LOCK_MINUTES = 60;

/** Lock duration (minutes) after the Nth consecutive failure; 0 = no lock. */
export function lockMinutesAfter(failedAttempts: number): number {
  if (failedAttempts < FREE_ATTEMPTS) return 0;
  const doublings = failedAttempts - FREE_ATTEMPTS;
  return Math.min(BASE_LOCK_MINUTES * 2 ** doublings, MAX_LOCK_MINUTES);
}

export function lockedUntil(failedAttempts: number, now: Date): Date | null {
  const minutes = lockMinutesAfter(failedAttempts);
  if (minutes === 0) return null;
  return new Date(now.getTime() + minutes * 60_000);
}

export function isLocked(until: Date | null, now: Date): boolean {
  return until !== null && until.getTime() > now.getTime();
}
