// What each connectable channel needs typed into it, and where its gateway
// has to point.
//
// Data, not JSX, and outside the page so it can be read at a glance and
// checked by a test. The API already knew every one of these fields — it has
// validated them since the channels were built — but there was no form
// anywhere, so connecting email meant hand-crafting a PUT with curl. A
// capability nobody can reach is not shipped.

export interface SetupField {
  /** Key in the PUT body — must match the API's `required` list exactly. */
  name: string;
  /** i18n key for the label. */
  label: string;
  /** Shown greyed inside the box. Not translated: these are literal formats. */
  placeholder?: string;
  /** i18n key for the line under the field. */
  hint?: string;
  /** A credential: masked, never echoed back once stored. */
  secret?: boolean;
  optional?: boolean;
}

export interface SetupSpec {
  /** Path segment for `PUT /api/orgs/{slug}/channels/{kind}`. */
  kind: string;
  /** Shown when one catalogue entry has several providers behind it. */
  vendor?: string;
  fields: SetupField[];
  /**
   * Where the far end has to point, and what it must prove when it gets here.
   *
   * This is the half an operator cannot guess and the half nothing displayed
   * before. Storing credentials is useless on its own: a channel is connected
   * when messages arrive, and messages arrive because somebody pasted this URL
   * into Postmark or the aggregator's dashboard.
   *
   * `header` is for gateways that send back a secret WE minted. Meta is
   * different and must not be described the same way: it signs each delivery
   * with the app secret and computes `X-Hub-Signature-256` itself, so telling
   * an operator to "send the secret in that header" is an instruction they
   * cannot follow and would waste an afternoon on. Those cards carry `note`
   * instead.
   */
  webhook?: {
    path: (slug: string) => string;
    header?: string;
    /** i18n key, for a far end that authenticates some other way. */
    note?: string;
  };
}

/** Keyed by catalogue key; a key with several entries is a vendor choice. */
export const SETUP: Record<string, SetupSpec[]> = {
  email: [
    {
      kind: "email",
      fields: [
        {
          name: "fromAddress",
          label: "ui_setup_from_address",
          placeholder: "Support <support@acme.et>",
          hint: "ui_setup_from_hint",
        },
        {
          name: "sendUrl",
          label: "ui_setup_send_url",
          placeholder: "https://api.resend.com/emails",
          hint: "ui_setup_send_url_hint",
        },
        {
          name: "authHeader",
          label: "ui_setup_auth_value",
          placeholder: "Bearer re_...",
          secret: true,
          optional: true,
          hint: "ui_setup_auth_value_hint",
        },
        {
          name: "authHeaderName",
          label: "ui_setup_auth_header",
          placeholder: "Authorization",
          optional: true,
          hint: "ui_setup_auth_header_hint",
        },
      ],
      webhook: { path: (s) => `/api/webhooks/email/${s}`, header: "X-Email-Secret" },
    },
  ],
  sms: [
    {
      kind: "sms-afromessage",
      vendor: "AfroMessage",
      fields: [
        { name: "senderId", label: "ui_setup_sender_id", placeholder: "OLINK" },
        {
          name: "sendUrl",
          label: "ui_setup_send_url",
          placeholder: "https://api.afromessage.com/api/send",
        },
        { name: "authHeader", label: "ui_setup_auth_value", secret: true, optional: true },
      ],
      webhook: { path: (s) => `/api/webhooks/sms/${s}`, header: "X-SMS-Secret" },
    },
    {
      kind: "sms-geezsms",
      vendor: "GeezSMS",
      fields: [
        { name: "senderId", label: "ui_setup_sender_id", placeholder: "OLINK" },
        {
          name: "sendUrl",
          label: "ui_setup_send_url",
          placeholder: "https://api.geezsms.com/api/v1/sms/send",
        },
        { name: "authHeader", label: "ui_setup_auth_value", secret: true, optional: true },
      ],
      webhook: { path: (s) => `/api/webhooks/sms/${s}`, header: "X-SMS-Secret" },
    },
    {
      kind: "sms-falconvas",
      vendor: "FalconVAS",
      fields: [
        { name: "senderId", label: "ui_setup_sender_id", placeholder: "OLINK" },
        { name: "sendUrl", label: "ui_setup_send_url", placeholder: "https://..." },
        { name: "authHeader", label: "ui_setup_auth_value", secret: true, optional: true },
      ],
      webhook: { path: (s) => `/api/webhooks/sms/${s}`, header: "X-SMS-Secret" },
    },
  ],
  ussd: [
    {
      kind: "ussd",
      // No required fields at all: a USSD gateway pushes to us and we answer
      // in the response body, so there is nothing to send TO. Saving here
      // exists purely to mint the shared secret.
      fields: [],
      webhook: { path: (s) => `/api/webhooks/ussd/${s}`, header: "X-USSD-Secret" },
    },
  ],
  whatsapp: [
    {
      kind: "meta-whatsapp",
      fields: [
        { name: "phoneNumberId", label: "ui_setup_phone_number_id", placeholder: "1029384756" },
        { name: "accessToken", label: "ui_setup_access_token", secret: true },
        { name: "appSecret", label: "ui_setup_app_secret", secret: true },
        {
          name: "verifyToken",
          label: "ui_setup_verify_token",
          hint: "ui_setup_verify_hint",
        },
      ],
      webhook: { path: (s) => `/api/webhooks/meta/${s}`, note: "ui_setup_webhook_meta" },
    },
  ],
  messenger: [
    {
      kind: "meta-messenger",
      fields: [
        { name: "accessToken", label: "ui_setup_access_token", secret: true },
        { name: "appSecret", label: "ui_setup_app_secret", secret: true },
        { name: "verifyToken", label: "ui_setup_verify_token", hint: "ui_setup_verify_hint" },
      ],
      webhook: { path: (s) => `/api/webhooks/meta/${s}`, note: "ui_setup_webhook_meta" },
    },
  ],
  instagram: [
    {
      kind: "meta-instagram",
      fields: [
        { name: "accessToken", label: "ui_setup_access_token", secret: true },
        { name: "appSecret", label: "ui_setup_app_secret", secret: true },
        { name: "verifyToken", label: "ui_setup_verify_token", hint: "ui_setup_verify_hint" },
      ],
      webhook: { path: (s) => `/api/webhooks/meta/${s}`, note: "ui_setup_webhook_meta" },
    },
  ],
};
