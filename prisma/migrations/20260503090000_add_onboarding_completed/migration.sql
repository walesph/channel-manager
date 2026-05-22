-- AlterTable
ALTER TABLE "Hotel" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

-- Backfill the seed hotel as already onboarded so existing dev preview
-- sessions don't get punted to /onboarding on the first reload.
UPDATE "Hotel" SET "onboardingCompletedAt" = NOW();
