// A workspace's own identity: what it is called, where it is, and which
// languages it actually staffs.
//
// Pure and here rather than in a route, because one rule below is a safety
// property with a customer-visible failure mode and deserves a test.

import { SUPPORTED_LANGUAGES, type Language } from "./index";

export const MAX_ORG_NAME = 80;

/**
 * Time zones offered. A short curated list rather than the full IANA set:
 * every tenant is in East Africa or run from one of two diaspora hubs, and a
 * 400-entry dropdown is a worse answer than five right ones. `Africa/Nairobi`
 * is here because it is the same offset and some staff recognise only it.
 */
export const TIMEZONES = [
  "Africa/Addis_Ababa",
  "Africa/Nairobi",
  "Africa/Mogadishu",
  "Europe/London",
  "America/New_York",
  "UTC",
] as const;
export type Timezone = (typeof TIMEZONES)[number];

export interface WorkspaceProfile {
  name: string;
  timezone: Timezone;
  languages: Language[];
  defaultLanguage: Language;
}

export interface ProfileResult {
  ok: boolean;
  /** i18n key, when it is not ok. */
  error?: string;
  profile?: WorkspaceProfile;
}

/**
 * Validate a proposed profile.
 *
 * **The default language must be one the desk actually serves.** That is the
 * rule worth a test: the default is what a message falls back to when we
 * cannot tell what somebody wrote in, so a default outside the served set
 * sends customers replies in a language nobody on the team staffs — and it
 * fails silently, because every individual piece looks valid.
 *
 * A desk must also serve at least one language. An empty set is not
 * "unrestricted", it is a desk that cannot answer anybody.
 */
export function cleanWorkspaceProfile(input: unknown): ProfileResult {
  const raw = (input ?? {}) as Record<string, unknown>;

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return { ok: false, error: "ui_ws_error_name" };
  if (name.length > MAX_ORG_NAME) return { ok: false, error: "ui_ws_error_name_long" };

  const timezone = (TIMEZONES as readonly string[]).includes(raw.timezone as string)
    ? (raw.timezone as Timezone)
    : null;
  if (!timezone) return { ok: false, error: "ui_ws_error_timezone" };

  const languages = Array.isArray(raw.languages)
    ? (raw.languages.filter(
        (l): l is Language =>
          typeof l === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(l),
      ) as Language[])
    : [];
  const unique = [...new Set(languages)];
  if (unique.length === 0) return { ok: false, error: "ui_ws_error_no_languages" };

  const defaultLanguage =
    typeof raw.defaultLanguage === "string" &&
    (SUPPORTED_LANGUAGES as readonly string[]).includes(raw.defaultLanguage)
      ? (raw.defaultLanguage as Language)
      : null;
  if (!defaultLanguage) return { ok: false, error: "ui_ws_error_default" };
  if (!unique.includes(defaultLanguage)) {
    return { ok: false, error: "ui_ws_error_default_unserved" };
  }

  // Stored in the canonical order, so two workspaces that serve the same
  // languages compare equal whatever order the boxes were ticked in.
  const ordered = SUPPORTED_LANGUAGES.filter((l) => unique.includes(l));
  return { ok: true, profile: { name, timezone, languages: ordered, defaultLanguage } };
}

/** `240` → `4h`, `90` → `1h 30m`, `45` → `45m`. */
export function humanMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  if (m < 60) return `${m}m`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  if (hours < 24) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const leftover = hours % 24;
  return leftover ? `${days}d ${leftover}h` : `${days}d`;
}
