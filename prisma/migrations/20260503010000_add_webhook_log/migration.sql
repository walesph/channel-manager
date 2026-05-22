-- CreateEnum
CREATE TYPE "WebhookProvider" AS ENUM ('clerk', 'stripe', 'booking_com', 'hostaway');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('ok', 'invalid_signature', 'bad_request', 'handler_error');

-- CreateTable
CREATE TABLE "WebhookLog" (
    "id" TEXT NOT NULL,
    "provider" "WebhookProvider" NOT NULL,
    "eventType" TEXT,
    "status" "WebhookStatus" NOT NULL,
    "httpStatus" INTEGER NOT NULL,
    "responseBody" TEXT,
    "headers" JSONB NOT NULL,
    "body" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookLog_receivedAt_idx" ON "WebhookLog"("receivedAt");

-- CreateIndex
CREATE INDEX "WebhookLog_provider_receivedAt_idx" ON "WebhookLog"("provider", "receivedAt");
