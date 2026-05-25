import { Worker } from "bullmq";
import { createEmailWorker } from "./email-worker.js";
import { createProxyCheckerWorker } from "./proxy-checker.js";
import { createSmtpWorker } from "./smtp-worker.js";
import {
  invalidCredsCleanupWorker,
  scheduleInvalidCredsCleanup,
} from "./invalid-credentials-cleanup-worker.js";
import { createSmtpBatchWorker } from "./smtp-batch-worker.js";
import { createWebAuthBatchWorker } from "./web-auth-batch-worker.js";
import { createImapValidateBatchWorker } from "./imap-validate-batch-worker.js";
import { createPipelineWorker } from "./pipeline-worker.js";
import { createMatchingWorker } from "./matching-worker.js";
import { createRecoveryPipelineWorker } from "./recovery-pipeline-worker.js";
import { log } from "../utils/logger.js";

let emailWorker: Worker;
let proxyWorker: Worker;
let smtpWorker: Worker;
let smtpBatchWorker: Worker;
let webAuthBatchWorker: Worker;
let imapValidateBatchWorker: Worker;
let pipelineWorker: Worker;
let matchingWorker: Worker;
let recoveryPipelineWorker: Worker;

export async function startWorkers() {
  emailWorker = await createEmailWorker();
  log("Email worker started");

  proxyWorker = createProxyCheckerWorker();
  log("Proxy checker worker started");

  smtpWorker = createSmtpWorker();
  log("SMTP worker started");

  smtpBatchWorker = createSmtpBatchWorker();
  log("SMTP batch worker started");

  webAuthBatchWorker = createWebAuthBatchWorker();
  log("Web Auth batch worker started");

  imapValidateBatchWorker = createImapValidateBatchWorker();
  log("IMAP validate batch worker started");

  pipelineWorker = createPipelineWorker();
  log("Pipeline worker started");

  matchingWorker = createMatchingWorker();
  log("Matching worker started");

  recoveryPipelineWorker = createRecoveryPipelineWorker();
  log("Recovery pipeline worker started");

  await scheduleInvalidCredsCleanup();
  log("Invalid credentials cleanup worker started");
}

export async function stopWorkers() {
  if (emailWorker) {
    await emailWorker.close();
    log("Email worker stopped");
  }
  if (proxyWorker) {
    await proxyWorker.close();
    log("Proxy checker worker stopped");
  }
  if (smtpWorker) {
    await smtpWorker.close();
    log("SMTP worker stopped");
  }
  if (smtpBatchWorker) {
    await smtpBatchWorker.close();
    log("SMTP batch worker stopped");
  }
  if (webAuthBatchWorker) {
    await webAuthBatchWorker.close();
    log("Web Auth batch worker stopped");
  }
  if (imapValidateBatchWorker) {
    await imapValidateBatchWorker.close();
    log("IMAP validate batch worker stopped");
  }
  if (pipelineWorker) {
    await pipelineWorker.close();
    log("Pipeline worker stopped");
  }
  if (matchingWorker) {
    await matchingWorker.close();
    log("Matching worker stopped");
  }
  if (recoveryPipelineWorker) {
    await recoveryPipelineWorker.close();
    log("Recovery pipeline worker stopped");
  }
  await invalidCredsCleanupWorker.close();
  log("Invalid credentials cleanup worker stopped");
}
