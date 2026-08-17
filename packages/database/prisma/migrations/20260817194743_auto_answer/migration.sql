-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "autoAnswerEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TicketMessage" ADD COLUMN     "autoAnswered" BOOLEAN NOT NULL DEFAULT false;
