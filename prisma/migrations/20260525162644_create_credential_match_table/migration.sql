-- CreateTable
CREATE TABLE "credential_matches" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "found_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credential_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credential_matches_user_id_status_idx" ON "credential_matches"("user_id", "status");

-- CreateIndex
CREATE INDEX "credential_matches_email_idx" ON "credential_matches"("email");

-- CreateIndex
CREATE UNIQUE INDEX "credential_matches_user_id_email_key" ON "credential_matches"("user_id", "email");

-- AddForeignKey
ALTER TABLE "credential_matches" ADD CONSTRAINT "credential_matches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
