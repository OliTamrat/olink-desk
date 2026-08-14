// Where customers can reach a tenant's desk, and what each channel actually
// costs to connect — the "honest catalogue" pattern ported from Bank Assist.
//
// Served to the Settings screen so the page states the position honestly
// instead of showing greyed-out logos that imply a switch nobody has flipped.
//
// A channel is an adapter, not a rewrite: the desk core takes text and a
// conversation and threads it onto a ticket; it knows nothing about where the
// text came from. What is NOT small is everything around a channel — WhatsApp
// needs Meta business verification, SMS needs an aggregator agreement. The
// blocker is procurement, so it belongs in front of the person who can start
// it, which is what `needs` is for.
//
// Statuses:
// - AVAILABLE means the code is written and tested and the channel is waiting
//   on a credential. It does NOT mean the credential is easy to get:
//   Telegram's takes a minute, WhatsApp's takes a business review.
// - PLANNED means not built; listed with what it would take, so the answer to
//   "can you add X" stays checkable.

export const LIVE = "live" as const;
export const AVAILABLE = "available" as const;
export const PLANNED = "planned" as const;

export type ChannelStatus = typeof LIVE | typeof AVAILABLE | typeof PLANNED;

export interface CatalogueEntry {
  key: string;
  name: string;
  status: ChannelStatus;
  blurb: string;
  needs: string[];
}

export const CATALOGUE: readonly CatalogueEntry[] = [
  {
    key: "web",
    name: "Website widget",
    status: LIVE,
    blurb:
      "The chat bubble and hosted form on your own pages. Nothing to " +
      "connect — it is live wherever you paste the embed.",
    needs: [],
  },
  {
    key: "telegram",
    name: "Telegram",
    status: AVAILABLE,
    blurb:
      "Customers message your organization's bot. Ethiopia's dominant " +
      "messaging channel, and one of the two you can turn on today without " +
      "anyone's approval.",
    needs: ["A bot token from @BotFather — free, and takes about a minute."],
  },
  {
    key: "whatsapp",
    name: "WhatsApp",
    status: PLANNED,
    blurb:
      "Technically the same shape as Telegram: a webhook in, a send call " +
      "out. The work is the account, not the code.",
    needs: [
      "A Meta Business account, verified against the organization's registration.",
      "A WhatsApp Business Account and a dedicated number not already registered on WhatsApp.",
      "Meta's review of the use case, and approved message templates for anything sent first rather than in reply.",
    ],
  },
  {
    key: "messenger",
    name: "Facebook Messenger",
    status: PLANNED,
    blurb:
      "Same Meta plumbing as WhatsApp, so doing one makes the other cheap. " +
      "Worth pairing with whichever you start.",
    needs: [
      "A Facebook Page for the organization and a Meta app with Page messaging permissions.",
    ],
  },
  {
    key: "instagram",
    name: "Instagram Direct",
    status: PLANNED,
    blurb:
      "Reaches a younger audience than the phone line does. Requires a " +
      "professional account linked to the Page.",
    needs: [
      "An Instagram professional account linked to the organization's Page.",
    ],
  },
  {
    key: "viber",
    name: "Viber",
    status: PLANNED,
    blurb:
      "Still common in parts of the diaspora, and — like Telegram — " +
      "self-serve to turn on.",
    needs: [
      "A bot account from partners.viber.com — self-serve, and it issues the authentication token immediately.",
    ],
  },
  {
    key: "sms",
    name: "SMS",
    status: PLANNED,
    blurb:
      "The only channel that reaches a customer with no smartphone and no " +
      "data. Also the only one that costs money per message.",
    needs: [
      "A shortcode or sender ID and an aggregator agreement (AfroMessage, GeezSMS, or Ethio Telecom direct).",
      "A per-message budget: unlike the others, every reply has a price.",
    ],
  },
];

/**
 * The catalogue with this tenant's live state folded in. Keyword flags are
 * `<key>Connected`, one per channel that can hold a credential — by name, so
 * adding the next channel is a catalogue entry and a flag, not a signature
 * every caller has to be updated for.
 */
export function catalogue(
  connected: Partial<Record<string, boolean>> = {},
): CatalogueEntry[] {
  return CATALOGUE.map((entry) =>
    connected[`${entry.key}Connected`]
      ? { ...entry, status: LIVE }
      : { ...entry },
  );
}
