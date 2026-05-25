-- CreateTable
CREATE TABLE "telegram_sessions" (
    "id" SERIAL NOT NULL,
    "chat_id" BIGINT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "session_data" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_activity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_tasks" (
    "id" SERIAL NOT NULL,
    "task_id" INTEGER NOT NULL,
    "chat_id" BIGINT NOT NULL,
    "message_id" INTEGER,
    "task_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "task_complete" BOOLEAN NOT NULL DEFAULT true,
    "task_failed" BOOLEAN NOT NULL DEFAULT true,
    "error_threshold" BOOLEAN NOT NULL DEFAULT true,
    "export_ready" BOOLEAN NOT NULL DEFAULT true,
    "security_alerts" BOOLEAN NOT NULL DEFAULT true,
    "quiet_hours_start" INTEGER,
    "quiet_hours_end" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_sessions_chat_id_key" ON "telegram_sessions"("chat_id");

-- CreateIndex
CREATE INDEX "telegram_sessions_user_id_idx" ON "telegram_sessions"("user_id");

-- CreateIndex
CREATE INDEX "telegram_sessions_is_active_idx" ON "telegram_sessions"("is_active");

-- CreateIndex
CREATE INDEX "telegram_tasks_chat_id_idx" ON "telegram_tasks"("chat_id");

-- CreateIndex
CREATE INDEX "telegram_tasks_status_idx" ON "telegram_tasks"("status");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_tasks_task_id_chat_id_key" ON "telegram_tasks"("task_id", "chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_settings_user_id_key" ON "notification_settings"("user_id");

-- AddForeignKey
ALTER TABLE "telegram_sessions" ADD CONSTRAINT "telegram_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_tasks" ADD CONSTRAINT "telegram_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
