-- CreateEnum
CREATE TYPE "MiddlewareType" AS ENUM ('hostaway', 'siteminder', 'rategain', 'ezpms');

-- CreateEnum
CREATE TYPE "MiddlewareStatus" AS ENUM ('connected', 'disconnected', 'error');

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "icalUrl" TEXT;

-- CreateTable
CREATE TABLE "Middleware" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "type" "MiddlewareType" NOT NULL,
    "status" "MiddlewareStatus" NOT NULL DEFAULT 'disconnected',
    "propertyId" TEXT,
    "credentials" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Middleware_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Middleware_hotelId_type_key" ON "Middleware"("hotelId", "type");

-- AddForeignKey
ALTER TABLE "Middleware" ADD CONSTRAINT "Middleware_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
