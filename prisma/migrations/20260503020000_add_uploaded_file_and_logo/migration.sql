-- CreateEnum
CREATE TYPE "UploadKind" AS ENUM ('hotel_logo', 'room_photo', 'other');

-- AlterTable
ALTER TABLE "Hotel" ADD COLUMN "logoUrl" TEXT;

-- CreateTable
CREATE TABLE "UploadedFile" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "kind" "UploadKind" NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "ownerRefId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadedFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UploadedFile_hotelId_kind_idx" ON "UploadedFile"("hotelId", "kind");

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
