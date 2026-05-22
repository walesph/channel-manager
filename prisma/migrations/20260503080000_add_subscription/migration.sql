-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('starter', 'pro', 'enterprise');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trial', 'active', 'past_due', 'cancelled');

-- AlterTable
ALTER TABLE "Hotel"
  ADD COLUMN "plan" "SubscriptionPlan",
  ADD COLUMN "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'trial',
  ADD COLUMN "trialEndsAt" TIMESTAMP(3),
  ADD COLUMN "stripeCustomerId" TEXT,
  ADD COLUMN "stripeSubscriptionId" TEXT,
  ADD COLUMN "currentPeriodEndsAt" TIMESTAMP(3);

-- Bootstrap the seed hotel into a trial that starts now (14 days).
UPDATE "Hotel" SET "trialEndsAt" = (NOW() + INTERVAL '14 days');

-- CreateIndex
CREATE UNIQUE INDEX "Hotel_stripeCustomerId_key" ON "Hotel"("stripeCustomerId");
CREATE UNIQUE INDEX "Hotel_stripeSubscriptionId_key" ON "Hotel"("stripeSubscriptionId");
