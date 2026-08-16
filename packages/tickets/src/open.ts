// Opening a ticket — the one door.
//
// This was private to the channel spine, which was right while a channel
// message was the only way a ticket could begin. It no longer is: an agent
// logs a phone call, somebody walks into an office, and email is coming. Two
// copies of "allocate a number, start the SLA clocks" is two places for one of
// them to drift, and the one that drifts is the quiet one.
import type { Channel, PrismaClient, Ticket, TicketPriority } from "@olink-desk/database";
import { Prisma } from "@olink-desk/database";
import { slaDatesFor } from "@olink-desk/sla";

export interface OpenTicketInput {
  organizationId: string;
  /**
   * Null for a ticket with no channel identity behind it — a logged call, a
   * walk-in. Such a ticket genuinely CANNOT be replied to on a channel, and
   * the console has to say so rather than offer a composer that fails.
   */
  conversationId: string | null;
  contactId: string | null;
  channel: Channel;
  language: string;
  subject: string;
  /**
   * A channel message carries no priority of its own, so it opens NORMAL. An
   * agent taking a call can see the customer's face and knows better.
   */
  priority?: TicketPriority;
  queueId?: string | null;
  assigneeId?: string | null;
  createdById?: string | null;
}

const MAX_ATTEMPTS = 5;

/**
 * Create a ticket with a per-organization human-facing number and its SLA
 * clocks already running.
 *
 * Concurrency-safe via the [organizationId, number] unique constraint: compute
 * max+1 and retry on the unique violation rather than locking. Two agents
 * pressing "create" at the same instant is the ordinary case, not the rare
 * one.
 */
export async function openTicket(
  db: PrismaClient,
  input: OpenTicketInput,
): Promise<Ticket> {
  const priority = input.priority ?? "NORMAL";
  // SLA clocks start at creation. A manually logged call is on the clock like
  // anything else — otherwise the busiest desks would report their best
  // numbers by taking work off the channels entirely.
  const sla = await slaDatesFor(db, input.organizationId, priority, new Date());

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const latest = await db.ticket.findFirst({
      where: { organizationId: input.organizationId },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    try {
      return await db.ticket.create({
        data: {
          organizationId: input.organizationId,
          conversationId: input.conversationId,
          contactId: input.contactId,
          channel: input.channel,
          language: input.language,
          subject: input.subject,
          priority,
          queueId: input.queueId ?? null,
          assigneeId: input.assigneeId ?? null,
          ...sla,
          number: (latest?.number ?? 0) + 1,
        },
      });
    } catch (err) {
      const isNumberCollision =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!isNumberCollision) throw err;
    }
  }
  throw new Error(`Could not allocate a ticket number after ${MAX_ATTEMPTS} attempts`);
}
