"use client";
// Settings: the numbers and people the desk runs on. Three tabs —
// SLA & hours, Team, Queues — each writing through routes that refuse
// incoherent input rather than storing it (see api/settings/sla).
import { useCallback, useEffect, useState, type ReactNode } from "react";

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
  { key: "sla", label: "ui_tab_sla" },
  { key: "team", label: "ui_tab_team" },
  { key: "queues", label: "ui_tab_queues" },
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
  const [tab, setTab] = useState<TabKey>("sla");

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
    <ConsoleShell lang={lang} onLang={setLang} me={me} active="settings">
      <header style={{ marginBottom: 16 }}>
        <h1 style={ui.h1}>{tUi(lang, "ui_nav_settings")}</h1>
      </header>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setMessage(null);
            }}
            style={{
              ...ui.buttonGhost,
              padding: "7px 14px",
              fontSize: 13,
              borderColor: tab === t.key ? colors.accent : colors.border,
              color: tab === t.key ? colors.textPrimary : colors.textSecondary,
              background: tab === t.key ? colors.surfaceHover : "transparent",
            }}
          >
            {tUi(lang, t.label)}
          </button>
        ))}
      </div>

      {message ? (
        <div style={{ ...(message.ok ? ui.ok : ui.error), marginBottom: 16, maxWidth: 700 }}>
          {message.text}
        </div>
      ) : null}

      {/* ------------------------------------------------- SLA & hours */}
      {tab === "sla" ? (
        <div style={{ ...layout.centred, display: "grid", gap: 16 }}>
          <section style={ui.card}>
            <h2 style={{ ...ui.h2, marginBottom: 14 }}>{tUi(lang, "ui_tab_sla")}</h2>
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
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={ui.card}>
            <h2 style={{ ...ui.h2, marginBottom: 14 }}>{tUi(lang, "ui_business_hours")}</h2>
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
            <h2 style={{ ...ui.h2, marginBottom: 14 }}>{tUi(lang, "ui_invite_teammate")}</h2>
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
    </ConsoleShell>
  );
}

function NumberField({
  label,
  value,
  onChange,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit: string;
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
      </span>
    </label>
  );
}
