-- AlterTable
ALTER TABLE "auth_results" ADD COLUMN     "account_status" TEXT,
ADD COLUMN     "account_status_reason" TEXT;

-- CreateIndex
CREATE INDEX "auth_results_account_status_idx" ON "auth_results"("account_status");
