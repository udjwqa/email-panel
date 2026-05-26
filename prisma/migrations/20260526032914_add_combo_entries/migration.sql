-- CreateTable
CREATE TABLE "combo_entries" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "combo_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "combo_entries_user_id_status_idx" ON "combo_entries"("user_id", "status");

-- CreateIndex
CREATE INDEX "combo_entries_email_idx" ON "combo_entries"("email");

-- AddForeignKey
ALTER TABLE "combo_entries" ADD CONSTRAINT "combo_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
