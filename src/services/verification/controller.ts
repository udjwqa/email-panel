/**
 * Parallel verification controller with EventEmitter
 */

import { EventEmitter } from "events";
import pLimit from "p-limit";
import type { PrismaClient } from "@prisma/client";
import type {
  CredentialInput,
  IMAPCredential,
  POP3Credential,
  SMTPCredential,
  WebAuthCredential,
  OAuthCredential,
  VerificationOptions,
  UnifiedVerificationResult,
  VerificationBatchResult,
  StartEvent,
  ProgressEvent,
  ResultEvent,
  ErrorEvent,
  CompleteEvent,
} from "./types.js";
import type { AuthStatus } from "../auth-results/types.js";
import { IMAPVerifier } from "../imap/verifier.js";
import type { IMAPAuthResult, IMAPFullCheckResult } from "../imap/types.js";
import { POP3Verifier } from "../pop3/verifier.js";
import type { POP3AuthResult } from "../pop3/types.js";
import { verifyMailbox } from "../smtp/verifier.js";
import type { VerifyResult } from "../smtp/types.js";
import { WebAuthVerifier } from "../web-auth/verifier.js";
import type { WebAuthResult, WebAuthConfig } from "../web-auth/types.js";
import { OAuthClient } from "../oauth/client.js";
import type { OAuthProvider } from "../oauth/types.js";
import { saveAuthResult } from "../auth-results/aggregator.js";
import { sleepWithJitter } from "../../utils/randomization.js";

/**
 * Parallel verification controller
 * Emits events: start, progress, result, error, complete
 */
export class ParallelVerificationController extends EventEmitter {
  constructor(private prisma?: PrismaClient) {
    super();
  }

  /**
   * Verify batch of mixed credentials with concurrency control
   */
  async verifyBatch(
    credentials: CredentialInput[],
    options?: VerificationOptions,
  ): Promise<VerificationBatchResult> {
    const {
      concurrency = 5,
      timeout = 10000,
      useJitter = true,
      jitterRange = [1000, 5000],
      saveResults = true,
      userId,
      proxy,
    } = options || {};

    const startTime = new Date();
    const results: UnifiedVerificationResult[] = [];
    let completed = 0;

    // Emit start event
    this.emit("start", {
      total: credentials.length,
      timestamp: startTime,
    } as StartEvent);

    // Create concurrency limiter
    const limit = pLimit(concurrency);

    // Map credentials to tasks
    const tasks = credentials.map((credential, index) =>
      limit(async () => {
        try {
          // Apply jitter between requests
          if (useJitter && index > 0) {
            const [min, max] = jitterRange;
            await sleepWithJitter(min, max);
          }

          // Verify credential
          const result = await this.verifyOne(credential, timeout, proxy);

          // Emit result event
          this.emit("result", {
            credential,
            result,
            index,
          } as ResultEvent);

          // Save to database
          if (saveResults) {
            await this.saveResult(result, userId);
          }

          // Track result
          results.push(result);
          completed++;

          // Emit progress event
          this.emit("progress", {
            completed,
            total: credentials.length,
            percentage: Math.round((completed / credentials.length) * 100),
            current: credential,
          } as ProgressEvent);
        } catch (error) {
          // Emit error event
          this.emit("error", {
            credential,
            error: error instanceof Error ? error : new Error(String(error)),
            index,
          } as ErrorEvent);

          throw error;
        }
      }),
    );

    // Wait for all tasks
    await Promise.all(tasks);

    // Calculate final stats
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const errors = results.filter((r) => r.status === "auth_failed").length;
    const protectedCount = results.filter(
      (r) =>
        r.status === "2fa_required" ||
        r.status === "captcha_required" ||
        r.status === "verification_required",
    ).length;

    const stats = this.calculateStats(results);

    const batchResult: VerificationBatchResult = {
      total: credentials.length,
      completed,
      successful,
      failed,
      errors,
      protected: protectedCount,
      results,
      stats,
      startTime,
      endTime,
      duration,
    };

    // Emit complete event
    this.emit("complete", {
      batchResult,
      duration,
    } as CompleteEvent);

    return batchResult;
  }

  /**
   * Verify single credential (protocol dispatcher)
   */
  private async verifyOne(
    credential: CredentialInput,
    timeout: number,
    proxy?: any,
  ): Promise<UnifiedVerificationResult> {
    switch (credential.protocol) {
      case "IMAP":
        return this.verifyIMAP(credential, timeout);
      case "POP3":
        return this.verifyPOP3(credential, timeout);
      case "SMTP":
        return this.verifySMTP(credential, timeout);
      case "WEB_AUTH":
        return this.verifyWebAuth(credential, timeout);
      case "OAUTH":
        return this.verifyOAuth(credential, timeout);
      default:
        throw new Error(`Unknown protocol: ${(credential as any).protocol}`);
    }
  }

  /**
   * Verify IMAP credential
   */
  private async verifyIMAP(
    cred: IMAPCredential,
    timeout: number,
  ): Promise<UnifiedVerificationResult> {
    const verifier = new IMAPVerifier(timeout);
    const startTime = Date.now();

    try {
      const result = await verifier.tryAuthenticateWithStatus({
        host: cred.host,
        port: cred.port,
        user: cred.email,
        password: cred.password,
        tls: cred.tls,
      });

      return {
        credential: cred,
        protocol: "IMAP",
        success: result.success,
        status: this.mapIMAPStatus(result),
        errorMessage: result.message ?? null,
        responseTime: Date.now() - startTime,
        metadata: {
          errorType: result.errorType ?? undefined,
        },
        accountStatus: result.accountStatus?.status,
        accountStatusReason: result.accountStatus?.reason,
      };
    } catch (error) {
      return {
        credential: cred,
        protocol: "IMAP",
        success: false,
        status: "auth_failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Verify POP3 credential
   */
  private async verifyPOP3(
    cred: POP3Credential,
    timeout: number,
  ): Promise<UnifiedVerificationResult> {
    const verifier = new POP3Verifier(timeout);
    const startTime = Date.now();

    try {
      const result: POP3AuthResult = await verifier.tryAuthenticate({
        host: cred.host,
        port: cred.port,
        user: cred.email,
        password: cred.password,
        tls: cred.tls,
      });

      return {
        credential: cred,
        protocol: "POP3",
        success: result.success,
        status: this.mapPOP3Status(result),
        errorMessage: result.message ?? null,
        responseTime: Date.now() - startTime,
        metadata: {
          errorType: result.errorType ?? undefined,
        },
      };
    } catch (error) {
      return {
        credential: cred,
        protocol: "POP3",
        success: false,
        status: "auth_failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Verify SMTP credential (email verification only)
   */
  private async verifySMTP(
    cred: SMTPCredential,
    timeout: number,
  ): Promise<UnifiedVerificationResult> {
    const startTime = Date.now();

    try {
      const result: VerifyResult = await verifyMailbox(cred.email, { timeout });

      const success = result.status === "deliverable";
      const status: AuthStatus = success ? "success" : "auth_failed";

      return {
        credential: cred,
        protocol: "SMTP",
        success,
        status,
        errorMessage: result.error,
        responseTime: result.responseTime,
        metadata: {
          mxHost: result.mxHost ?? undefined,
        },
      };
    } catch (error) {
      return {
        credential: cred,
        protocol: "SMTP",
        success: false,
        status: "auth_failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Verify WebAuth credential
   */
  private async verifyWebAuth(
    cred: WebAuthCredential,
    timeout: number,
  ): Promise<UnifiedVerificationResult> {
    const config: WebAuthConfig = {
      timeout,
      selectors: cred.selectors,
    };

    const verifier = new WebAuthVerifier(config);
    const startTime = Date.now();

    try {
      const result: WebAuthResult = await verifier.testWebAuth(
        cred.url,
        cred.email,
        cred.password,
      );

      return {
        credential: cred,
        protocol: "WEB_AUTH",
        success: result.success,
        status: this.mapWebAuthStatus(result),
        errorMessage: result.errorMessage ?? null,
        responseTime: result.responseTime,
        metadata: {
          protection: result.protection,
        },
      };
    } catch (error) {
      return {
        credential: cred,
        protocol: "WEB_AUTH",
        success: false,
        status: "auth_failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Verify OAuth credential
   */
  private async verifyOAuth(
    cred: OAuthCredential,
    timeout: number,
  ): Promise<UnifiedVerificationResult> {
    const client = new OAuthClient();
    const startTime = Date.now();

    try {
      const provider: OAuthProvider | string | null =
        cred.provider || "Unknown";

      const result = await client.authenticate(
        provider,
        cred.email,
        cred.password,
      );

      return {
        credential: cred,
        protocol: "OAUTH",
        success: result.success,
        status: result.success ? "success" : "auth_failed",
        errorMessage: result.error ?? null,
        responseTime: result.responseTime,
        metadata: {
          provider: result.provider,
        },
      };
    } catch (error) {
      return {
        credential: cred,
        protocol: "OAUTH",
        success: false,
        status: "auth_failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Save verification result to database
   */
  private async saveResult(
    result: UnifiedVerificationResult,
    userId?: number,
  ): Promise<void> {
    try {
      // Extract protocol-specific data
      let host = "";
      let port = 0;
      let password = "";

      if (result.protocol === "IMAP" || result.protocol === "POP3") {
        const cred = result.credential as IMAPCredential | POP3Credential;
        host = cred.host;
        port = cred.port;
        password = cred.password;
      } else if (result.protocol === "SMTP") {
        // SMTP doesn't require auth credentials
        host = result.metadata?.mxHost || "";
        port = 25; // Default SMTP port
        password = "";
      } else if (result.protocol === "WEB_AUTH") {
        const cred = result.credential as WebAuthCredential;
        host = cred.url;
        port = 443; // Default HTTPS port
        password = cred.password;
      } else {
        // OAuth not supported yet
        return;
      }

      await saveAuthResult({
        email: result.credential.email,
        password,
        protocol: result.protocol as any,
        host,
        port,
        status: result.status,
        errorMessage: result.errorMessage,
        responseTime: result.responseTime ?? null,
        userId: userId ?? null,
        accountStatus: result.accountStatus ?? null,
        accountStatusReason: result.accountStatusReason ?? null,
      });
    } catch (error) {
      // Log error but don't throw (saving is optional)
      console.error("Failed to save result:", error);
    }
  }

  /**
   * Calculate aggregated statistics
   */
  private calculateStats(
    results: UnifiedVerificationResult[],
  ): VerificationBatchResult["stats"] {
    const totalResponseTime = results.reduce(
      (sum, r) => sum + r.responseTime,
      0,
    );
    const averageResponseTime =
      results.length > 0 ? totalResponseTime / results.length : 0;

    // Group by protocol
    const byProtocol: Record<string, number> = {};
    results.forEach((r) => {
      byProtocol[r.protocol] = (byProtocol[r.protocol] || 0) + 1;
    });

    // Group by status
    const byStatus: Record<string, number> = {};
    results.forEach((r) => {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    });

    return {
      averageResponseTime,
      byProtocol,
      byStatus,
    };
  }

  /**
   * Map IMAP result to AuthStatus
   */
  private mapIMAPStatus(result: IMAPAuthResult): AuthStatus {
    if (result.success) return "success";
    if (result.errorType === "auth_failed") return "auth_failed";
    if (result.errorType === "connection_error") return "connection_error";
    if (result.errorType === "timeout") return "timeout";
    if (result.errorType === "2fa_required") return "2fa_required";
    if (result.errorType === "additional_verification_required")
      return "verification_required";
    return "auth_failed";
  }

  /**
   * Map POP3 result to AuthStatus
   */
  private mapPOP3Status(result: POP3AuthResult): AuthStatus {
    if (result.success) return "success";
    if (result.errorType === "auth_failed") return "auth_failed";
    if (result.errorType === "connection_error") return "connection_error";
    if (result.errorType === "timeout") return "timeout";
    if (result.errorType === "2fa_required") return "2fa_required";
    if (result.errorType === "additional_verification_required")
      return "verification_required";
    return "auth_failed";
  }

  /**
   * Map WebAuth result to AuthStatus
   */
  private mapWebAuthStatus(result: WebAuthResult): AuthStatus {
    if (result.success) return "success";

    // Check protection detection
    if (result.protection) {
      if (result.protection.hasCaptcha) return "captcha_required";
      if (result.protection.has2FA) return "2fa_required";
      // hasRateLimit is boolean but we don't have rate_limited in AuthStatus
    }

    // Map result type to status
    if (result.type === "captcha_required") return "captcha_required";
    if (result.type === "2fa_required") return "2fa_required";
    if (result.type === "timeout") return "timeout";

    return "auth_failed";
  }
}
