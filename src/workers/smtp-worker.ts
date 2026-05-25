import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config.js";
import { SmtpJobData } from "../services/queue.js";
import { SmtpClient } from "../services/smtp/client.js";
import { audit } from "../services/audit.js";
import { log, error } from "../utils/logger.js";

type SmtpVerifyStatus = "deliverable" | "undeliverable" | "unknown";

function rcptCodeToStatus(code: number): SmtpVerifyStatus {
  if (code === 250 || code === 251) return "deliverable";
  if (code === 550 || code === 551 || code === 552 || code === 553)
    return "undeliverable";
  return "unknown";
}

export async function processSmtpJob(
  job: Job<SmtpJobData>,
  redis: IORedis,
): Promise<void> {
  const { email, mxServer } = job.data;
  const client = new SmtpClient(30_000);

  let status: SmtpVerifyStatus = "unknown";
  let smtpCode = 0;

  try {
    const banner = await client.connect(mxServer, 25);
    if (banner.code !== 220) {
      throw new Error(`Banner rejected: ${banner.code}`);
    }

    let ehlo = await client.sendCommand("EHLO validator.local");
    if (ehlo.code !== 250) {
      ehlo = await client.sendCommand("HELO validator.local");
      if (ehlo.code !== 250) {
        throw new Error(`HELO rejected: ${ehlo.code}`);
      }
    }

    if (ehlo.message.toUpperCase().includes("STARTTLS")) {
      const tlsOk = await client.startTls(mxServer);
      if (tlsOk) {
        await client.sendCommand("EHLO validator.local");
      }
    }

    const mailFrom = await client.sendCommand(
      "MAIL FROM:<noreply@validator.local>",
    );
    if (mailFrom.code !== 250) {
      throw new Error(`MAIL FROM rejected: ${mailFrom.code}`);
    }

    const rcpt = await client.sendCommand(`RCPT TO:<${email}>`);
    smtpCode = rcpt.code;
    status = rcptCodeToStatus(rcpt.code);

    try {
      await client.sendCommand("RSET");
    } catch {
      // ignore
    }
  } catch (err) {
    error(`SMTP job ${job.id}: ${err instanceof Error ? err.message : err}`);
    status = "unknown";
  } finally {
    try {
      await client.close();
    } catch {
      // ignore
    }
  }

  const result = {
    status,
    smtpCode,
    mxServer,
    checkedAt: new Date().toISOString(),
  };

  await redis.set(
    `smtp:result:${email}`,
    JSON.stringify(result),
    "EX",
    86400,
  );

  log(`SMTP verify ${email} via ${mxServer}: ${status} (${smtpCode})`);
  audit({
    type: "smtp_verification",
    level: "INFO",
    message: `${email}: ${status} via ${mxServer} (code ${smtpCode})`,
  });
}

export function createSmtpWorker(): Worker<SmtpJobData> {
  const connection = new IORedis(config.redis.url, {
    maxRetriesPerRequest: null,
  });

  const redisStore = new IORedis(config.redis.url);

  const worker = new Worker<SmtpJobData>(
    "smtp-verification",
    (job) => processSmtpJob(job, redisStore),
    { connection, concurrency: 3 },
  );

  worker.on("completed", (job) => {
    log(`SMTP job ${job.id}: completed`);
  });

  worker.on("failed", (job, err) => {
    error(`SMTP job ${job?.id}: failed — ${err.message}`);
  });

  return worker;
}
