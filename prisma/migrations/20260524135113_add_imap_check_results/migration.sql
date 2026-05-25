-- CreateTable
CREATE TABLE "imap_check_results" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error_type" TEXT,
    "message" TEXT,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "response_time" INTEGER,

    CONSTRAINT "imap_check_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imap_check_results_email_idx" ON "imap_check_results"("email");

-- CreateIndex
CREATE INDEX "imap_check_results_checked_at_idx" ON "imap_check_results"("checked_at");
