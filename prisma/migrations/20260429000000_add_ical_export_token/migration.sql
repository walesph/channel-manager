-- AlterTable
ALTER TABLE "Channel" ADD COLUMN "icalExportToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Channel_icalExportToken_key" ON "Channel"("icalExportToken");
