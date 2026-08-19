import type { Metadata } from "next";

import { SitePage } from "../lib/site";

// The public product page. It replaced a placeholder — a heading, one
// sentence and a Sign in button — which was the first thing a prospect met
// and said nothing about what the desk does.
export const metadata: Metadata = {
  title: "Olink Desk — every customer conversation, on one desk",
  description:
    "Telegram, WhatsApp, SMS, USSD and your own website in one inbox. Replies drafted from your own knowledge base, in six languages, with an SLA clock on every ticket.",
};

export default function Home() {
  return <SitePage />;
}
