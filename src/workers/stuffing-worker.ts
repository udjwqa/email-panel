import { Worker, Job } from "bullmq";
import { redisConnection } from "../services/queue.js";
import { processStuffingBatch } from "../services/stuffing/engine.js";
import { ProxyPoolManager } from "../services/scaling/proxy-pool.js";
import { audit } from "../services/audit.js";
import { log, error } from "../utils/logger.js";
import type { BatchJob } from "../services/scaling/distributed-queue.js";

const proxyPool = new ProxyPoolManager();
let proxyLoaded = false;

async function processJob(job: Job<BatchJob>) {
  if (!proxyLoaded) {
    await proxyPool.loadFromDB();
    proxyLoaded = true;
  }

  const { items, userId, method } = job.data;

  const result = await processStuffingBatch(
    items,
    userId,
    method,
    proxyPool,
    proxyPool.getAll().length > 0 ? 500 : 2000,
  );

  if (result.found > 0) {
    audit({
      userId,
      type: "stuffing_found",
      level: "INFO",
      message: `Stuffing batch: ${result.found}/${result.checked} found`,
    });
  }

  return result;
}

export function createStuffingWorker(concurrency = 15) {
  const worker = new Worker<BatchJob>(
    "credential-stuffing",
    processJob,
    { connection: redisConnection, concurrency },
  );

  worker.on("completed", (job) =>
    log(`Stuffing job ${job.id}: ${job.returnvalue?.found ?? 0} found`),
  );
  worker.on("failed", (job, err) =>
    error(`Stuffing job ${job?.id}: failed — ${err.message}`),
  );

  return worker;
}
