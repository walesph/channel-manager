-- AlterTable
ALTER TABLE "UploadedFile" ADD COLUMN "sortIndex" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "UploadedFile_ownerRefId_sortIndex_idx" ON "UploadedFile"("ownerRefId", "sortIndex");
