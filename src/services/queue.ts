import { Queue } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config.js";

export const redisConnection = new IORedis(config.redis.url, {
  maxRetriesPerRequest: null,
});

export interface EmailJobData {
  taskId: number;
}

export const emailQueue = new Queue<EmailJobData>("email-validation", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

export interface ProxyCheckJobData {
  mode: "all" | "unchecked" | "stale";
}

export const proxyCheckQueue = new Queue<ProxyCheckJobData>("proxy-check", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 10 },
  },
});

export interface SmtpJobData {
  email: string;
  mxServer: string;
}

export const smtpQueue = new Queue<SmtpJobData>("smtp-verification", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  },
});

export interface InvalidCredsCleanupJobData {
  manual?: boolean;
  userId?: number;
}

export interface SmtpBatchJobData {
  taskId: number;
  chatId?: string;
}

export const smtpBatchQueue = new Queue<SmtpBatchJobData>("smtp-batch", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 20 },
  },
});

export interface PipelineJobData {
  taskId: number;
  chatId?: string;
}

export const pipelineQueue = new Queue<PipelineJobData>(
  "security-audit-pipeline",
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 20 },
      removeOnFail: { count: 10 },
    },
  },
);

export interface ImapValidateBatchJobData {
  taskId: number;
  chatId?: string;
  filter?: "all" | "clean" | "2fa";
}

export const imapValidateBatchQueue = new Queue<ImapValidateBatchJobData>(
  "imap-validate-batch",
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 20 },
    },
  },
);

export interface WebAuthBatchJobData {
  taskId: number;
  chatId?: string;
}

export const webAuthBatchQueue = new Queue<WebAuthBatchJobData>(
  "web-auth-batch",
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 20 },
    },
  },
);

export interface RecoveryPipelineJobData {
  userId: number;
  taskId?: number;
  emails?: string[];
  dictionaryIds: number[];
  patternInput?: Record<string, string>;
  method?: "imap" | "oauth";
  chatId?: string;
}

export const recoveryPipelineQueue = new Queue<RecoveryPipelineJobData>(
  "recovery-pipeline",
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 20 },
      removeOnFail: { count: 10 },
    },
  },
);

export interface MatchingJobData {
  userId: number;
  taskId?: number;
  emails?: string[];
  dictionaryIds: number[];
  method?: "imap" | "oauth";
  chatId?: string;
}

export const matchingQueue = new Queue<MatchingJobData>("credential-matching", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 10 },
  },
});

export const invalidCredsCleanupQueue =
  new Queue<InvalidCredsCleanupJobData>("invalid-credentials-cleanup", {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 5 },
    },
  });
