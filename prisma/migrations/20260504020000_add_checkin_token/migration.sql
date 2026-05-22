-- AlterEnum
ALTER TYPE "BookingEventType" ADD VALUE 'self_check_in';

-- CreateTable
CREATE TABLE "CheckinToken" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "idPhotoUrl" TEXT,
    "arrivalEta" TEXT,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckinToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckinToken_bookingId_key" ON "CheckinToken"("bookingId");
CREATE UNIQUE INDEX "CheckinToken_token_key" ON "CheckinToken"("token");
CREATE INDEX "CheckinToken_bookingId_idx" ON "CheckinToken"("bookingId");
