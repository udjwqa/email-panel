-- CreateTable
CREATE TABLE "recovered_credentials" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "access_level" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 100,
    "imap_folders" TEXT,
    "has_inbox" BOOLEAN NOT NULL DEFAULT false,
    "message_count" INTEGER,
    "has_2fa" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT,
    "metadata" JSONB,
    "recovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovered_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recovered_credentials_user_id_access_level_idx" ON "recovered_credentials"("user_id", "access_level");

-- CreateIndex
CREATE INDEX "recovered_credentials_email_idx" ON "recovered_credentials"("email");

-- CreateIndex
CREATE UNIQUE INDEX "recovered_credentials_user_id_email_key" ON "recovered_credentials"("user_id", "email");

-- AddForeignKey
ALTER TABLE "recovered_credentials" ADD CONSTRAINT "recovered_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
