-- AlterTable
ALTER TABLE "Guest" ADD COLUMN "deletionRequestedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Guest_deletionRequestedAt_idx" ON "Guest"("deletionRequestedAt");
