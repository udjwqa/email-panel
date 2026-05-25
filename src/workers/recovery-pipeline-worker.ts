import { Worker, Job } from "bullmq";
import {
  redisConnection,
  type RecoveryPipelineJobData,
} from "../services/queue.js";
import { RecoveryPipeline } from "../services/pipeline/recovery-pipeline.js";
import { updateTaskStatus } from "../services/telegram/task-tracker.js";
import { log, error } from "../utils/logger.js";

async function processRecoveryPipelineJob(
  job: Job<RecoveryPipelineJobData>,
) {
  const data = job.data;

  log(`[RecoveryPipelineWorker] Starting for user ${data.userId}`);

  const pipeline = new RecoveryPipeline({
    userId: data.userId,
    taskId: data.taskId,
    emails: data.emails,
    dictionaryIds: data.dictionaryIds,
    patternInput: data.patternInput as any,
    method: data.method,
    chatId: data.chatId,
  });

  const result = await pipeline.run();

  if (data.chatId && data.taskId) {
    await updateTaskStatus(data.taskId, BigInt(data.chatId), "completed").catch(
      () => {},
    );
  }

  log(
    `[RecoveryPipelineWorker] Done: ${result.totalRecovered}/${result.stage3.emailsTested} recovered`,
  );

  return result;
}

export function createRecoveryPipelineWorker() {
  const worker = new Worker<RecoveryPipelineJobData>(
    "recovery-pipeline",
    processRecoveryPipelineJob,
    { connection: redisConnection, concurrency: 1 },
  );

  worker.on("completed", (job) =>
    log(`Recovery pipeline job ${job.id}: completed`),
  );
  worker.on("failed", (job, err) =>
    error(`Recovery pipeline job ${job?.id}: failed — ${err.message}`),
  );

  return worker;
}
