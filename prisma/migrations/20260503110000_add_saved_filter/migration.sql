-- CreateEnum
CREATE TYPE "SavedFilterScope" AS ENUM ('bookings', 'messages');

-- CreateTable
CREATE TABLE "SavedFilter" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "scope" "SavedFilterScope" NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT,
    "params" JSONB NOT NULL,
    "sortIndex" INTEGER NOT NULL DEFAULT 0,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedFilter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SavedFilter_hotelId_scope_label_key" ON "SavedFilter"("hotelId", "scope", "label");
CREATE INDEX "SavedFilter_hotelId_scope_idx" ON "SavedFilter"("hotelId", "scope");

-- AddForeignKey
ALTER TABLE "SavedFilter" ADD CONSTRAINT "SavedFilter_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
