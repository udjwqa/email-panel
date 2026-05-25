-- CreateTable
CREATE TABLE "proxies" (
    "id" SERIAL NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'HTTP',
    "username" TEXT,
    "password" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unchecked',
    "latency" INTEGER,
    "country" TEXT,
    "last_check" TIMESTAMP(3),
    "fail_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proxies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proxies_status_idx" ON "proxies"("status");

-- CreateIndex
CREATE INDEX "proxies_protocol_status_idx" ON "proxies"("protocol", "status");

-- CreateIndex
CREATE UNIQUE INDEX "proxies_host_port_key" ON "proxies"("host", "port");
