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
  csat_ask:
    "CUSTOMER-FACING: sent once when a ticket is resolved, asking for a "
    + "satisfaction score. {number} is the ticket number. The reply format "
    + "must stay a plain 1-5 — it is typed on a phone keypad, sometimes over "
    + "SMS, and the parser accepts a bare number only. Keep the two anchors "
    + "(worst and best) so the scale is unambiguous without a legend.",
  csat_thanks:
    "CUSTOMER-FACING: the acknowledgement after a score is received. It must "
    + "NOT promise any further action — the ticket is closed and nobody is "
    + "coming back to them about it.",
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
  ui_ticket_update_failed: "Error when a ticket-rail change (status, priority, assignee, queue, customer) could not be saved — the select simply reverts to the server's value otherwise, with nothing telling the agent why. {error} is the reason (e.g. 'Forbidden' for an AUDITOR's read-only account).",
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
  ui_take_it: "Button that assigns the ticket to the signed-in agent (the control most desks call 'take it').",
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
  ui_satisfaction: "Ticket rail label for the customer's satisfaction score.",
  ui_wb_csat: "Wallboard stat: the average satisfaction score for tickets resolved today.",
  ui_csat_responses: "The denominator under the satisfaction average. {n} is a number — an average from one reply and from ninety are different facts, which is why the count is always shown.",
  ui_csat_none: "Shown where a ticket has no score and none was asked for.",
  ui_csat_awaiting: "Shown when the survey went out but the customer has not answered yet.",
  ui_tags: "Ticket rail heading: what the ticket is ABOUT, as opposed to which channel it came from or which queue handles it.",
  ui_tag_add: "Placeholder of the box where an agent types a new or existing tag.",
  ui_tag_none: "Shown on a ticket carrying no tags.",
  ui_tag_remove: "Accessible label of the small x that takes a tag off a ticket.",
  ui_tag_filtering: "Banner on the ticket list when it was opened by clicking a tag. {tag} is the tag name, which is user content and is never translated.",
  ui_tag_failed: "Error when a tag could not be saved. {error} is the reason.",
  ui_nav_reports: "Sidebar item: historical reporting, as opposed to the live wallboard.",
  ui_reports_title: "Heading of the reports page.",
  ui_reports_subtitle: "Line under it. The comparison with the previous period is the point of the page.",
  ui_range_7: "Date-range option: the last seven days.",
  ui_range_30: "Date-range option: the last thirty days.",
  ui_range_90: "Date-range option: the last ninety days.",
  ui_rep_volume: "Metric: how many tickets were opened in the period.",
  ui_rep_first_response: "Metric: the MIDDLE time to first reply, not the average — one very late ticket must not move it.",
  ui_rep_resolution: "Metric: the middle time from opening to resolved.",
  ui_rep_on_time: "Metric: the share of answered tickets whose first reply beat its SLA promise.",
  ui_rep_topics: "Chart heading: the most common tags. Phrased as the question a manager is actually asking.",
  ui_rep_languages: "Chart heading: which languages customers wrote in. This is the report no competitor in this market produces.",
  ui_rep_no_tags: "Empty state of the topics chart. It says what to do, not that something is missing.",
  ui_delta_better: "Change vs the previous period, in the good direction. {pct} is a percentage like '25%'.",
  ui_delta_worse: "Change vs the previous period, in the bad direction. {pct} is a percentage.",
  ui_delta_too_few: "Shown instead of a change when there were too few tickets for a comparison to mean anything. A percentage on three tickets is noise, and printed next to an arrow it gets repeated as a trend.",
  ui_delta_no_previous: "Shown when the previous period has no data to compare against.",
  ui_rep_of_n: "The denominator under a metric. {n} is how many observations it rests on.",
  ui_no_data: "Shown where a chart or metric has nothing in the chosen period.",
  w_kb_intro: "CUSTOMER-FACING (widget): shown above suggested articles, BEFORE a ticket is opened. It offers, never asserts — the search may be wrong.",
  w_kb_helpful: "CUSTOMER-FACING (widget): the customer confirms an article answered them, and no ticket is created.",
  w_kb_still: "CUSTOMER-FACING (widget): the customer rejects the suggestions; their original message is sent as normal. This must always be available — a customer must never be trapped in a search result.",
  w_kb_read: "CUSTOMER-FACING (widget): expands a suggested article to read it.",
  ui_nav_kb: "Sidebar item: the knowledge base.",
  ui_kb_title: "Heading of the knowledge base page.",
  ui_kb_subtitle: "Line under it. The point is stated plainly: an answer found is a ticket never created.",
  ui_kb_new: "Button opening the blank article editor.",
  ui_kb_article_title: "Form label: the article's title, per language. It is what a customer is offered, so it must read as an answer to a question.",
  ui_kb_article_body: "Form label: the article body, per language.",
  ui_kb_published: "Badge on an article customers can be shown.",
  ui_kb_draft: "Badge on an article only staff can see.",
  ui_kb_publish: "Button making an article visible to customers.",
  ui_kb_unpublish: "Button hiding an article from customers again.",
  ui_kb_deflections: "How many customers this article answered without a ticket being opened. {n} is a number. This counts only customers who SAID it answered them, not views.",
  ui_kb_none: "Empty state of the knowledge base. It says what to do, not that something is missing.",
  ui_macro_unknown_placeholder: "Warning under the macro preview when the body uses a token we do not know — usually a typo like {{custmer.name}}. {n} is a count, {list} the tokens themselves. It matters because an unknown token is SILENTLY DELETED from what the customer receives: without this the author sees a sentence with a hole in it and no reason why.",
  ui_macro_preview: "Heading of the live preview beside the macro editor. Phrased from the CUSTOMER's side on purpose — the point of the preview is that an author writes a template but a person reads a message.",
  ui_macro_preview_empty: "Empty state of the preview. Says what will appear, not that something is missing.",
  ui_macro_preview_sample: "Under the preview. Says plainly that the values are examples, so nobody mistakes the sample name for something that will actually be sent.",
  ui_appearance: "Accessible label on the theme control in the top bar, and the heading of the choice it opens. It is the OS-level word for light/dark preference, not a word about colour — 'Theme' would collide with per-tenant branding, which is a different thing entirely.",
  ui_appearance_light: "The light theme. One word — it sits in a narrow menu beside an icon.",
  ui_appearance_dark: "The dark theme. One word.",
  ui_appearance_system: "Follow the device's own light/dark setting rather than choosing. Should read as 'whatever my phone or computer is set to', NOT as a technical word like 'System' or 'Automatic' — many users here have never seen an OS setting named that way, and the point is that it changes by itself at dusk.",
  ui_rail_collapse: "Control at the foot of the app navigation that folds it to icons. One word — it sits in a 210px rail and must not wrap.",
  ui_rail_expand: "The same control once folded, where only an icon and a tooltip are visible. Says what will EXPAND, since at 56px there is no context to infer it from.",
  ui_sections_hide: "The same fold control on Settings, where the rail holds SECTIONS rather than saved views. 'Hide views' on a page with no views in it is the console describing its own plumbing.",
  ui_sections_show: "The same control once the Settings rail is folded.",
  ui_views_hide: "Button above the page content that folds the saved-views rail away. 'Views' is the same word used for the rail's own heading.",
  ui_views_show: "The same button once the views rail is folded. It lives on the CONTENT side because the rail it opens is zero pixels wide when shut.",
  ui_setup_webhook_meta: "Replaces the 'send the secret in this header' line on the Meta cards, where that instruction would be WRONG: Meta computes X-Hub-Signature-256 from the app secret itself, so there is nothing for the operator to send. Saying otherwise sends somebody looking for a setting that does not exist.",
  ui_macro_actions: "Heading of the macro editor's action list. Phrased as a WHEN clause, because the list that follows reads as its consequences — 'When this macro runs: set status, add tags'.",
  ui_macro_actions_empty: "Shown when a macro only sends words. States the consequence plainly so an empty list does not read as a broken control.",
  ui_macro_action_status: "Row label: the action that changes the ticket's status.",
  ui_macro_action_priority: "Row label: the action that changes the ticket's priority.",
  ui_macro_action_tags: "Row label: the action that adds tags.",
  ui_macro_action_remove: "Accessible label on the × that deletes an action row, and on the × on each individual tag.",
  ui_macro_tag_placeholder: "Inside the tag box. Names the key that commits, because nothing else on screen says a comma or Enter is what adds it.",
  ui_macro_does_status: "One line of the summary under a macro in the list, saying what it does besides sending words. {value} is a status name.",
  ui_macro_does_priority: "As above, for priority. {value} is a priority name.",
  ui_macro_does_tags: "As above, for tags. {list} is the tags themselves, comma-separated — the names matter more than the count, so they are shown rather than a number.",
  ui_tab_workspace: "First section of Settings: the desk's own identity. 'Workspace' rather than 'General' — it names the thing being configured instead of the leftovers drawer.",
  ui_ws_identity: "Heading of the name + time zone card.",
  ui_ws_name: "The organization's display name.",
  ui_ws_name_hint: "Says WHERE a customer sees it, because that is what makes it worth getting right.",
  ui_ws_address: "The workspace slug, shown read-only.",
  ui_ws_address_hint: "Why it cannot be changed. The reason is stated rather than left as a greyed-out box: the slug is inside the widget snippet on the customer's own site and inside every webhook URL a gateway has been pointed at.",
  ui_ws_timezone: "The zone business hours and SLA deadlines are counted in.",
  ui_ws_timezone_hint: "Names the consequence, since a time zone setting with no stated effect reads as decoration.",
  ui_ws_languages: "Heading: which languages this desk staffs. Phrased as what the TEAM does, not as a feature list.",
  ui_ws_languages_hint: "The rule in one line — a customer gets their own language if it is one of these.",
  ui_ws_default_language: "The fallback language. Deliberately NOT called 'default': what it means is what happens when detection fails, and 'fall back to' says that where 'default' does not.",
  ui_ws_default_hint: "When the fallback is used.",
  ui_ws_error_name: "Save refused: no name.",
  ui_ws_error_name_long: "Save refused: name over the limit.",
  ui_ws_error_timezone: "Save refused: unrecognised time zone.",
  ui_ws_error_no_languages: "Save refused: no languages ticked. An empty set is not 'all languages', it is a desk that cannot answer anybody.",
  ui_ws_error_default_unserved: "Save refused: the fallback is a language the desk does not staff. This is the one that fails SILENTLY without the check — every field looks valid on its own, and customers get replies in a language nobody on the team reads.",
  ui_ws_error_default: "Save refused: no fallback language chosen.",
  ui_sla_explainer: "Above the four rows of minute boxes. Says what the two promises MEAN and that they are what colours the inbox — without it the section is a form rather than a decision.",
  ui_st_done: "The combined finished state on the dashboard overview — resolved and closed together. Both mean 'not on anybody's desk', and splitting them would push the chart past the number of hues that stay distinguishable under colour-blindness. They stay separate everywhere a ticket is actually worked.",
  ui_overview_title: "Heading of the lifecycle card on the dashboard.",
  ui_overview_blurb: "The sentence under the title. Says what the card is FOR and that the rows are clickable — so nobody has to click to find out whether clicking does anything. 'Tap' rather than 'click' because most readers are on a phone.",
  ui_overview_total: "Label under the hero number. Shown in small caps.",
  ui_overview_clear: "Puts the drill-down card away. One word — it sits opposite a title in a narrow header.",
  ui_overview_recent: "Says what the drill-down list is, since 'the six most recent' and 'all of them' look identical when there are five.",
  ui_overview_see_all: "Link out of the drill-down to the full filtered list. {n} is the count, so the reader knows whether the six they can see are most of it or a fraction.",
  ui_macro_cov_all: "The macros list, when every language is written. Replaced six coloured pills per card: they were the loudest thing on the card and the least important information on it, and the reader still had to COUNT them to learn anything.",
  ui_macro_cov_missing: "The same line when a macro is partly written. NAMES the missing languages rather than only counting them — '4 of 6' makes the reader open the editor to find out which two.",
  ui_macro_cov_empty: "A macro with no body in any language. A draft nobody has started, which is a different problem from a nearly-finished one with holes — saying 'missing six languages' about it is true and useless.",
  ui_wb_all_clear: "The wallboard's headline when nothing is open and nothing is late. Four zeros in a row is not a status, it is the absence of one, and on a black screen across a room it reads as a broken panel.",
  ui_wb_on_time: "The same headline when there IS work but none of it is late. {n} is the open count — the good news is about the promises, not about being idle.",
  ui_wb_no_queues: "TITLE of the empty state replacing the queue table when no queues exist. A header row with nothing beneath it is the shape of a broken table. Kept short — the explanation is the hint below it.",
  ui_wb_no_queues_hint: "The sentence under that title. Says why the board is empty AND what to do about it, so the empty state is a route rather than a dead end.",
  ui_wb_nothing_yet: "Stands in for a median or a score the desk has not produced yet. Replaces an em-dash: three stacked dashes is what a BROKEN panel looks like, where words say the desk is simply quiet.",
  ui_wb_agents_blurb: "The sentence under the Agents heading. Says what the numbers beside each name mean and that tapping one is a destination — nobody should have to click to find out whether clicking does anything.",
  ui_ai_draft: "Button in the reply composer that writes a first draft from the conversation and the desk's own published articles. It DRAFTS — nothing is sent until the agent presses Send, and the wording must not imply otherwise.",
  ui_ai_drafting: "The same button while the model is working.",
  ui_channel_missing: "Shown when a channel key in the URL is not one the product supports — a renamed or mistyped address.",
  ui_channel_missing_hint: "The way back out of that.",
  ui_channel_page_blurb: "Under the credentials heading on a channel's own page. Says the values are the provider's, and that they are stored encrypted.",
  ui_channel_needs_blurb: "Under the requirements heading — what the provider asks for before the channel can go live.",
  ui_ch_telegram: "PROPER NOUN — leave exactly as it is in every language. A channel's name in the sidebar.",
  ui_ch_whatsapp: "PROPER NOUN — leave exactly as it is.",
  ui_ch_messenger: "PROPER NOUN — leave exactly as it is.",
  ui_ch_instagram: "PROPER NOUN — leave exactly as it is.",
  ui_ch_viber: "PROPER NOUN — leave exactly as it is.",
  ui_ch_ussd: "PROPER NOUN / technical term — leave as USSD. It is what the telecom calls it and what a customer dials.",
  ui_ch_web: "The chat bubble hosted on the organization's own website. Generic, so it translates.",
  ui_ch_sms_channel: "The SMS channel in the sidebar. Kept as the local abbreviation where one is in use.",
  ui_ch_email: "The email channel in the sidebar.",
  ui_customers_none_title: "TITLE of the customers empty state. The existing ui_customers_none is the sentence UNDER it — it was doing both jobs as one muted line at the top-left of a box, which reads as a panel that failed to load.",
  ui_lang_unset: "The empty option of the language picker on the log-a-ticket form — the desk's own default will be used. Was showing 'No name', which is a different field's string entirely.",
  ui_ch_sms: "A third way a ticket reaches the desk, logged by hand: a text message read out. Logging one as a phone call makes the channel report wrong.",
  ui_new_suggested: "Heading of the right-hand rail on the log-a-ticket page. Desk products show 'similar resolved tickets' here; this desk shows its own knowledge base, which is the thing that can actually be read out to the customer.",
  ui_new_suggested_blurb: "The sentence under it. Says WHEN to use them — while the customer is still on the line, not after hanging up.",
  ui_new_suggested_none: "Shown before a subject is typed. Says what will appear rather than leaving an empty panel.",
  ui_attach_file: "Button that opens the file picker on a ticket.",
  ui_attach_record: "Button that starts recording a voice note at the desk — for a voicemail an agent takes down, or a note left for whoever picks the ticket up.",
  ui_attach_stop: "Stops the recording. One word: it sits next to a running timer.",
  ui_attach_remove: "Removes a queued file before it is uploaded.",
  ui_attach_voice_note: "Label for a queued recording. {d} is its length as m:ss — the filename is meaningless for something recorded seconds ago.",
  ui_attach_count: "Caption under the stored attachments. {n} is how many.",
  ui_attach_mic_denied: "Shown when the microphone is unavailable or permission was refused. Names the cause and the fix — a record button that does nothing when pressed is the alternative.",
  ui_attach_some_failed: "The ticket WAS created but one or more files failed. {list} names them. Never reported as a failed ticket: the ticket exists and losing it would be worse than losing a screenshot.",
  ui_customer_new: "Opens the new-customer fields on the log-a-ticket form. Shown as a deliberate choice — the fields used to appear whenever a search came back empty, which is also what a half-typed name looks like.",
  ui_no_name: "Stands in for a contact with no name recorded. Was an em-dash, which reads as broken rather than as unknown.",
  ui_customer_phone_bad: "Shown BESIDE the phone field as it is typed. The old wording arrived as a red banner at the top of the page after submit, pointing at a field the form did not have — the search box was being sent as the phone number.",
  ui_customer_phone_cc: "Label for the dialling-code picker beside the phone field. A picker rather than something the agent has to remember.",
  ui_customer_identity_why: "Explains why a phone or an email is needed, at the point of asking. Stated as a reason, not as a refusal after the fact.",
  ui_new_need_customer: "Why the log button is disabled: no customer chosen yet. A disabled control with no reason attached is a dead end one step earlier than an error.",
  ui_new_need_subject: "Why the log button is disabled: no subject yet.",
  ui_ticket_no_reply_walk_in: "The no-reply warning for a WALK-IN. The phone wording said to call them back, which is wrong for somebody at the counter who may have left no number.",
  ui_kb_untitled: "An article with no title in any language. Was rendered as an em-dash, which reads as broken rather than as unfinished.",
  ui_kb_search: "Placeholder in the knowledge base's search box. Searches titles AND bodies in every language, so an Amharic article is findable from an English console.",
  ui_kb_summary: "The line above the article grid. {n} in view, {ready} written in all six. The second number is the one being managed: how many a customer can read in their own language.",
  ui_kb_summary_one: "The same line for exactly one article. Every language carries its own singular rather than interpolating into a translated plural.",
  ui_kb_no_match: "Shown when a search or status filter matches nothing — distinct from having no articles at all.",
  ui_rep_nothing_yet: "Stands in for a report figure the window produced none of. Four em-dashes across a row of tiles reads as a report that FAILED TO LOAD — the same defect ADR 0028 removed from the wallboard, on a page nobody had screenshotted.",
  ui_rep_volume_blurb: "Under the volume chart's title. Says the empty days are drawn on purpose, because a chart built only from days that had tickets turns a quiet week into a flat line at the busy level.",
  ui_rep_volume_peak: "The chart's reading, in a sentence: {n} tickets on {date}. A single bar at one end of a ninety-slot chart carries shape but no number.",
  ui_rep_no_volume: "Replaces the chart when the whole window is empty. A row of hairlines along a baseline is not a chart, it is a chart that looks broken.",
  ui_rep_no_volume_hint: "The sentence under it, and the way out: widen the range, or connect a channel.",
  ui_wb_today: "Heading on the wallboard's medians card. Was 'New today', which collides with the TILE of the same name counting tickets — two different facts under one label.",
  ui_wb_today_blurb: "The sentence under it. 'Since midnight' rather than 'today' because a supervisor reading this at 1am needs to know which day it means.",
  ui_macro_filter_all: "The category filter's first pill — no category filter applied. One word.",
  ui_macro_summary: "The line above the macro grid. {n} macros in view, {ready} of them written in all six languages. The second number is the one an admin is actually managing.",
  ui_macro_summary_one: "The same line when exactly one macro is in view. English needs it for the count noun ('1 macros' is what a filter that matched once produced); every other language gets its own singular rather than a translated plural.",
  ui_macro_no_match: "Shown when a search or category filter matches nothing. Distinct from having no macros at all — the desk HAS macros, this filter just found none.",
  ui_macro_no_match_hint: "The sentence under it, which is the way back out. An empty state with no route is a dead end.",
  ui_setup_provider: "Picker shown when one channel has several vendors behind it — SMS in Ethiopia runs through AfroMessage, GeezSMS or FalconVAS.",
  ui_setup_optional: "Suffix on a field label that is not required. Lower case, it reads as an aside rather than a second label.",
  ui_setup_save: "The button that stores a channel's credentials. 'Connection', not 'settings' — what is being saved is the link to the outside world.",
  ui_setup_saving: "The same button mid-request.",
  ui_setup_saved: "Confirmation beside the button.",
  ui_setup_secret_once: "Shown with a freshly generated webhook secret. Must convey URGENCY: the value is never displayed again and saving anew mints a different one, so a reader who scrolls past has to start over.",
  ui_setup_webhook_title: "Heading above the INBOUND address. This is the half of a connection an operator cannot guess and nothing used to display — credentials alone only tell the desk how to send, never how to receive.",
  ui_setup_webhook_header: "Says which HTTP header carries the secret. {header} is a literal header name and is never translated.",
  ui_setup_from_address: "The address a customer sees replies come from. Phrased as a sentence fragment the field completes.",
  ui_setup_from_hint: "Why the domain has to be verified. The consequence — landing in spam — matters more than the rule, so it is stated.",
  ui_setup_send_url: "The provider's outbound API endpoint.",
  ui_setup_send_url_hint: "The body shape we post. Field names are literal JSON keys and stay in English in every language.",
  ui_setup_auth_value: "The API key or token itself. Deliberately not 'API key': for some providers it is a bearer token and for others a raw secret.",
  ui_setup_auth_value_hint: "Reassurance about where a credential goes, on the one screen where somebody is asked to paste one.",
  ui_setup_auth_header: "Which HTTP header the credential travels in.",
  ui_setup_auth_header_hint: "Names the default and the one provider that differs. Header names are literals and never translated.",
  ui_setup_sender_id: "The short alphanumeric name an SMS appears to come from.",
  ui_setup_phone_number_id: "Meta's numeric id for a WhatsApp number — not the phone number itself, which is a common and costly confusion.",
  ui_setup_access_token: "Meta's long-lived token for sending.",
  ui_setup_app_secret: "Meta's app secret, used to verify that a delivery really came from them.",
  ui_setup_verify_token: "A phrase WE choose and Meta echoes back during the handshake.",
  ui_setup_verify_hint: "Says plainly that the operator invents this one, because every other field on the card is copied FROM Meta and people reasonably assume this one is too.",
  ui_tabs_close: "Accessible label on the × of an open-ticket tab.",
  ui_tabs_unsaved: "Marker on a tab whose composer holds text that has not been sent. Short — it shares a narrow tab with the subject.",
  ui_tabs_close_confirm: "Asked before closing a tab that holds an unsent reply. The whole reason tabs are safe is that they never lose typing, so this is the one place a confirmation earns its interruption.",
  ui_nav_more: "The fifth item in the phone's bottom bar, opening everything that does not fit. Must be SHORT — it shares a 390px row with four other labels, and the bar overflowed horizontally when the labels were long.",
  ui_context_show: "Button that opens the right-hand context panel. One word — it sits in a crowded top bar. It is the SAME control that closes the panel; the label changes to ui_context_hide when it is open.",
  ui_context_hide: "The same button once the panel is open.",
  ui_customer_reach: "Heading of the rail on a customer's record. The question it answers is 'can the desk actually message this person', which is not the same as what contact details are on file.",
  ui_customer_channels_used: "Label above the list of channels this customer has actually written in on.",
  ui_customer_no_channels: "Shown for a customer who only exists because staff logged calls for them. The desk genuinely cannot send them anything, and saying so is the point.",
  ui_customer_call: "A tel: link. Opens the phone app or a softphone.",
  ui_customer_email_them: "A mailto: link. Deliberately the operator's own mail client — a message sent from there is NOT on the ticket, which is why it sits under 'how to reach them' rather than beside the reply box.",
  ui_new_ticket_context: "Heading of the panel beside the log-a-ticket form: what this customer has contacted you about before.",
  ui_new_ticket_no_context: "Empty state of that panel before a customer is chosen. Says what will appear rather than that something is missing.",
  ui_customer_since: "Shown on a customer's page. {date} is a formatted date. 'Customer since' rather than 'created' — the record is about a relationship, not a row.",
  ui_customer_open_tickets: "Stat label on a customer's page: how many of their tickets are open right now.",
  ui_customer_total_tickets: "Stat label on a customer's page: how many tickets they have ever opened.",
  ui_customer_edit: "Button that turns the customer's details into an editable form.",
  ui_customer_new_ticket: "Button on a customer's page that starts a ticket already attached to them. The point is that a known caller does not get re-identified.",
  ui_customer_notes_hint: "Under the notes field. Says plainly that notes are internal — an agent who is unsure will otherwise write nothing useful.",
  ui_customer_no_notes: "Empty state where a customer has no notes.",
  ui_customer_saved: "Brief confirmation after saving a customer's details.",
  ui_customer_back: "Link from one customer's page back to the directory.",
  ui_customer_open_record: "Link from a ticket's customer rail through to that customer's full record.",
  ui_quick_add: "The quick-create button in the top bar. One word — it sits next to the search box.",
  ui_add_ticket: "Menu item: record a ticket that did not arrive on a channel.",
  ui_add_customer: "Menu item: record a person.",
  ui_customers: "Nav item and page title for the customer directory.",
  ui_customers_subtitle: "Says what the directory is FOR, not what it contains.",
  ui_customers_none: "Empty state. Names both ways a customer gets recorded, so it is a next step rather than a statement that something is missing.",
  ui_customer_search: "Placeholder in the directory search box.",
  ui_customer_name: "Field label.",
  ui_customer_phone: "Field label.",
  ui_customer_email: "Field label.",
  ui_customer_notes: "Field label for free text staff keep about a customer.",
  ui_customer_language: "Field label. 'Prefer' matters — it is the language the desk will WRITE to them in, not one detected once.",
  ui_customer_phone_hint: "Explains why the phone number is required. It is the identity, not a contact detail.",
  ui_customer_existing: "Shown when saving a 'new' customer matched somebody already on file. Not an error — the right thing happened and the agent should know.",
  ui_customer_tickets: "Count on a directory row. {n} is a number. Deliberately a LABEL plus a number rather than \"{n} tickets\" — embedding a count inside a noun phrase needs plural rules, and they differ across all six languages, so an inflected form would be wrong in most of them. Keep the noun uninflected.",
  ui_customer_history: "Heading above a customer's past tickets.",
  ui_customer_no_history: "Empty state on a customer with no tickets.",
  ui_new_ticket_title: "Title of the manual ticket form. 'Log' not 'create' — the work already happened, this is recording it.",
  ui_new_ticket_subtitle: "Says which situations this form is for.",
  ui_ticket_subject: "Field label, phrased as the question an agent would actually ask.",
  ui_ticket_description: "Field label for what the customer said.",
  ui_ticket_description_hint: "Explains that this is recorded as the CUSTOMER's words on the timeline, so an agent does not write it as a reply.",
  ui_ticket_how: "Field label for the channel picker on a manual ticket.",
  ui_channel_phone_call: "Channel option: a call the agent took.",
  ui_channel_walk_in: "Channel option: somebody physically present.",
  ui_ticket_customer: "Field label for the person the ticket is about. Also the inbox column heading.",
  ui_ticket_customer_find: "Placeholder for the customer picker: search existing OR type a new number to create one inline.",
  ui_ticket_no_reply_warning: "Shown on a ticket with no channel behind it. The desk genuinely cannot send a message to a logged phone call — but it used to stop there, which left the agent with a dead end and the ticket with a first-response clock that could never be stopped. It now names the way out: call them back, then record it.",
  ui_log_reply: "Composer mode on a ticket the desk cannot send on: record a reply the AGENT delivered themselves (a callback, a word at the counter). Must not read as though the desk sends anything — it does not.",
  ui_log_reply_placeholder: "Placeholder for that recording. Past tense on purpose: the call already happened, this is the record of it, not a message about to go out.",
  ui_log_it: "The button that saves that record. Deliberately NOT 'Send' — nothing is sent.",
  ui_msg_off_channel: "Badge on a timeline message the agent delivered themselves rather than the desk. The next agent reading the thread must be able to tell an asserted callback from a message the desk actually carried.",
  ui_ticket_created: "Confirmation after logging. {n} is the ticket number.",
  ui_identify_customer: "Button on a ticket that arrived anonymously.",
  ui_identify_hint: "Explains that naming the customer also teaches the CONVERSATION who they are, so the next message already knows.",
  ui_bulk_macro: "Bulk-action button: apply one saved reply to every selected ticket.",
  ui_bulk_macro_review: "Heading of the confirmation shown BEFORE a bulk send. In bulk there is no composer to read, so this screen is the only review that happens.",
  ui_bulk_macro_group: "One line per language in the batch. {n} is a count, {lang} a language name in its own script. Grouping by language is the point: the same button sends different texts and the agent reads at most one of them fluently.",
  ui_bulk_macro_fellback: "Warning within a language group: some customers wrote in a language this macro has no text for, so they receive a different one. {n} is a count, {from} the language they WROTE in (the one that is missing), {lang} the language they will RECEIVE. Naming {from} is the point — it is the language somebody would have to write for this not to happen again. An earlier version named only the received language, which read as 'they have no English text' about the people being given English.",
  ui_bulk_macro_undeliverable: "Warning that some selected tickets have no channel to reply on (a walk-in, a logged phone call) and will be skipped. {n} is a count.",
  ui_bulk_macro_send: "The button that actually sends. It names the number of PEOPLE, not tickets — that is what makes the weight of it clear.",
  ui_bulk_macro_sending: "Button text while a bulk send is running.",
  ui_bulk_macro_sent: "Confirmation after every message was delivered. {n} is a count.",
  ui_bulk_macro_partial: "Confirmation after a PARTIAL send. {sent} and {failed} are counts. Reporting the failures is the point — '40 sent' when 37 were is the failure this wording exists to prevent.",
  ui_bulk_macro_nothing: "Shown when no selected ticket has a channel to reply on, so there is nothing to send.",
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

  // Data lifecycle. REVIEWER: this group describes PERMANENT DESTRUCTION of a
  // customer's data. Nothing here may read as reversible, and nothing may
  // soften what happens — an administrator who misreads one of these sentences
  // cannot undo the result by re-reading it. Prefer the plainest everyday verb
  // for "delete" in your language over a technical or legal one; the reader is
  // a desk manager, not a lawyer.
  // Auto-answer. REVIEWER: this group is about the desk replying to a customer
  // with NO member of staff involved. The register must stay plain and factual
  // — never enthusiastic, never "smart"/"AI-powered" marketing language. An
  // administrator reading this is deciding whether to let software speak in
  // their organisation's name, and overselling it is how they turn it on
  // without understanding it.
  ui_aa_title: "Heading of the auto-answer card on the Knowledge page.",
  ui_aa_blurb: "What it does. Both halves matter and neither may be dropped: it answers from PUBLISHED articles, and anything uncertain still reaches a person. The second half is what makes the first acceptable.",
  ui_aa_on: "State label when auto-answering is active. A STATE, not an action — it sits in a badge, never on a button.",
  ui_aa_turn_on: "The button that switches it on. Must be an ACTION and must read differently from ui_aa_on: the badge and the button sit inches apart, and two identical words made it impossible to tell which was the current state and which was what would happen if you pressed it.",
  ui_aa_turn_off: "The button that switches it off. Same rule against ui_aa_off.",
  ui_aa_off: "State label when it is not. This is the DEFAULT and the safe state — it must not read as something being broken or missing.",
  ui_aa_no_articles: "Shown when nothing is published, so turning it on would change nothing. It must read as 'you have a step left', not as an error.",
  ui_aa_counts: "Article counts. {published} and {drafts} are numbers; the separator is a middle dot.",
  ui_aa_answered: "How many customer messages have been answered with no agent. {n} is a number.",
  ui_aa_no_model: "Shown when the deployment has no AI configured, so the switch would have no effect. A statement of fact about the deployment, not a fault the reader caused.",
  ui_aa_admin_only: "Shown to a non-admin looking at the switch.",
  ui_aa_failed: "Error when the setting could not be saved. {error} is the reason.",
  ui_aa_badge: "Badge on a message in the ticket timeline that the desk sent by itself. An agent scanning a conversation must be able to tell at a glance which words were theirs and which were not.",
  ui_cancel: "A generic Cancel button. Used on the erase-a-customer confirmation, where it is the way out of a destructive action — so it must read as clearly as the destructive button beside it, not as a smaller or softer option.",
  ui_attachments: "Heading over the files on a ticket — screenshots, scanned forms, voice notes.",
  ui_data_lifecycle: "Title of the retention section in Settings — the workspace's policy on how long data is kept.",
  ui_data_lifecycle_blurb: "Line under that title. The second half is a warning and must stay a warning: erasure is permanent and nothing comes back.",
  ui_retention_tickets: "Label for the window that governs messages and files on closed tickets.",
  ui_retention_tickets_hint: "Help text under it. Two facts, both load-bearing: the CONTENT goes, and the ticket record stays so reports are unaffected. An administrator who thinks their statistics will change will never turn this on.",
  ui_retention_audit: "Label for the window that governs the log of who did what.",
  ui_retention_audit_hint: "Help text under it. 'At least as long' is the rule the product enforces — keep it as an instruction, not a suggestion.",
  ui_retention_forever: "The option that keeps data indefinitely. This is the DEFAULT and the safe choice; it must not sound like an omission or an unset value.",
  ui_retention_days: "A window length. {n} is a number of days. Use your language's natural way of counting days — the number may come before or after the noun.",
  ui_retention_save: "Button that stores the policy.",
  ui_retention_saved: "Confirmation after the policy is stored.",
  ui_retention_not_scheduled: "Warning shown when the deployment has no scheduler configured, so a window is set but nothing acts on it. It must read as 'your policy is not running yet', not as an error the reader caused.",
  ui_retention_err_below_minimum: "Refusal when the window typed is too short. {n} is the minimum in days. The second sentence gives the reason — keep it, because the number alone reads as an arbitrary limit.",
  ui_retention_err_above_maximum: "Refusal when the window typed is too long. {n} is the maximum in days. It points at the Keep forever option, which must match ui_retention_forever exactly.",
  ui_retention_err_not_integer: "Refusal when the value typed is not a whole number.",
  ui_retention_err_audit_short: "Refusal when the audit window is shorter than the content window. The point: the record of a deletion must outlive the deletion.",
  ui_retention_failed: "Error when the policy could not be saved. {error} is the reason.",
  ui_redacted: "Shown IN PLACE OF a message whose words were erased. An agent reads this where the customer's sentence used to be, so it must be recognisable as the system speaking, never as something the customer wrote.",
  ui_redacted_file: "Shown in place of a file whose contents were erased. The file's name is gone too.",
  ui_erased_on: "Date stamp next to an erased customer. {date} is already formatted.",
  ui_erase_customer: "Button that erases one customer's personal data on their request. Admin only.",
  ui_erase_blurb: "Explanation next to that button. Same two facts as the ticket hint: everything identifying goes, the ticket counts stay.",
  ui_erase_confirm: "Instruction in the confirmation box. {word} is ui_erase_confirm_word IN THE SAME LANGUAGE — do not write the English word here.",
  ui_erase_confirm_word: "THE WORD THE ADMINISTRATOR MUST TYPE to confirm an erasure. It is compared against what they type, so it must be a word a person can type on an ordinary keyboard in your language, short, and unmistakably about deleting. Latin-script languages use upper case; Ge'ez has no case, so write it plainly.",
  ui_erase_done: "Confirmation after an erasure. {messages} and {files} are counts.",
  ui_erase_failed: "Error when an erasure did not complete. {error} is the reason.",
  ui_erased_badge: "Badge on a customer record whose personal data has been erased.",
  ui_export_customer: "Button that downloads everything the desk holds about one customer, for handing to them on request.",
  ui_export_audit: "Button that downloads the audit log as a spreadsheet file.",
  ui_export_audit_blurb: "Explanation on the audit-export card. It says what the file CONTAINS and who it is for — an auditor or a board pack — rather than repeating the retention rule stated above it.",
  ui_export_failed: "Error when a download could not be produced. {error} is the reason.",
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
export {
  cleanWorkspaceProfile,
  humanMinutes,
  MAX_ORG_NAME,
  TIMEZONES,
  type ProfileResult,
  type Timezone,
  type WorkspaceProfile,
} from "./workspace";
