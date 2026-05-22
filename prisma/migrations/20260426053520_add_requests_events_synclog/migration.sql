-- CreateEnum
CREATE TYPE "BookingRequestType" AS ENUM ('bed', 'checkin', 'dietary', 'note');

-- CreateEnum
CREATE TYPE "BookingEventType" AS ENUM ('created', 'payment_captured', 'payment_failed', 'payment_refunded', 'confirmation_sent', 'message_received', 'checked_in', 'checked_out', 'cancelled');

-- CreateEnum
CREATE TYPE "SyncOp" AS ENUM ('push_inventory', 'push_rates', 'pull_bookings', 'rate_mismatch');

-- CreateEnum
CREATE TYPE "SyncResult" AS ENUM ('success', 'in_progress', 'warn', 'error');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "roomId" TEXT;

-- CreateTable
CREATE TABLE "BookingRequest" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" "BookingRequestType" NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "BookingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingEvent" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" "BookingEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "body" TEXT,

    CONSTRAINT "BookingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "op" "SyncOp" NOT NULL,
    "target" TEXT NOT NULL,
    "result" "SyncResult" NOT NULL,
    "durationMs" INTEGER,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingRequest_bookingId_idx" ON "BookingRequest"("bookingId");

-- CreateIndex
CREATE INDEX "BookingEvent_bookingId_occurredAt_idx" ON "BookingEvent"("bookingId", "occurredAt");

-- CreateIndex
CREATE INDEX "SyncLog_occurredAt_idx" ON "SyncLog"("occurredAt");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
