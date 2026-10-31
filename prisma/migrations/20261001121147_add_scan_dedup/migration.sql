-- AlterTable
ALTER TABLE "ReviewLog" ADD COLUMN     "commitSha" TEXT,
ADD COLUMN     "scanCount" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "ReviewLog_repoKey_commitSha_model_idx" ON "ReviewLog"("repoKey", "commitSha", "model");
