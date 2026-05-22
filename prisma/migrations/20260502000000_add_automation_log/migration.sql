-- CreateTable
CREATE TABLE "AutomationLog" (
    "id" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER NOT NULL,
    "remindersSent" INTEGER NOT NULL DEFAULT 0,
    "noShowsCancelled" INTEGER NOT NULL DEFAULT 0,
    "reviewRequestsSent" INTEGER NOT NULL DEFAULT 0,
    "warningsDigested" INTEGER NOT NULL DEFAULT 0,
    "byHotel" JSONB NOT NULL,
    "errors" TEXT,

    CONSTRAINT "AutomationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationLog_ranAt_idx" ON "AutomationLog"("ranAt");
