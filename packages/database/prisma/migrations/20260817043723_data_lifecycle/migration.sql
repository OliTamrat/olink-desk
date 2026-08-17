-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "redactedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "erasedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "auditRetentionDays" INTEGER,
ADD COLUMN     "ticketRetentionDays" INTEGER;

-- AlterTable
ALTER TABLE "TicketMessage" ADD COLUMN     "redactedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Ticket_organizationId_closedAt_idx" ON "Ticket"("organizationId", "closedAt");
