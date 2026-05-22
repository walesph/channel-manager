-- AlterTable
ALTER TABLE "Hotel" ADD COLUMN "ownerICalToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Hotel_ownerICalToken_key" ON "Hotel"("ownerICalToken");
