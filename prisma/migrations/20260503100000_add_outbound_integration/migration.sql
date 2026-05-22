-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('slack', 'discord');

-- CreateEnum
CREATE TYPE "IntegrationEvent" AS ENUM ('booking_created', 'booking_cancelled', 'payment_failed', 'warning_digest');

-- CreateTable
CREATE TABLE "OutboundIntegration" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "label" TEXT NOT NULL,
    "webhookUrl" TEXT NOT NULL,
    "events" "IntegrationEvent"[] DEFAULT ARRAY[]::"IntegrationEvent"[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastFiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutboundIntegration_hotelId_idx" ON "OutboundIntegration"("hotelId");

-- AddForeignKey
ALTER TABLE "OutboundIntegration" ADD CONSTRAINT "OutboundIntegration_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
