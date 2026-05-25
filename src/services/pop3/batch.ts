import pLimit from "p-limit";
import { PrismaClient } from "@prisma/client";
import { POP3Verifier } from "./verifier.js";
import { POP3Config } from "./types.js";
import { saveAuthResult } from "../auth-results/aggregator.js";
import type { AuthStatus } from "../auth-results/types.js";
import { sleepWithJitter } from "../../utils/randomization.js";

export interface POP3BatchCredential {
  email: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
}

export interface POP3BatchResult {
  total: number;
  successful: number;
  failed: number;
  errors: number;
  protected: number;
}

function mapToAuthStatus(
  success: boolean,
  errorType: string | null,
): AuthStatus {
  if (success) return "success";

  switch (errorType) {
    case "auth_failed":
      return "auth_failed";
    case "connection_error":
      return "connection_error";
    case "timeout":
      return "timeout";
    case "2fa_required":
      return "2fa_required";
    case "additional_verification_required":
      return "captcha_required";
    default:
      return "auth_failed";
  }
}

export async function processPOP3Batch(
  credentials: POP3BatchCredential[],
  concurrency = 5,
  prisma?: PrismaClient,
  timeout = 10_000,
  useJitter = true,
): Promise<POP3BatchResult> {
  const db = prisma ?? new PrismaClient();
  const limit = pLimit(concurrency);
  const verifier = new POP3Verifier(timeout);

  const stats: POP3BatchResult = {
    total: credentials.length,
    successful: 0,
    failed: 0,
    errors: 0,
    protected: 0,
  };

  const tasks = credentials.map((cred, index) =>
    limit(async () => {
      if (useJitter && index > 0) {
        await sleepWithJitter(1000, 5000);
      }

      try {
        const result = await verifier.tryAuthenticate({
          ...cred,
          user: cred.email,
        });

        await saveAuthResult({
          email: cred.email,
          password: cred.password,
          protocol: "POP3",
          host: cred.host,
          port: cred.port,
          status: mapToAuthStatus(result.success, result.errorType),
          errorMessage: result.message ?? null,
          responseTime: result.responseTime ?? null,
          userId: null,
          accountStatus: null,
          accountStatusReason: null,
        });

        if (result.success) {
          stats.successful++;
        } else if (result.errorType === "additional_verification_required") {
          stats.protected++;
        } else {
          stats.failed++;
        }
      } catch (error) {
        stats.errors++;

        await saveAuthResult({
          email: cred.email,
          password: cred.password,
          protocol: "POP3",
          host: cred.host,
          port: cred.port,
          status: "auth_failed",
          errorMessage: error instanceof Error ? error.message : String(error),
          responseTime: null,
          userId: null,
          accountStatus: null,
          accountStatusReason: null,
        });
      }
    }),
  );

  await Promise.all(tasks);

  if (!prisma) {
    await db.$disconnect();
  }

  return stats;
}
