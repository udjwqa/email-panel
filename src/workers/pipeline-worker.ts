import { Worker, Job } from "bullmq";
import { redisConnection, type PipelineJobData } from "../services/queue.js";
import { SecurityAuditPipeline } from "../services/pipeline/security-audit-pipeline.js";
import { notifyTaskCompleted } from "../services/notify.js";
import { updateTaskStatus } from "../services/telegram/task-tracker.js";
import { log, error } from "../utils/logger.js";

async function processPipelineJob(job: Job<PipelineJobData>) {
  const { taskId, chatId } = job.data;

  log(`[PipelineWorker] Starting full audit for task #${taskId}`);

  const pipeline = new SecurityAuditPipeline(taskId, chatId);
  const result = await pipeline.run();

  if (chatId) {
    await updateTaskStatus(taskId, BigInt(chatId), "completed").catch(() => {});
  }

  await notifyTaskCompleted(taskId);

  log(
    `[PipelineWorker] Completed: ${result.finalClean}/${result.originalTotal} clean`,
  );

  return result;
}

export function createPipelineWorker() {
  const worker = new Worker<PipelineJobData>(
    "security-audit-pipeline",
    processPipelineJob,
    { connection: redisConnection, concurrency: 1 },
  );

  worker.on("completed", (job) =>
    log(`Pipeline job ${job.id}: completed`),
  );
  worker.on("failed", (job, err) =>
    error(`Pipeline job ${job?.id}: failed — ${err.message}`),
  );

  return worker;
}
