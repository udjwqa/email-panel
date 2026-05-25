-- CreateTable
CREATE TABLE "auth_results" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "error_message" TEXT,
    "response_time" INTEGER,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER,

    CONSTRAINT "auth_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_results_email_idx" ON "auth_results"("email");

-- CreateIndex
CREATE INDEX "auth_results_protocol_idx" ON "auth_results"("protocol");

-- CreateIndex
CREATE INDEX "auth_results_status_idx" ON "auth_results"("status");

-- CreateIndex
CREATE INDEX "auth_results_checked_at_idx" ON "auth_results"("checked_at");

-- CreateIndex
CREATE INDEX "auth_results_user_id_idx" ON "auth_results"("user_id");

-- AddForeignKey
ALTER TABLE "auth_results" ADD CONSTRAINT "auth_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
