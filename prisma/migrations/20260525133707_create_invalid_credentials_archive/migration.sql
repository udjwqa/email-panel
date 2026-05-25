-- CreateTable
CREATE TABLE "invalid_credentials" (
    "id" SERIAL NOT NULL,
    "original_id" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "error_message" TEXT,
    "response_time" INTEGER,
    "original_checked_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_by" INTEGER,
    "account_status" TEXT,
    "account_status_reason" TEXT,

    CONSTRAINT "invalid_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invalid_credentials_email_idx" ON "invalid_credentials"("email");

-- CreateIndex
CREATE INDEX "invalid_credentials_status_idx" ON "invalid_credentials"("status");

-- CreateIndex
CREATE INDEX "invalid_credentials_protocol_idx" ON "invalid_credentials"("protocol");

-- CreateIndex
CREATE INDEX "invalid_credentials_archived_at_idx" ON "invalid_credentials"("archived_at");
