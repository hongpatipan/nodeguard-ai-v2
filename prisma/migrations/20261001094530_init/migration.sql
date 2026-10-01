-- CreateEnum
CREATE TYPE "LogSeverity" AS ENUM ('critical', 'warning', 'optimization', 'passed');

-- CreateEnum
CREATE TYPE "LogStatus" AS ENUM ('FLAGGED', 'RESOLVED', 'FAILED');

-- CreateTable
CREATE TABLE "ReviewLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "issuesFoundCount" INTEGER NOT NULL,
    "severity" "LogSeverity" NOT NULL,
    "status" "LogStatus" NOT NULL DEFAULT 'FLAGGED',
    "fullReviewOutput" JSONB NOT NULL,
    "errorMessage" TEXT,

    CONSTRAINT "ReviewLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewLog_createdAt_idx" ON "ReviewLog"("createdAt");

-- CreateIndex
CREATE INDEX "ReviewLog_status_idx" ON "ReviewLog"("status");
