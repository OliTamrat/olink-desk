// The channel list, as navigation.
//
// Ported from Olink Bank Assist: each channel is a destination of its own
// rather than a section of one long page. Connecting WhatsApp and connecting
// SMS are separate jobs done on separate days, and a URL per channel means one
// can be sent to whoever holds that provider's account.
//
// Deliberately STATIC. The sidebar renders on every page, and a sub-nav that
// waited on `/api/channels` would either flash in after paint or make every
// screen in the console pay for a request it does not use. The set of channels
// the product supports is a fact about the code, not about a workspace — what
// varies per workspace is each one's *status*, and that belongs on the page,
// not in the rail.
//
// The order is the order a desk actually connects them: Telegram and the
// widget are self-serve and take minutes; the Meta three need a verified
// business; SMS needs an aggregator contract; USSD needs a telecom agreement.

export interface ChannelNavItem {
  key: string;
  /** The i18n key for its name — never a hardcoded English label. */
  labelKey: string;
}

export const CHANNEL_NAV: ChannelNavItem[] = [
  { key: "telegram", labelKey: "ui_ch_telegram" },
  { key: "web", labelKey: "ui_ch_web" },
  { key: "whatsapp", labelKey: "ui_ch_whatsapp" },
  { key: "messenger", labelKey: "ui_ch_messenger" },
  { key: "instagram", labelKey: "ui_ch_instagram" },
  { key: "viber", labelKey: "ui_ch_viber" },
  { key: "sms", labelKey: "ui_ch_sms_channel" },
  { key: "email", labelKey: "ui_ch_email" },
  { key: "ussd", labelKey: "ui_ch_ussd" },
];

export const CHANNEL_KEYS = new Set(CHANNEL_NAV.map((c) => c.key));

export function channelHref(key: string): string {
  return `/channels/${key}`;
}
