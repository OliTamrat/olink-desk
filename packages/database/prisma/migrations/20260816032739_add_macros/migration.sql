-- CreateTable
CREATE TABLE "Macro" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "bodies" JSONB NOT NULL,
    "setStatus" "TicketStatus",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Macro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Macro_organizationId_isActive_idx" ON "Macro"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Macro_organizationId_title_key" ON "Macro"("organizationId", "title");

-- AddForeignKey
ALTER TABLE "Macro" ADD CONSTRAINT "Macro_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Macro" ADD CONSTRAINT "Macro_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
