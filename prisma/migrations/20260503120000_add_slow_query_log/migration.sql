-- CreateTable
CREATE TABLE "SlowQueryLog" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "query" TEXT NOT NULL,
    "params" TEXT,
    "durationMs" INTEGER NOT NULL,
    "endpoint" TEXT,

    CONSTRAINT "SlowQueryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlowQueryLog_occurredAt_idx" ON "SlowQueryLog"("occurredAt");
