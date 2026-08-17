"use client";
// Settings: the numbers, people and identity the desk runs on. Five sections
// in a rail — Workspace, SLA & hours, Team, Queues, Data lifecycle — each
// writing through routes that refuse incoherent input rather than storing it.
import {
  humanMinutes,
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
  TIMEZONES,
  type Language,
} from "@olink-desk/i18n";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { IconTile, stroke } from "../../lib/card";

import {
  Badge,
  colors,
  ConsoleShell,
  layout,
  tUi,
  ui,
  useConsoleLanguage,
  useMe,
} from "../../lib/console-ui";
import { priorityKey } from "../../lib/tickets";

const TABS = [
  { key: "workspace", label: "ui_tab_workspace" },
  { key: "sla", label: "ui_tab_sla" },
  { key: "team", label: "ui_tab_team" },
  { key: "queues", label: "ui_tab_queues" },
  { key: "data", label: "ui_data_lifecycle" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const ROLES = ["AGENT", "SUPERVISOR", "ADMIN", "AUDITOR"] as const;
const ROLE_KEYS: Record<string, string> = {
  AGENT: "ui_role_agent",
  SUPERVISOR: "ui_role_supervisor",
  ADMIN: "ui_role_admin",
  AUDITOR: "ui_role_auditor",
};
// ISO weekday numbers, Monday first — the order a working week is read in.
const DAYS = [
  { n: 1, key: "ui_mon" },
  { n: 2, key: "ui_tue" },
  { n: 3, key: "ui_wed" },
  { n: 4, key: "ui_thu" },
  { n: 5, key: "ui_fri" },
  { n: 6, key: "ui_sat" },
  { n: 7, key: "ui_sun" },
];

interface Policy {
  priority: string;
  firstResponseMinutes: number;
  resolveMinutes: number;
}
interface Calendar {
  enabled: boolean;
  utcOffsetMinutes: number;
  workDays: number[];
  startMinute: number;
  endMinute: number;
  holidays: string[];
}
interface Member {
  id: string;
  name: string;
  email?: string;
  role: string;
  status: string;
}

const control = {
  padding: "7px 9px",
  borderRadius: 6,
  border: `1px solid ${colors.border}`,
  background: colors.surfaceRaised,
  color: colors.textBody,
  fontSize: 13,
} as const;

/** minutes-from-midnight ⇄ the "HH:MM" a time input speaks. */
const toTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromTime = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export default function SettingsPage() {
  const [lang, setLang] = useConsoleLanguage();
  const me = useMe();
  const [tab, setTab] = useState<TabKey>("workspace");

  const [policies, setPolicies] = useState<Policy[] | null>(null);
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [queues, setQueues] = useState<Array<{ id: string; name: string }>>([]);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [newQueue, setNewQueue] = useState("");
  const [invite, setInvite] = useState({ name: "", email: "", role: "AGENT" });
  const [handover, setHandover] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [slaResp, usersResp, queuesResp] = await Promise.all([
      fetch("/api/settings/sla"),
      fetch("/api/users?all=true"),
      fetch("/api/queues"),
    ]);
    if (slaResp.ok) {
      const body = (await slaResp.json()) as { policies: Policy[]; calendar: Calendar };
      setPolicies(body.policies);
      setCalendar(body.calendar);
    }
    if (usersResp.ok) setMembers(((await usersResp.json()) as { users: Member[] }).users);
    if (queuesResp.ok) setQueues(((await queuesResp.json()) as { queues: typeof queues }).queues);
  }, []);

  useEffect(() => {
    if (me) void load();
  }, [me, load]);

  async function saveSla() {
    if (!policies || !calendar) return;
    setSaving(true);
    setMessage(null);
    const resp = await fetch("/api/settings/sla", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policies, calendar }),
    });
    const body = (await resp.json().catch(() => null)) as { error?: string } | null;
    setMessage(
      resp.ok
        ? { ok: true, text: tUi(lang, "ui_saved") }
        : {
            ok: false,
            text: tUi(lang, "ui_save_failed", { error: body?.error ?? `HTTP ${resp.status}` }),
          },
    );
    setSaving(false);
    if (resp.ok) await load();
  }

  async function addTeammate() {
    setSaving(true);
    setMessage(null);
    setHandover(null);
    const resp = await fetch("/api/users/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invite),
    });
    const body = (await resp.json().catch(() => null)) as
      | { error?: string; temporaryPassword?: string; user?: { name: string } }
      | null;
    if (resp.ok && body?.temporaryPassword) {
      // Shown once, right here: there is no email to fall back on.
      setHandover(
        tUi(lang, "ui_temp_password", {
          name: body.user?.name ?? invite.name,
          password: body.temporaryPassword,
        }),
      );
      setInvite({ name: "", email: "", role: "AGENT" });
      await load();
    } else {
      setMessage({
        ok: false,
        text: tUi(lang, "ui_save_failed", { error: body?.error ?? `HTTP ${resp.status}` }),
      });
    }
    setSaving(false);
  }

  async function patchMember(id: string, change: Record<string, unknown>) {
    setMessage(null);
    const resp = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(change),
    });
    if (resp.ok) await load();
    else {
      const body = (await resp.json().catch(() => null)) as { error?: string } | null;
      setMessage({
        ok: false,
        text: tUi(lang, "ui_save_failed", { error: body?.error ?? `HTTP ${resp.status}` }),
      });
    }
  }

  async function addQueue() {
    if (!newQueue.trim()) return;
    const resp = await fetch("/api/queues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newQueue.trim() }),
    });
    if (resp.ok) {
      setNewQueue("");
      await load();
    } else {
      const body = (await resp.json().catch(() => null)) as { error?: string } | null;
      setMessage({
        ok: false,
        text: tUi(lang, "ui_save_failed", { error: body?.error ?? `HTTP ${resp.status}` }),
      });
    }
  }

  return (
    <ConsoleShell
      lang={lang}
      onLang={setLang}
      me={me}
      active="settings"
      // A rail rather than a row of pills. Settings is on its fifth section
      // and will grow a sixth; a horizontal strip runs out of room and reads as
      // less important than the page under it. This is the shell's own second
      // layer — the same slot the inbox's views use — so it folds away with
      // them and costs no page width when it is not wanted.
      sidePanelLabels={{ show: "ui_sections_show", hide: "ui_sections_hide" }}
      sidePanel={
        <nav>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: colors.textMuted,
              padding: "0 10px 10px",
            }}
          >
            {tUi(lang, "ui_nav_settings")}
          </div>
          {TABS.map((t) => (
            <button
              key={t.key}
              data-settings-tab={t.key}
              onClick={() => {
                setTab(t.key);
                setMessage(null);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "start",
                padding: "8px 10px",
                marginBottom: 2,
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: tab === t.key ? 600 : 500,
                color: tab === t.key ? colors.textPrimary : colors.textSecondary,
                background: tab === t.key ? colors.surfaceHover : "transparent",
                borderLeft: `2px solid ${tab === t.key ? colors.accent : "transparent"}`,
              }}
            >
              {tUi(lang, t.label)}
            </button>
          ))}
        </nav>
      }
    >
      <header style={{ marginBottom: 16 }}>
        <h1 style={ui.h1}>{tUi(lang, "ui_nav_settings")}</h1>
      </header>

      {message ? (
        <div style={{ ...(message.ok ? ui.ok : ui.error), marginBottom: 16, maxWidth: 700 }}>
          {message.text}
        </div>
      ) : null}

      {/* -------------------------------------------------- Workspace */}
      {tab === "workspace" ? <WorkspacePanel lang={lang} onSaved={setMessage} /> : null}

      {/* ------------------------------------------------- SLA & hours */}
      {tab === "sla" ? (
        <div style={{ ...layout.centred, display: "grid", gap: 16 }}>
          <section style={ui.card}>
            <div style={{ display: "flex", gap: 11, alignItems: "center", marginBottom: 6 }}>
              <IconTile size={34}>
                <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}><path d="M12 7v5l3 2" /><circle cx="12" cy="12" r="9" /></svg>
              </IconTile>
              <h2 style={{ ...ui.h2, margin: 0 }}>{tUi(lang, "ui_tab_sla")}</h2>
            </div>
            {/* What the two numbers actually promise, and that they are what
                colours the inbox. Four rows of unexplained minute boxes is a
                form; this makes it a decision. */}
            <p style={{ ...ui.sub, marginBottom: 14 }}>{tUi(lang, "ui_sla_explainer")}</p>
            {!policies ? (
              <p style={{ color: colors.textSecondary }}>{tUi(lang, "ui_loading")}</p>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {policies.map((p, i) => (
                  <div
                    key={p.priority}
                    style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}
                  >
                    <span style={{ width: 90, fontSize: 13, color: colors.textPrimary, fontWeight: 600 }}>
                      {tUi(lang, priorityKey(p.priority))}
                    </span>
                    <NumberField
                      label={tUi(lang, "ui_first_response")}
                      value={p.firstResponseMinutes}
                      onChange={(v) => {
                        const next = [...policies];
                        next[i] = { ...p, firstResponseMinutes: v };
                        setPolicies(next);
                      }}
                      unit={tUi(lang, "ui_minutes")}
                      hint={humanMinutes(p.firstResponseMinutes)}
                    />
                    <NumberField
                      label={tUi(lang, "ui_resolution")}
                      value={p.resolveMinutes}
                      onChange={(v) => {
                        const next = [...policies];
                        next[i] = { ...p, resolveMinutes: v };
                        setPolicies(next);
                      }}
                      unit={tUi(lang, "ui_minutes")}
                      hint={humanMinutes(p.resolveMinutes)}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={ui.card}>
            <div style={{ display: "flex", gap: 11, alignItems: "center", marginBottom: 14 }}>
              <IconTile size={34}>
                <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
              </IconTile>
              <h2 style={{ ...ui.h2, margin: 0 }}>{tUi(lang, "ui_business_hours")}</h2>
            </div>
            {!calendar ? (
              <p style={{ color: colors.textSecondary }}>{tUi(lang, "ui_loading")}</p>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={!calendar.enabled}
                    onChange={(e) => setCalendar({ ...calendar, enabled: !e.target.checked })}
                  />
                  {tUi(lang, "ui_always_open")}
                </label>

                {calendar.enabled ? (
                  <>
                    <div>
                      <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
                        {tUi(lang, "ui_workdays")}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {DAYS.map((d) => {
                          const on = calendar.workDays.includes(d.n);
                          return (
                            <button
                              key={d.n}
                              onClick={() =>
                                setCalendar({
                                  ...calendar,
                                  workDays: on
                                    ? calendar.workDays.filter((x) => x !== d.n)
                                    : [...calendar.workDays, d.n].sort(),
                                })
                              }
                              style={{
                                ...ui.buttonGhost,
                                padding: "6px 12px",
                                fontSize: 12,
                                borderColor: on ? colors.accent : colors.border,
                                color: on ? colors.textPrimary : colors.textSecondary,
                                background: on ? colors.surfaceHover : "transparent",
                              }}
                            >
                              {tUi(lang, d.key)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <label style={{ fontSize: 12, color: colors.textMuted }}>
                        <div style={{ marginBottom: 4 }}>{tUi(lang, "ui_day_start")}</div>
                        <input
                          type="time"
                          value={toTime(calendar.startMinute)}
                          onChange={(e) =>
                            setCalendar({ ...calendar, startMinute: fromTime(e.target.value) })
                          }
                          style={control}
                        />
                      </label>
                      <label style={{ fontSize: 12, color: colors.textMuted }}>
                        <div style={{ marginBottom: 4 }}>{tUi(lang, "ui_day_end")}</div>
                        <input
                          type="time"
                          value={toTime(calendar.endMinute)}
                          onChange={(e) =>
                            setCalendar({ ...calendar, endMinute: fromTime(e.target.value) })
                          }
                          style={control}
                        />
                      </label>
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </section>

          <div>
            <button onClick={saveSla} disabled={saving} style={ui.button}>
              {saving ? tUi(lang, "ui_saving") : tUi(lang, "ui_save")}
            </button>
          </div>
        </div>
      ) : null}

      {/* -------------------------------------------------------- Team */}
      {tab === "team" ? (
        <div style={{ ...layout.centred, display: "grid", gap: 16 }}>
          <section style={ui.card}>
            <div style={{ display: "flex", gap: 11, alignItems: "center", marginBottom: 14 }}>
              <IconTile size={34}>
                <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>
              </IconTile>
              <h2 style={{ ...ui.h2, margin: 0 }}>{tUi(lang, "ui_invite_teammate")}</h2>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <input
                placeholder={tUi(lang, "ui_your_name")}
                value={invite.name}
                onChange={(e) => setInvite({ ...invite, name: e.target.value })}
                style={{ ...control, flex: "1 1 150px" }}
              />
              <input
                placeholder={tUi(lang, "ui_email")}
                type="email"
                value={invite.email}
                onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                style={{ ...control, flex: "1 1 190px" }}
              />
              <select
                aria-label={tUi(lang, "ui_role")}
                value={invite.role}
                onChange={(e) => setInvite({ ...invite, role: e.target.value })}
                style={control}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {tUi(lang, ROLE_KEYS[r])}
                  </option>
                ))}
              </select>
              <button onClick={addTeammate} disabled={saving} style={ui.button}>
                {tUi(lang, "ui_invite")}
              </button>
            </div>
            {handover ? (
              <div style={{ ...ui.warn, marginTop: 12, overflowWrap: "anywhere" }}>{handover}</div>
            ) : null}
          </section>

          <section style={{ ...ui.card, padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {members.map((m, i) => (
                  <tr key={m.id}>
                    <td
                      style={{
                        padding: "12px 16px",
                        borderTop: i === 0 ? "none" : `1px solid ${colors.border}`,
                      }}
                    >
                      <div style={{ color: colors.textPrimary, fontWeight: 600, fontSize: 14 }}>
                        {m.name}{" "}
                        {m.status === "DISABLED" ? (
                          <Badge tone="muted">{tUi(lang, "ui_disabled")}</Badge>
                        ) : null}
                      </div>
                      <div style={{ color: colors.textMuted, fontSize: 12 }}>{m.email ?? ""}</div>
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        borderTop: i === 0 ? "none" : `1px solid ${colors.border}`,
                        textAlign: "end",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <select
                        aria-label={`${tUi(lang, "ui_role")} — ${m.name}`}
                        value={m.role}
                        onChange={(e) => void patchMember(m.id, { role: e.target.value })}
                        style={{ ...control, marginInlineEnd: 8 }}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {tUi(lang, ROLE_KEYS[r])}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() =>
                          void patchMember(m.id, {
                            status: m.status === "DISABLED" ? "ACTIVE" : "DISABLED",
                          })
                        }
                        style={{ ...ui.buttonGhost, padding: "6px 10px", fontSize: 12 }}
                      >
                        {tUi(lang, m.status === "DISABLED" ? "ui_reactivate" : "ui_deactivate")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      ) : null}

      {/* ------------------------------------------------------ Queues */}
      {tab === "queues" ? (
        <div style={{ ...layout.centred, display: "grid", gap: 16, maxWidth: 560 }}>
          <section style={ui.card}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                placeholder={tUi(lang, "ui_new_queue")}
                value={newQueue}
                onChange={(e) => setNewQueue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addQueue();
                }}
                style={{ ...control, flex: 1 }}
              />
              <button onClick={addQueue} style={ui.button}>
                {tUi(lang, "ui_add")}
              </button>
            </div>
          </section>
          <section style={{ ...ui.card, padding: 0 }}>
            {queues.length === 0 ? (
              <p style={{ margin: 18, color: colors.textMuted, fontSize: 13 }}>
                {tUi(lang, "ui_no_queue")}
              </p>
            ) : (
              queues.map((qq, i) => (
                <div
                  key={qq.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    borderTop: i === 0 ? "none" : `1px solid ${colors.border}`,
                  }}
                >
                  <span style={{ color: colors.textBody, fontSize: 14 }}>{qq.name}</span>
                  <button
                    onClick={async () => {
                      const resp = await fetch(`/api/queues/${qq.id}`, { method: "DELETE" });
                      if (resp.ok) await load();
                    }}
                    style={{ ...ui.buttonGhost, padding: "6px 10px", fontSize: 12 }}
                  >
                    {tUi(lang, "ui_delete")}
                  </button>
                </div>
              ))
            )}
          </section>
        </div>
      ) : null}

      {/* ---------------------------------------------- Data lifecycle */}
      {tab === "data" ? <DataLifecyclePanel lang={lang} onSaved={setMessage} /> : null}
    </ConsoleShell>
  );
}

function NumberField({
  label,
  value,
  onChange,
  unit,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit: string;
  /** The same number said the way a person would. */
  hint?: string;
}): ReactNode {
  return (
    <label style={{ fontSize: 12, color: colors.textMuted }}>
      <div style={{ marginBottom: 4 }}>{label}</div>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="number"
          min={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ ...control, width: 100 }}
        />
        <span>{unit}</span>
        {/* "1620 minutes" is arithmetic homework. "1d 3h" is an answer, and
            it is the number an admin is actually deciding about. */}
        {hint ? (
          <span data-duration-hint style={{ color: colors.textSecondary, fontWeight: 600 }}>
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  );
}

/**
 * The workspace's own identity.
 *
 * Every field here has existed in the schema since the first migration and
 * none of them had a screen: a workspace could not be renamed after
 * registration, its time zone was whatever the default said whatever country
 * it was in, and the language set that decides what a customer is answered in
 * was unreachable.
 */
function WorkspacePanel({
  lang,
  onSaved,
}: {
  lang: Language;
  onSaved: (m: { ok: boolean; text: string } | null) => void;
}): ReactNode {
  const [profile, setProfile] = useState<{
    name: string;
    slug: string;
    timezone: string;
    languages: string[];
    defaultLanguage: string;
    canRename: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const resp = await fetch("/api/workspace");
      if (resp.ok) setProfile((await resp.json()) as typeof profile);
    })();
  }, []);

  async function save() {
    if (!profile) return;
    setSaving(true);
    onSaved(null);
    try {
      const resp = await fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name,
          timezone: profile.timezone,
          languages: profile.languages,
          defaultLanguage: profile.defaultLanguage,
        }),
      });
      const body = (await resp.json().catch(() => null)) as { error?: string } | null;
      onSaved(
        resp.ok
          ? { ok: true, text: tUi(lang, "ui_saved") }
          : // The API answers with an i18n KEY, not a sentence — this is the
            // one settings screen an admin may well be reading in Amharic.
            { ok: false, text: tUi(lang, body?.error ?? "ui_save_failed", { error: "" }) },
      );
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return <p style={{ color: colors.textSecondary }}>{tUi(lang, "ui_loading")}</p>;
  }

  const toggle = (code: string) => {
    const has = profile.languages.includes(code);
    const languages = has
      ? profile.languages.filter((l) => l !== code)
      : [...profile.languages, code];
    setProfile({
      ...profile,
      languages,
      // Turning off the language that WAS the default silently moves the
      // default rather than leaving an invalid pair the save would reject
      // with an error the admin cannot act on from here.
      defaultLanguage: languages.includes(profile.defaultLanguage)
        ? profile.defaultLanguage
        : (languages[0] ?? profile.defaultLanguage),
    });
  };

  return (
    <div style={{ ...layout.centred, display: "grid", gap: 16 }} data-workspace-panel>
      <section style={ui.card}>
        <div style={{ display: "flex", gap: 11, alignItems: "center", marginBottom: 14 }}>
              <IconTile size={34}>
                <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h10M7 13h6" /></svg>
              </IconTile>
              <h2 style={{ ...ui.h2, margin: 0 }}>{tUi(lang, "ui_ws_identity")}</h2>
            </div>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={ui.label} htmlFor="ws-name">
              {tUi(lang, "ui_ws_name")}
            </label>
            <input
              id="ws-name"
              style={ui.input}
              value={profile.name}
              disabled={!profile.canRename}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            />
            <p style={{ margin: "4px 0 0", fontSize: 12, color: colors.textMuted }}>
              {tUi(lang, "ui_ws_name_hint")}
            </p>
          </div>

          <div>
            <label style={ui.label}>{tUi(lang, "ui_ws_address")}</label>
            <code
              style={{
                display: "block",
                padding: "10px 12px",
                borderRadius: 8,
                background: colors.surfaceRaised,
                border: `1px solid ${colors.border}`,
                color: colors.textSecondary,
                fontSize: 13,
              }}
            >
              {profile.slug}
            </code>
            {/* Not editable, and the reason is worth saying rather than
                leaving as a greyed-out box: this slug is inside the widget
                snippet on the customer's own website and inside every webhook
                URL a gateway has been pointed at. */}
            <p style={{ margin: "4px 0 0", fontSize: 12, color: colors.textMuted }}>
              {tUi(lang, "ui_ws_address_hint")}
            </p>
          </div>

          <div>
            <label style={ui.label} htmlFor="ws-tz">
              {tUi(lang, "ui_ws_timezone")}
            </label>
            <select
              id="ws-tz"
              style={{ ...ui.input, maxWidth: 320 }}
              value={profile.timezone}
              disabled={!profile.canRename}
              onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: colors.textMuted }}>
              {tUi(lang, "ui_ws_timezone_hint")}
            </p>
          </div>
        </div>
      </section>

      <section style={ui.card}>
        <div style={{ display: "flex", gap: 11, alignItems: "center", marginBottom: 6 }}>
              <IconTile size={34}>
                <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" /></svg>
              </IconTile>
              <h2 style={{ ...ui.h2, margin: 0 }}>{tUi(lang, "ui_ws_languages")}</h2>
            </div>
        <p style={{ ...ui.sub, marginBottom: 14 }}>{tUi(lang, "ui_ws_languages_hint")}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {SUPPORTED_LANGUAGES.map((code) => {
            const on = profile.languages.includes(code);
            return (
              <button
                key={code}
                data-ws-language={code}
                aria-pressed={on}
                disabled={!profile.canRename}
                onClick={() => toggle(code)}
                style={{
                  ...control,
                  cursor: profile.canRename ? "pointer" : "default",
                  padding: "7px 12px",
                  fontSize: 13,
                  borderColor: on ? colors.accent : colors.border,
                  color: on ? colors.textPrimary : colors.textMuted,
                  background: on ? colors.surfaceHover : "transparent",
                }}
              >
                {LANGUAGE_NAMES[code]}
              </button>
            );
          })}
        </div>

        <label style={ui.label} htmlFor="ws-default">
          {tUi(lang, "ui_ws_default_language")}
        </label>
        <select
          id="ws-default"
          style={{ ...ui.input, maxWidth: 260 }}
          value={profile.defaultLanguage}
          disabled={!profile.canRename}
          onChange={(e) => setProfile({ ...profile, defaultLanguage: e.target.value })}
        >
          {/* Only languages the desk actually serves. Offering the rest would
              let an admin pick a fallback nobody on the team staffs, and it
              would fail silently — every field looks valid on its own. */}
          {SUPPORTED_LANGUAGES.filter((c) => profile.languages.includes(c)).map((code) => (
            <option key={code} value={code}>
              {LANGUAGE_NAMES[code]}
            </option>
          ))}
        </select>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: colors.textMuted }}>
          {tUi(lang, "ui_ws_default_hint")}
        </p>
      </section>

      {profile.canRename ? (
        <div>
          <button
            data-workspace-save
            style={ui.button}
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? tUi(lang, "ui_saving") : tUi(lang, "ui_save")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The data-lifecycle panel.
 *
 * Two windows and a warning. It is the only settings screen in the product
 * whose effect cannot be undone by changing it back, so it is built to be
 * read rather than skimmed: each window says what it destroys and what it
 * leaves alone, and the second fact matters as much as the first — an
 * administrator who believes their reports will change will never turn this
 * on, and the whole compliance story turns on their doing so.
 */
function DataLifecyclePanel({
  lang,
  onSaved,
}: {
  lang: Language;
  onSaved: (m: { ok: boolean; text: string } | null) => void;
}): ReactNode {
  interface Policy {
    ticketRetentionDays: number | null;
    auditRetentionDays: number | null;
    canEdit: boolean;
    minDays: number;
    maxDays: number;
    presets: number[];
    scheduled: boolean;
  }
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const resp = await fetch("/api/retention");
      if (resp.ok) setPolicy((await resp.json()) as Policy);
    })();
  }, []);

  if (!policy) {
    return <p style={{ color: colors.textSecondary }}>{tUi(lang, "ui_loading")}</p>;
  }

  // The API answers with machine-readable problem codes rather than
  // sentences, so the words are chosen here — in the language the admin is
  // actually reading the page in.
  const problemText = (problems: string[]): string => {
    const first = problems[0] ?? "";
    if (first.endsWith("below_minimum"))
      return tUi(lang, "ui_retention_err_below_minimum", { n: policy.minDays });
    if (first.endsWith("above_maximum"))
      return tUi(lang, "ui_retention_err_above_maximum", { n: policy.maxDays });
    if (first.endsWith("not_an_integer")) return tUi(lang, "ui_retention_err_not_integer");
    if (first.endsWith("shorter_than_content"))
      return tUi(lang, "ui_retention_err_audit_short");
    return first;
  };

  async function save(next: Pick<Policy, "ticketRetentionDays" | "auditRetentionDays">) {
    setSaving(true);
    onSaved(null);
    try {
      const resp = await fetch("/api/retention", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const body = (await resp.json().catch(() => null)) as
        | { problems?: string[]; error?: string }
        | null;
      if (resp.ok) {
        setPolicy((p) => (p ? { ...p, ...next } : p));
        onSaved({ ok: true, text: tUi(lang, "ui_retention_saved") });
      } else {
        onSaved({
          ok: false,
          text: body?.problems
            ? problemText(body.problems)
            : tUi(lang, "ui_retention_failed", { error: body?.error ?? `HTTP ${resp.status}` }),
        });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ ...layout.centred, display: "grid", gap: 16 }} data-retention-panel>
      <section style={ui.card}>
        <div style={{ display: "flex", gap: 11, alignItems: "center", marginBottom: 6 }}>
          <IconTile size={34}>
            <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
              <ellipse cx="12" cy="6" rx="8" ry="3" />
              <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
              <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
            </svg>
          </IconTile>
          <h2 style={{ ...ui.h2, margin: 0 }}>{tUi(lang, "ui_data_lifecycle")}</h2>
        </div>
        <p style={{ ...ui.sub, marginBottom: 14 }}>{tUi(lang, "ui_data_lifecycle_blurb")}</p>

        {/* A window set on a deployment with no scheduler is a promise to a
            customer that nothing keeps. The screen says so rather than
            letting the saved value imply otherwise. */}
        {!policy.scheduled ? (
          <div style={{ ...ui.error, marginBottom: 14 }} data-retention-unscheduled>
            {tUi(lang, "ui_retention_not_scheduled")}
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 18 }}>
          <WindowField
            lang={lang}
            testId="ticket"
            label="ui_retention_tickets"
            hint="ui_retention_tickets_hint"
            value={policy.ticketRetentionDays}
            presets={policy.presets}
            disabled={!policy.canEdit || saving}
            onChange={(v) =>
              void save({
                ticketRetentionDays: v,
                auditRetentionDays: policy.auditRetentionDays,
              })
            }
          />
          <WindowField
            lang={lang}
            testId="audit"
            label="ui_retention_audit"
            hint="ui_retention_audit_hint"
            value={policy.auditRetentionDays}
            presets={policy.presets}
            disabled={!policy.canEdit || saving}
            onChange={(v) =>
              void save({
                ticketRetentionDays: policy.ticketRetentionDays,
                auditRetentionDays: v,
              })
            }
          />
        </div>
      </section>

      <section style={ui.card}>
        <div style={{ display: "flex", gap: 11, alignItems: "center", marginBottom: 6 }}>
          <IconTile size={34}>
            <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
              <path d="M12 3l8 4v5c0 5-3.4 8.3-8 9-4.6-.7-8-4-8-9V7z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </IconTile>
          <h2 style={{ ...ui.h2, margin: 0 }}>{tUi(lang, "ui_retention_audit")}</h2>
        </div>
        <p style={{ ...ui.sub, marginBottom: 14 }}>{tUi(lang, "ui_export_audit_blurb")}</p>
        {/* A plain link, not a fetch. The response is a file with a
            Content-Disposition on it, and the browser's own download is the
            one path that works identically on every device an operator has. */}
        <a href="/api/audit/export" style={{ ...ui.button, display: "inline-block", textDecoration: "none" }} data-audit-export>
          {tUi(lang, "ui_export_audit")}
        </a>
      </section>
    </div>
  );
}

/**
 * One retention window: a set of preset lengths plus Keep forever, and a box
 * for anything else.
 *
 * Presets rather than a bare number box because the realistic answers are
 * few and an administrator typing into an empty field has to already know
 * what a reasonable window looks like. The box stays for the tenant whose
 * regulator named a specific figure.
 */
function WindowField({
  lang,
  testId,
  label,
  hint,
  value,
  presets,
  disabled,
  onChange,
}: {
  lang: Language;
  testId: string;
  label: string;
  hint: string;
  value: number | null;
  presets: number[];
  disabled: boolean;
  onChange: (v: number | null) => void;
}): ReactNode {
  const [custom, setCustom] = useState("");
  const options: Array<number | null> = [null, ...presets];

  return (
    <div data-retention-field={testId}>
      <label style={ui.label}>{tUi(lang, label)}</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "6px 0" }}>
        {options.map((option) => {
          const on = option === value;
          return (
            <button
              key={String(option)}
              data-retention-option={String(option)}
              disabled={disabled}
              onClick={() => onChange(option)}
              style={{
                padding: "6px 11px",
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: on ? 600 : 500,
                fontFamily: "inherit",
                cursor: disabled ? "default" : "pointer",
                border: `1px solid ${on ? colors.accent : colors.border}`,
                background: on ? colors.accentFaint : colors.surfaceRaised,
                color: on ? colors.accent : colors.textSecondary,
              }}
            >
              {option === null
                ? tUi(lang, "ui_retention_forever")
                : tUi(lang, "ui_retention_days", { n: option })}
            </button>
          );
        })}
        <input
          data-retention-custom={testId}
          type="number"
          inputMode="numeric"
          // "… days" rather than a bare ellipsis. Built from the same template
          // the pills use, so the word lands on the correct side of the number
          // in every language — which a hand-written placeholder would get
          // wrong in three of the six.
          placeholder={tUi(lang, "ui_retention_days", { n: "…" })}
          value={custom}
          disabled={disabled}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const n = Number(custom);
            if (Number.isFinite(n)) onChange(n);
          }}
          onBlur={() => {
            const n = Number(custom);
            if (custom !== "" && Number.isFinite(n)) onChange(n);
          }}
          style={{ ...control, width: 96 }}
        />
      </div>
      <p style={{ margin: 0, fontSize: 12, color: colors.textMuted }}>{tUi(lang, hint)}</p>
    </div>
  );
}
