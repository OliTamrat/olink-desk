-- A macro becomes a small bundle of actions rather than a reply plus one
-- optional status change. Both columns are nullable / defaulted, so every
-- macro written before this keeps working unchanged and simply takes no
-- extra action.
ALTER TABLE "Macro" ADD COLUMN "setPriority" "TicketPriority";
ALTER TABLE "Macro" ADD COLUMN "addTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
