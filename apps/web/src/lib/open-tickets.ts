// The browser side of the tab strip: what is on the desk, and what has been
// typed but not sent.
//
// The list ARITHMETIC lives in @olink-desk/tickets so the eviction rule — the
// one thing here that could lose somebody's work — is unit-tested. This file
// is the storage around it.
//
// Drafts are the reason tabs are safe at all. Without them, switching tabs
// mid-sentence would throw the sentence away, which is worse than having no
// tabs. That failure predates tabs: opening a ticket, typing, going back to
// the list and returning already lost it. Tabs would have made it constant
// instead of occasional.
// Imported from the SOURCE FILE, not the package barrel, and that is
// deliberate: the barrel also exports `openTicket`, which reaches Prisma. A
// value import of the barrel from a client component would try to bundle the
// database client into the browser. `open-tabs` has no imports at all.
import {
  closeTab,
  MAX_OPEN_TABS,
  nextAfterClose,
  openTab,
  type OpenTab,
} from "@olink-desk/tickets/src/open-tabs";

export { closeTab, MAX_OPEN_TABS, nextAfterClose, openTab, type OpenTab };

const OPEN_KEY = "olink-desk.open-tickets";
const DRAFT_KEY = "olink-desk.drafts";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    // A corrupt or foreign value must not take the console down with it.
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota, or private mode. Losing the tab set is survivable; throwing
    // while somebody is typing is not.
  }
}

export function readOpenTickets(): OpenTab[] {
  const list = read<OpenTab[]>(OPEN_KEY, []);
  return Array.isArray(list) ? list.filter((t) => t && typeof t.id === "string") : [];
}

export function writeOpenTickets(list: OpenTab[]): void {
  write(OPEN_KEY, list);
}

export interface Draft {
  body: string;
  /** Whether it was being written as an internal note rather than a reply. */
  internal: boolean;
}

export function readDrafts(): Record<string, Draft> {
  const map = read<Record<string, Draft>>(DRAFT_KEY, {});
  return map && typeof map === "object" ? map : {};
}

export function saveDraft(id: string, draft: Draft): void {
  const all = readDrafts();
  // An empty draft is not a draft. Keeping the key would mark the tab as
  // holding work when it holds none, and then ask before closing it.
  if (!draft.body.trim()) {
    delete all[id];
  } else {
    all[id] = draft;
  }
  write(DRAFT_KEY, all);
}

export function clearDraft(id: string): void {
  const all = readDrafts();
  delete all[id];
  write(DRAFT_KEY, all);
}
