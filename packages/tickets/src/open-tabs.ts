// Which tickets an agent has on the go, as pure list arithmetic.
//
// Separated from the browser storage that holds it so the one rule that can
// LOSE WORK — eviction — is unit-testable. `apps/web` has no test script by
// design: anything worth a test belongs in a package.

/** A cap, so the tab strip stays readable rather than becoming a second problem. */
export const MAX_OPEN_TABS = 8;

export interface OpenTab {
  id: string;
  number: number;
  subject: string | null;
  channel: string;
  /** When it was last looked at — what eviction reads. */
  touchedAt: number;
}

/**
 * Put a ticket on the desk, or bring it forward if it is already there.
 *
 * At the cap the LEAST RECENTLY TOUCHED tab is evicted — but **never one
 * holding an unsent reply**, whatever its age. A tab is only ever closed
 * silently when there is nothing in it to lose; anything with typing in it is
 * closed by a person, after being asked.
 */
export function openTab(
  list: OpenTab[],
  tab: Omit<OpenTab, "touchedAt">,
  hasDraft: (id: string) => boolean,
  now: number,
): OpenTab[] {
  const without = list.filter((t) => t.id !== tab.id);
  const next = [...without, { ...tab, touchedAt: now }];
  if (next.length <= MAX_OPEN_TABS) return next;

  const evictable = next
    .slice(0, -1)
    .filter((t) => !hasDraft(t.id))
    .sort((a, b) => a.touchedAt - b.touchedAt);
  if (evictable.length === 0) {
    // Everything else is holding work. An over-cap strip is the lesser harm:
    // a crowded row is a nuisance, a discarded draft is a loss.
    return next;
  }
  return next.filter((t) => t.id !== evictable[0].id);
}

export function closeTab(list: OpenTab[], id: string): OpenTab[] {
  return list.filter((t) => t.id !== id);
}

/**
 * Which tab to show after closing one: the neighbour to the RIGHT, then the
 * left, then nothing — the rule every browser uses, because it is the one
 * people already have in their hands.
 */
export function nextAfterClose(list: OpenTab[], closingId: string): string | null {
  const i = list.findIndex((t) => t.id === closingId);
  if (i === -1) return null;
  const remaining = list.filter((t) => t.id !== closingId);
  if (remaining.length === 0) return null;
  return (remaining[i] ?? remaining[remaining.length - 1]).id;
}
