-- CreateTable
CREATE TABLE "InventoryLock" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "targetChannel" "ChannelType" NOT NULL,
    "sourceChannel" "ChannelType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 1,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryLock_bookingId_idx" ON "InventoryLock"("bookingId");
CREATE INDEX "InventoryLock_hotelId_startDate_idx" ON "InventoryLock"("hotelId", "startDate");
