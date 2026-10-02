-- AlterTable
ALTER TABLE "ReviewLog" ADD COLUMN     "filesReviewed" TEXT[],
ADD COLUMN     "flaggedFiles" TEXT[],
ADD COLUMN     "repoKey" TEXT;

-- CreateIndex
CREATE INDEX "ReviewLog_repoKey_status_idx" ON "ReviewLog"("repoKey", "status");
