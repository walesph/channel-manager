-- CreateEnum
CREATE TYPE "RoomState" AS ENUM ('vacant_clean', 'vacant_dirty', 'occupied', 'out_of_order');

-- AlterTable
ALTER TABLE "Room"
  ADD COLUMN "state" "RoomState" NOT NULL DEFAULT 'vacant_clean',
  ADD COLUMN "stateNote" TEXT,
  ADD COLUMN "stateBy" TEXT,
  ADD COLUMN "stateAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Room_roomTypeId_state_idx" ON "Room"("roomTypeId", "state");
