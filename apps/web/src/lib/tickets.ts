// Shared shapes and tiny helpers for the ticket screens. Channel display
// names are proper nouns (fleet i18n rule: never translated).
export interface TicketMessagePreview {
  body: string;
  direction: "INBOUND" | "OUTBOUND";
  createdAt: string;
}

export interface TicketRow {
  id: string;
  number: number;
  channel: string;
  status: string;
  priority: string;
  subject: string | null;
  language: string | null;
  createdAt: string;
  updatedAt: string;
  firstRespondedAt: string | null;
  contact: { name: string | null; phone: string | null } | null;
  assignee?: { name: string } | null;
  assigneeId?: string | null;
  queueId?: string | null;
  firstResponseDueAt?: string | null;
  resolveDueAt?: string | null;
  messages: TicketMessagePreview[];
}

export interface TimelineMessage {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  channel: string;
  body: string;
  createdAt: string;
  authorUser: { name: string } | null;
}

export interface TicketDetail extends Omit<TicketRow, "messages"> {
  messages: TimelineMessage[];
  assigneeId: string | null;
  queueId: string | null;
  firstResponseDueAt: string | null;
  resolveDueAt: string | null;
  contact: {
    name: string | null;
    phone: string | null;
    email: string | null;
    language: string | null;
  } | null;
}

export const CHANNEL_LABELS: Record<string, string> = {
  WEB: "Web",
  TELEGRAM: "Telegram",
  VIBER: "Viber",
  WHATSAPP: "WhatsApp",
  MESSENGER: "Messenger",
  INSTAGRAM: "Instagram",
  SMS: "SMS",
  USSD: "USSD",
  PHONE: "Phone",
  EMAIL: "Email",
  WALK_IN: "Walk-in",
};

const STATUS_KEYS: Record<string, string> = {
  NEW: "ui_st_new",
  OPEN: "ui_st_open",
  PENDING: "ui_st_pending",
  RESOLVED: "ui_st_resolved",
  CLOSED: "ui_st_closed",
};

export function statusKey(status: string): string {
  return STATUS_KEYS[status] ?? "ui_st_open";
}

/** Compact relative time — locale-neutral digits + unit letter. */
export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const PRIORITY_KEYS: Record<string, string> = {
  LOW: "ui_pr_low",
  NORMAL: "ui_pr_normal",
  HIGH: "ui_pr_high",
  URGENT: "ui_pr_urgent",
};

export function priorityKey(priority: string): string {
  return PRIORITY_KEYS[priority] ?? "ui_pr_normal";
}

/** Compact duration — "2h 15m", "3d 4h" — locale-neutral. */
export function duration(ms: number): string {
  const abs = Math.abs(ms);
  const min = Math.floor(abs / 60_000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${min % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
