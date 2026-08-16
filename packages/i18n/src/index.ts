// Customer-facing strings in Olink Desk's five languages, plus best-effort
// language detection — both ported from Olink Bank Assist (ADR 0002).
//
// The strings live in strings.json, not in code, so a linguist can review a
// TSV (`pnpm --filter @olink-desk/i18n export:tsv`) and corrections land as a
// data edit, never a retyped Ge'ez literal. EN is authored; AM/OM/TI/SO/SW
// are drafts composed from Bank Assist's reviewed sentence patterns and must
// go through native review before a pilot.
//
// Localization scope matches the fleet's six languages (founder decision
// 2026-08-14, ADR 0003): en/am/om/ti/so/sw — the same set Bank Assist ships.
// SW is appended last, not inserted alphabetically, mirroring Bank Assist's
// column ordering so review tooling ported later cannot mis-map columns.

import rawStrings from "./strings.json";
import rawUiStrings from "./ui_strings.json";

export const SUPPORTED_LANGUAGES = ["en", "am", "om", "ti", "so", "sw"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  am: "አማርኛ",
  om: "Afaan Oromoo",
  ti: "ትግርኛ",
  so: "Soomaali",
  sw: "Kiswahili",
};

const STRINGS = rawStrings as Record<Language, Record<string, string>>;
// The staff console's own chrome — a separate table from what customers are
// sent, because the reviewers differ (Bank Assist keeps ui/admin strings
// apart from assistant strings for the same reason). Same golden rule: a
// console screen ships its words in all six languages in the same change.
const UI_STRINGS = rawUiStrings as Record<Language, Record<string, string>>;

export function isSupportedLanguage(value: string): value is Language {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

// What each string is for and what a translation must preserve — carried in
// the TSV export's context column, addressed to the reviewer, not to the next
// maintainer (the Bank Assist lesson: inline comments never reach the person
// doing the translating).
export const NOTES: Record<string, string> = {
  greeting:
    "First message when a customer opens a chat (Telegram /start, widget open). " +
    "{org} is the organization's name. This is a human support desk, not a bot " +
    "persona — it must not claim to be an assistant that answers by itself.",
  ticket_opened:
    "Auto-acknowledgement sent once when a new ticket is opened from an inbound " +
    "message. {org} is the organization's name, {number} the human-facing ticket " +
    "number. It promises a reply in this same chat — keep that promise explicit.",
  message_received:
    "Closing screen when a message joins an EXISTING ticket on a channel that " +
    "must answer something (USSD ends every session with a screen). {number} is " +
    "the ticket number. Unlike ticket_opened it must NOT promise a reply 'here' " +
    "— a USSD session cannot be re-entered; the follow-up comes by phone or SMS.",
};

// Reviewer notes for the console table. The audience is staff (agents and
// admins), so the register is workplace-polite; proper nouns (Olink Desk,
// Telegram, BotFather, Webhook, demo) stay untranslated, per the fleet rule.
export const UI_NOTES: Record<string, string> = {
  ui_login_title: "Heading of the staff sign-in page.",
  ui_login_subtitle: "Line under the sign-in heading. 'Olink Desk' is a product name — keep it.",
  ui_workspace: "Form label: the organization's short identifier used to sign in.",
  ui_workspace_hint: "Help text under the workspace field. 'demo' is a literal example value — keep it.",
  ui_email: "Form label for the email field.",
  ui_password: "Form label for the password field.",
  ui_sign_in: "The sign-in button.",
  ui_signing_in: "Button text while the sign-in request is running.",
  ui_wrong_credentials: "Error when workspace/email/password do not match. Deliberately does not say which was wrong.",
  ui_locked_out: "Error after repeated failed sign-ins; the account unlocks by itself.",
  ui_sign_out: "The sign-out button in the console header.",
  ui_channels_title: "Heading of the Channels page (Telegram, WhatsApp, SMS…).",
  ui_channels_subtitle: "Line under the Channels heading. {org} is the organization's name.",
  ui_loading: "Shown while a page or card is fetching data.",
  ui_live: "Badge on a channel that is connected and working.",
  ui_available: "Badge on a channel that is built but not yet connected.",
  ui_needs: "Heading of the list of things required to connect a channel.",
  ui_tg_token_label: "Label of the input where the admin pastes the Telegram bot token. @BotFather is Telegram's official bot — keep the name.",
  ui_tg_connect: "Button that saves the pasted token and registers the webhook.",
  ui_tg_connecting: "Button text while connecting.",
  ui_tg_connected_as: "Success line. {bot} is the bot's Telegram username, shown as @name.",
  ui_tg_replace_hint: "Help text: pasting a new token replaces the old one, and a token revoked in BotFather must be re-pasted. 'Revoke' is BotFather's own action name.",
  ui_tg_token_dead: "Warning when the saved token no longer works because it was revoked. Tells the admin the one action that fixes it.",
  ui_tg_webhook_ok: "Status line: Telegram has our webhook registered. 'Webhook' is a technical term — keep it.",
  ui_tg_webhook_wrong: "Warning: Telegram is registered to a different address; re-pasting the token repairs it.",
  ui_tg_last_error: "Shows Telegram's own most recent delivery error. {error} is the raw message from Telegram, usually English.",
  ui_tg_connect_failed: "Error when the connect attempt is rejected. {error} is the reason.",
  ui_not_connected: "Status line for a channel with nothing connected yet.",
  ui_status_unknown: "Shown when the console could not reach Telegram to check. {error} is the reason.",
  ui_register_title: "Heading of the create-a-workspace (organization sign-up) page.",
  ui_org_name: "Form label: the organization's full display name.",
  ui_your_name: "Form label: the registering person's own name.",
  ui_register: "The create-workspace button.",
  ui_creating: "Button text while the workspace is being created.",
  ui_register_failed: "Error when creation is rejected (taken slug, weak password…). {error} is the reason from the server, usually English.",
  ui_go_sign_in: "Link from the register page to the sign-in page.",
  ui_go_register: "Link from the sign-in page to the register page.",
  ui_nav_dashboard: "Sidebar navigation item: the overview screen with today's numbers.",
  ui_nav_inbox: "Sidebar navigation item: the list of customer tickets.",
  ui_kpi_open: "Stat tile label: tickets currently open (new + open + waiting).",
  ui_kpi_new_today: "Stat tile label: tickets opened today.",
  ui_kpi_awaiting: "Stat tile label: open tickets no agent has replied to yet.",
  ui_by_channel: "Card heading: count of tickets per channel (Telegram, SMS…).",
  ui_recent_tickets: "Card heading: the most recently active tickets.",
  ui_no_tickets: "Empty state of the dashboard/inbox before any customer has written.",
  ui_inbox_empty: "Empty state of the inbox when a status filter matches nothing.",
  ui_select_ticket: "Right pane placeholder before a ticket is selected.",
  ui_reply_placeholder: "Placeholder inside the reply box.",
  ui_send: "The send-reply button.",
  ui_sending: "Send button while the reply is being delivered.",
  ui_reply_failed: "Error when a reply could not be delivered. {error} is the reason.",
  ui_all: "Inbox filter chip meaning no status filter.",
  ui_st_new: "Ticket status: just arrived, unhandled.",
  ui_st_open: "Ticket status: an agent is on it.",
  ui_st_pending: "Ticket status: waiting for the customer to answer.",
  ui_st_resolved: "Ticket status: solved, pending closure.",
  ui_st_closed: "Ticket status: finished.",
  ui_customer: "Label for the customer side of a conversation timeline.",
  ui_back: "Back button from a ticket's conversation to the ticket list (mobile).",
  w_intro: "CUSTOMER-FACING (widget): the line shown before the visitor's first message.",
  w_input_placeholder: "CUSTOMER-FACING (widget): placeholder in the message box.",
  w_send_failed: "CUSTOMER-FACING (widget): error when a message could not be sent.",
  w_powered: "CUSTOMER-FACING (widget): footer credit line. 'Olink Desk' is the product name — keep it.",
  ui_embed_title: "Channels page: heading of the website-widget embed card.",
  ui_embed_hint: "Channels page: how to install the snippet. '</body>' is an HTML tag — keep it exactly.",
  ui_copy: "Button that copies the embed snippet.",
  ui_copied: "Copy button after a successful copy.",
  ui_open_widget: "Link that opens the org's widget page in a new tab.",
  ui_status: "Ticket rail label: the ticket's status field.",
  ui_priority: "Ticket rail label: the ticket's priority field.",
  ui_assignee: "Ticket rail label: the agent responsible for the ticket.",
  ui_assign_me: "Button: assign the ticket to the signed-in agent.",
  ui_unassigned: "Shown where no agent is assigned (rail and wallboard).",
  ui_queue: "Ticket rail label: the queue (named work bucket) the ticket sits in.",
  ui_no_queue: "Shown when a ticket is in no queue.",
  ui_new_queue: "Placeholder of the create-a-queue input.",
  ui_add: "Button that creates the queue.",
  ui_pr_low: "Priority level: lowest.",
  ui_pr_normal: "Priority level: default.",
  ui_pr_high: "Priority level: elevated.",
  ui_pr_urgent: "Priority level: highest — tightest SLA clock.",
  ui_sla_first_due: "SLA chip: time remaining to send the first reply. {t} is a duration like '2h 15m'.",
  ui_sla_resolve_due: "SLA chip: time remaining to resolve. {t} is a duration.",
  ui_sla_overdue: "SLA chip: the promise was missed. {t} is how late.",
  ui_sla_met: "SLA chip: the first reply went out inside the target.",
  ui_nav_wallboard: "Sidebar item: the supervisor's live overview screen (for a big monitor).",
  ui_wb_open: "Wallboard stat: open tickets right now.",
  ui_wb_at_risk: "Wallboard stat: tickets past 80% of their SLA window.",
  ui_wb_breached: "Wallboard stat: tickets past their SLA due time.",
  ui_wb_new_today: "Wallboard stat: tickets opened today.",
  ui_wb_oldest: "Wallboard column: the longest a ticket has been waiting.",
  ui_wb_agents: "Wallboard section: staff and their open assignment counts.",
  ui_wb_median_fr: "Wallboard stat: median minutes to first reply, today.",
  ui_wb_median_res: "Wallboard stat: median minutes to resolution, today.",
  ui_views: "Heading of the saved-views rail in the workspace.",
  ui_view_mine: "Saved view: open tickets assigned to the signed-in agent.",
  ui_view_unassigned: "Saved view: open tickets nobody owns yet.",
  ui_view_open: "Saved view: every open ticket in the workspace.",
  ui_view_solved: "Saved view: tickets recently resolved or closed.",
  ui_view_all: "Saved view: no filter at all, every ticket ever.",
  ui_search_tickets: "Placeholder of the workspace search box.",
  ui_channel: "Filter label: which channel a ticket arrived on.",
  ui_all_channels: "Channel filter option meaning no channel filter.",
  ui_anyone: "Assignee filter option meaning any agent (no filter).",
  ui_count_tickets: "Live count beside the Inbox heading. {n} is a number.",
  ui_showing_first: "Shown when the result set is larger than one page. {n} is a number.",
  ui_empty_mine: "Empty state of the My-work view — encouraging, not an error.",
  ui_empty_unassigned: "Empty state of the Unassigned view: good news, everything has an owner.",
  ui_empty_solved: "Empty state of the Recently-solved view.",
  ui_empty_search: "Empty state when a search matches nothing.",
  ui_customer_details: "Heading of the customer section in the right context rail.",
  ui_ticket_details: "Heading of the ticket section in the right context rail.",
  ui_opened: "Context rail field: when the ticket was opened.",
  ui_language: "Context rail field: the conversation's language.",
  ui_phone: "Context rail field: the customer's phone number.",
  ui_clear: "Button that clears the active list filters.",
  ui_subject: "Table column: what the ticket is about.",
  ui_requester: "Table column: the customer who wrote in.",
  ui_requested: "Table column: when the ticket arrived.",
  ui_selected: "Bulk action bar: how many rows are ticked. {n} is a number.",
  ui_public_reply: "Composer mode that sends to the customer on their channel.",
  ui_internal_note: "Composer mode that records a note only staff can read.",
  ui_note_placeholder: "Placeholder in the composer while in internal-note mode. The reassurance matters — an agent must never wonder whether the customer saw it.",
  ui_note_badge: "Label on an internal note in the conversation timeline.",
  ui_interaction_history: "Right rail heading: this customer's earlier tickets.",
  ui_no_history: "Shown when the customer has no earlier tickets.",
  ui_back_to_list: "Link from an open ticket back to the ticket table.",
  ui_properties: "Left panel heading on a ticket: its editable fields.",
  ui_take_it: "Button that assigns the ticket to the signed-in agent (Zendesk calls this 'take it').",
  ui_note_sent: "Confirmation after an internal note is recorded.",
  ui_nav_settings: "Sidebar item: workspace configuration (admins/supervisors).",
  ui_tab_sla: "Settings tab: SLA targets and the working-hours calendar.",
  ui_tab_team: "Settings tab: the people who work this desk.",
  ui_tab_queues: "Settings tab: named work buckets tickets are routed into.",
  ui_first_response: "SLA field: how long until the customer must hear from a person.",
  ui_resolution: "SLA field: how long until the ticket must be finished.",
  ui_minutes: "Unit after a number of minutes in the SLA form.",
  ui_business_hours: "Settings heading: when the SLA clock runs.",
  ui_workdays: "Settings field: which days of the week the desk works.",
  ui_day_start: "Settings field: the time the working day starts.",
  ui_day_end: "Settings field: the time the working day ends.",
  ui_always_open: "Checkbox: run SLA clocks around the clock, ignoring working hours.",
  ui_save: "Save button in settings forms.",
  ui_saving: "Save button while the request is in flight.",
  ui_saved: "Confirmation after settings are stored.",
  ui_save_failed: "Error when settings could not be stored. {error} is the reason.",
  ui_invite_teammate: "Heading of the add-a-teammate form.",
  ui_role: "Form label: which role the teammate gets.",
  ui_role_agent: "Role: works tickets.",
  ui_role_supervisor: "Role: works tickets and sees the wallboard.",
  ui_role_admin: "Role: full control including settings and billing.",
  ui_role_auditor: "Role: can read everything and change nothing.",
  ui_invite: "Button that creates the teammate's account.",
  ui_temp_password: "Shown once after adding a teammate. {name} is their name, {password} the one-time password. The warning that it is not shown again is the important part.",
  ui_deactivate: "Button that disables a teammate's sign-in.",
  ui_reactivate: "Button that restores a disabled teammate.",
  ui_disabled: "Badge on a deactivated teammate.",
  ui_delete: "Button that removes a queue.",
  ui_mon: "Weekday abbreviation: Monday.",
  ui_tue: "Weekday abbreviation: Tuesday.",
  ui_wed: "Weekday abbreviation: Wednesday.",
  ui_thu: "Weekday abbreviation: Thursday.",
  ui_fri: "Weekday abbreviation: Friday.",
  ui_sat: "Weekday abbreviation: Saturday.",
  ui_sun: "Weekday abbreviation: Sunday.",
  ui_nav_macros: "Sidebar item: the workspace's saved replies.",
  ui_macros_title: "Heading of the Macros page. A macro is a saved reply an agent applies with one click.",
  ui_macros_subtitle: "Line under the Macros heading. The promise that matters is the second half: a macro is written per language and the customer always receives their own.",
  ui_macro_new: "Button that opens the blank macro editor.",
  ui_macro_title_label: "Form label: the macro's name, which is what agents search by. Phrased as a purpose ('Ask for more detail'), not a code.",
  ui_macro_category: "Form label: an optional grouping name, so a long macro list stays navigable.",
  ui_macro_then_set: "Form label: the ticket status applied AFTER the agent sends the reply. Not when the macro is inserted.",
  ui_macro_no_status: "Option meaning the macro changes no status.",
  ui_macro_bodies: "Heading of the per-language body editors.",
  ui_macro_placeholders: "Button that inserts a placeholder into the body being edited.",
  ui_macro_placeholder_hint: "Help text under the insert buttons.",
  ui_macro_saved: "Confirmation after a macro is stored.",
  ui_macro_delete: "Button that removes a macro permanently.",
  ui_macro_edit: "Button that opens an existing macro in the editor.",
  ui_macro_cancel: "Button that closes the macro editor without saving.",
  ui_setup_title: "Heading of the setup checklist on the dashboard. Encouraging, not a warning — nothing is wrong.",
  ui_setup_progress: "Progress line. {done} and {total} are numbers.",
  ui_setup_done_all: "Shown when every setup step is complete, just before the card goes away for good.",
  ui_setup_dismiss: "Button that hides the setup checklist permanently (admins only).",
  ui_step_connect_channel: "Setup step: connect a messaging channel. Telegram/Viber/WhatsApp/SMS are product names — keep them.",
  ui_step_connect_channel_why: "One line saying why that step matters.",
  ui_step_first_ticket: "Setup step: the first customer message arrives and becomes a ticket.",
  ui_step_first_ticket_why: "One line saying why that step matters.",
  ui_step_invite_team: "Setup step: add teammates to the workspace.",
  ui_step_invite_team_why: "One line saying why that step matters.",
  ui_step_set_hours: "Setup step: configure the working week and hours the SLA clock respects.",
  ui_step_set_hours_why: "One line saying why. 'SLA' is a technical term the industry uses — keep it.",
  ui_step_write_macro: "Setup step: write a saved reply. 'Macro' is this product's term for it.",
  ui_step_write_macro_why: "One line saying why. The second half is the selling point: one macro, every language.",
  ui_alerts: "Header button opening the alert panel: things the desk needs a person to act on.",
  ui_alerts_none: "Empty state of the alert panel. Reassuring, not an error — nothing is wrong.",
  ui_alerts_mark_read: "Button clearing every alert currently listed.",
  ui_alert_sla_breached: "Alert reason: the ticket is past the time the workspace promised to reply by.",
  ui_alert_sla_at_risk: "Alert reason: the ticket is close to that deadline but has not missed it yet — there is still time to act.",
  ui_alert_unassigned_waiting: "Alert reason: nobody has taken the ticket. Not about lateness; about ownership.",
  ui_macro_retire: "Button that hides a macro from agents without deleting what was already sent under it.",
  ui_macro_restore: "Button that returns a retired macro to the agents' list.",
  ui_macro_retired: "Badge on a macro that is hidden from agents.",
  ui_macro_used: "How many times a macro has been applied. {n} is a number; the multiplication sign is used as 'times'.",
  ui_macro_never_used: "Shown instead of a count when a macro has never been applied.",
  ui_macro_none: "Empty state of the Macros page. It says what to do, not that something is missing.",
  ui_macro_apply: "Button in the reply composer that opens the macro picker.",
  ui_macro_search: "Placeholder of the macro picker's search box.",
  ui_macro_inserted_in: "Confirmation after a macro fills the composer. {lang} is a language name in its own script.",
  ui_macro_fallback_warning: "Warning when the macro had no body in the customer's language. {want} is the customer's language, {got} the one used. The agent must see this BEFORE sending, which is why it names the customer's language twice.",
  ui_macro_load_failed: "Error when the macro list could not be fetched. {error} is the reason.",
};

/**
 * Translate a string key, interpolating {placeholders}. Unknown language or
 * missing key falls back to English: a customer reading an English sentence in
 * an otherwise-Amharic exchange sees an untranslated string somebody can fix;
 * a customer reading "ticket_opened" sees a broken product.
 */
export function t(
  language: string | null | undefined,
  key: string,
  params: Record<string, string | number> = {},
): string {
  return translate(STRINGS, language, key, params);
}

/** `t()` for the staff console's own labels and messages. */
export function tUi(
  language: string | null | undefined,
  key: string,
  params: Record<string, string | number> = {},
): string {
  return translate(UI_STRINGS, language, key, params);
}

function translate(
  table: Record<Language, Record<string, string>>,
  language: string | null | undefined,
  key: string,
  params: Record<string, string | number>,
): string {
  const lang: Language =
    language && isSupportedLanguage(language) ? language : "en";
  const template = table[lang][key] ?? table.en[key];
  if (template === undefined) {
    throw new Error(`Unknown i18n key: ${key}`);
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** The whole table, for tests and the TSV export. */
export function allStrings(): Record<Language, Record<string, string>> {
  return STRINGS;
}

/** The console table, for tests and the TSV export. */
export function allUiStrings(): Record<Language, Record<string, string>> {
  return UI_STRINGS;
}

// ---------------------------------------------------------------- detection
//
// Ported from Bank Assist's classifier (minus Swahili, out of scope here).
// Rules-first: deterministic, testable, zero-latency, works offline.

const ETHIOPIC = /[ሀ-፿]/;
// The glottal series spelled with አ vs ኣ is the quickest orthographic tell
// between Amharic and Tigrinya in short chat messages.
const TIGRINYA_TELL = /[ኣ]|እየ|ኢኹም|ዲኹም|እዩ/;

// Deliberately excludes ultra-short tokens (fi, nu, ee, ku, la) — they
// collide across languages and with English, and a wrong positive costs more
// than a miss, because unmarked Latin text falls through to English by
// elimination below.
const OROMO_WORDS = new Set([
  "akkam", "maaloo", "tajaajila", "waan", "akkamitti", "danda", "qaba",
  "kootii", "koo", "guyyaa", "hangam", "waa'ee", "waee", "beekuu",
  "barbaada", "barbaade", "barbaadha", "maqaan", "maqaa", "eenyu", "maaliif",
  "eessa", "yoom", "keessan", "keessa", "irratti", "irraa", "waliin",
  "jedhama", "jirta", "jirtu", "jirtan", "galatoomi", "nagaa", "argachuu",
  "fayyadamuu", "kaffaltii", "kaffaluu", "yookaan", "immoo", "garuu",
  "dhiyeessuu", "hojjechuu", "rakkoo", "gargaarsa",
]);
const SOMALI_WORDS = new Set([
  "waan", "waxaan", "sidee", "fadlan", "maxay", "immisa", "adeegga",
  "waxa", "saabsan", "goorma", "xagee", "doonayaa", "rabaa", "ogaan",
  "mahadsanid", "magacaygu", "aniga", "adiga", "annaga", "iyaga", "maxaa",
  "macmiilka", "warqad", "dhibaato", "caawimaad", "su'aal", "jawaab",
]);
// Swahili is well-documented enough that this list did not need a native
// speaker to discover its disambiguation shape (the Bank Assist finding); it
// still needs one to confirm coverage before a pilot.
const SWAHILI_WORDS = new Set([
  "huduma", "nataka", "ninahitaji", "tafadhali", "habari", "asante",
  "jina", "langu", "yangu", "wapi", "lini", "vipi", "ngapi", "jinsi",
  "ninaweza", "kutuma", "tuma", "malipo", "kiasi", "maelezo", "msaada",
  "karibu", "samahani", "shida", "tatizo", "ujumbe", "jibu",
]);
const ENGLISH_WORDS = new Set([
  "the", "how", "what", "is", "my", "open", "can", "i", "to", "tell", "me",
  "more", "about", "your", "you", "do", "does", "are", "where", "when",
  "why", "which", "for", "with", "and", "need", "want", "have", "get",
  "send", "there", "this", "that", "would", "should", "could", "please",
  "of", "in", "on", "help", "problem", "order", "ticket", "call", "service",
]);

// How many unmarked Latin words before a message counts as English prose.
const LATIN_PROSE_WORDS = 3;

/**
 * Best-effort detection; null means "no signal, keep the conversation's
 * sticky language". Among the six supported languages only English, Afaan
 * Oromo, Somali and Swahili use Latin script, so unmarked Latin prose is
 * English by elimination — with a word-count floor so a bare "ATM" or "OK"
 * mid-Amharic conversation cannot flip the language (Bank Assist finding #5).
 */
export function detectLanguage(text: string): Language | null {
  if (ETHIOPIC.test(text)) {
    return TIGRINYA_TELL.test(text) ? "ti" : "am";
  }
  const words = new Set(text.toLowerCase().match(/[a-z']+/g) ?? []);
  if (words.size === 0) return null;
  let om = 0;
  let so = 0;
  let sw = 0;
  let en = 0;
  for (const w of words) {
    if (OROMO_WORDS.has(w)) om += 1;
    if (SOMALI_WORDS.has(w)) so += 1;
    if (SWAHILI_WORDS.has(w)) sw += 1;
    if (ENGLISH_WORDS.has(w)) en += 1;
  }
  const localBest = Math.max(om, so, sw);
  if (Math.max(localBest, en) === 0) {
    return words.size >= LATIN_PROSE_WORDS ? "en" : null;
  }
  if (en >= localBest) return "en";
  // Ties preserve the Bank Assist priority: om, then so, then sw — Swahili
  // is the newest and least-reviewed list, so it never wins a tie.
  if (om === localBest) return "om";
  return so === localBest ? "so" : "sw";
}
