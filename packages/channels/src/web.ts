// The web channel: the widget / hosted form POSTs here. No credential to
// verify — the channel is live wherever the embed is pasted — and `send` is
// trivial: replies travel back in the same HTTP response.
//
// The external identity is a client-generated session id the widget keeps in
// localStorage, which is exactly as strong as a Telegram chat id for what the
// desk needs: threading, not authentication.
import type { PrismaClient } from "@olink-desk/database";

import { channelReply } from "./reply";

const MAX_MESSAGE_LENGTH = 4000;
const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export interface WebMessageResult {
  status: number;
  body: Record<string, unknown>;
}

export async function handleWebMessage(opts: {
  db: PrismaClient;
  orgSlug: string;
  sessionId: unknown;
  text: unknown;
  language?: unknown;
  clientMessageId?: unknown;
}): Promise<WebMessageResult> {
  const { db, orgSlug } = opts;
  const organization = await db.organization.findUnique({
    where: { slug: orgSlug },
  });
  if (!organization) {
    return { status: 404, body: { error: "Unknown organization" } };
  }

  const sessionId = typeof opts.sessionId === "string" ? opts.sessionId : "";
  if (!SESSION_ID_RE.test(sessionId)) {
    return { status: 400, body: { error: "Invalid session id" } };
  }
  const text = typeof opts.text === "string" ? opts.text.trim() : "";
  if (!text || text.length > MAX_MESSAGE_LENGTH) {
    return { status: 400, body: { error: "Invalid message" } };
  }
  const language =
    typeof opts.language === "string" ? opts.language : undefined;
  const clientMessageId =
    typeof opts.clientMessageId === "string" && opts.clientMessageId
      ? `web:${sessionId}:${opts.clientMessageId.slice(0, 64)}`
      : undefined;

  const replies: string[] = [];
  const result = await channelReply({
    db,
    organization,
    channel: "WEB",
    externalUserId: sessionId,
    text,
    externalMessageId: clientMessageId,
    languageHint: language,
    send: (body) => {
      replies.push(body);
      return Promise.resolve(true);
    },
  });

  if (result.duplicate) {
    return { status: 200, body: { duplicate: true, replies: [] } };
  }
  return {
    status: 200,
    body: {
      duplicate: false,
      ticketNumber: result.ticketNumber,
      ticketCreated: result.ticketCreated,
      replies,
    },
  };
}

/**
 * The widget's read side: the conversation's messages, oldest first, so an
 * agent's reply (recorded by sendAgentReply) reaches the customer on the
 * next poll. The session id is the authentication, exactly as it is for
 * posting — it grants exactly the conversation it names, nothing else.
 */
export async function listWebMessages(opts: {
  db: PrismaClient;
  orgSlug: string;
  sessionId: unknown;
}): Promise<WebMessageResult> {
  const { db, orgSlug } = opts;
  const organization = await db.organization.findUnique({
    where: { slug: orgSlug },
  });
  if (!organization) {
    return { status: 404, body: { error: "Unknown organization" } };
  }
  const sessionId = typeof opts.sessionId === "string" ? opts.sessionId : "";
  if (!SESSION_ID_RE.test(sessionId)) {
    return { status: 400, body: { error: "Invalid session id" } };
  }
  const conversation = await db.conversation.findUnique({
    where: {
      organizationId_channel_externalUserId: {
        organizationId: organization.id,
        channel: "WEB",
        externalUserId: sessionId,
      },
    },
  });
  if (!conversation) return { status: 200, body: { messages: [] } };
  const tickets = await db.ticket.findMany({
    where: { organizationId: organization.id, conversationId: conversation.id },
    select: { id: true },
  });
  const messages = await db.ticketMessage.findMany({
    where: {
      organizationId: organization.id,
      ticketId: { in: tickets.map((t) => t.id) },
      direction: { in: ["INBOUND", "OUTBOUND"] }, // NOTEs are never customer-visible
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, direction: true, body: true, createdAt: true },
  });
  return { status: 200, body: { messages } };
}
