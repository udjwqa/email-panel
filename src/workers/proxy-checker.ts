import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { db } from "../services/db.js";
import { config } from "../config.js";
import { checkProxy } from "../services/proxy/checker.js";
import { log, error } from "../utils/logger.js";
import { audit } from "../services/audit.js";

const BATCH_SIZE = 50;
const STALE_MINUTES = 30;

interface ProxyCheckJobData {
  mode: "all" | "unchecked" | "stale";
}

async function processProxyCheckJob(job: Job<ProxyCheckJobData>) {
  const { mode } = job.data;

  const staleDate = new Date(Date.now() - STALE_MINUTES * 60_000);

  const where =
    mode === "unchecked"
      ? { status: "unchecked" }
      : mode === "stale"
        ? { OR: [{ status: "unchecked" }, { lastCheck: { lt: staleDate } }] }
        : {};

  const total = await db.proxy.count({ where });
  log(`Proxy check started: ${total} proxies (mode: ${mode})`);

  let checked = 0;
  let aliveCount = 0;

  while (checked < total) {
    const batch = await db.proxy.findMany({
      where,
      take: BATCH_SIZE,
      skip: checked,
      orderBy: { id: "asc" },
    });

    if (batch.length === 0) break;

    for (const proxy of batch) {
      const result = await checkProxy({
        host: proxy.host,
        port: proxy.port,
        protocol: proxy.protocol as any,
        username: proxy.username ?? undefined,
        password: proxy.password ?? undefined,
      });

      const failCount =
        result.status === "dead" ? proxy.failCount + 1 : 0;

      await db.proxy.update({
        where: { id: proxy.id },
        data: {
          status: result.status,
          latency: result.latency,
          lastCheck: new Date(),
          failCount,
        },
      });

      if (result.status === "alive") aliveCount++;
      checked++;
    }

    await job.updateProgress(Math.round((checked / total) * 100));
  }

  audit({
    type: "proxy_check_completed",
    level: "INFO",
    message: `Proxy check done: ${checked} checked, ${aliveCount} alive`,
  });

  log(`Proxy check completed: ${checked} checked, ${aliveCount} alive`);
}

export function createProxyCheckerWorker() {
  const connection = new IORedis(config.redis.url, {
    maxRetriesPerRequest: null,
  });

  const worker = new Worker<ProxyCheckJobData>(
    "proxy-check",
    processProxyCheckJob,
    { connection, concurrency: 1 },
  );

  worker.on("completed", (job) => {
    log(`Proxy check job ${job.id}: completed`);
  });

  worker.on("failed", (job, err) => {
    error(`Proxy check job ${job?.id}: failed — ${err.message}`);
  });

  return worker;
}
