import imaps from "imap-simple";
import {
  IMAPConfig,
  IMAPConnectionResult,
  IMAPAuthCredentials,
  IMAPAuthResult,
  IMAPInboxCheckResult,
  IMAPFullCheckResult,
  SecurityWarning,
  SecurityWarningsCheckResult,
  IMAPInboxCheckResultExtended,
} from "./types.js";
import { detectProtectionMechanism } from "../../utils/protection-detector.js";
import {
  classifyAccountStatus,
  type AccountStatusResultDetailed,
} from "./account-status-classifier.js";

/**
 * Security-related headers to check
 */
const SECURITY_WARNING_HEADERS: Record<string, string> = {
  "x-microsoft-auth-": "Microsoft authentication event",
  "x-google-2fa": "Google 2FA notification",
  "x-yahoo-vss": "Yahoo Verify Sign Status",
};

/**
 * Security warning keywords to search in message body
 */
const SECURITY_WARNING_KEYWORDS = [
  /suspicious activity/i,
  /unusual sign-?in/i,
  /verify your identity/i,
  /confirm your account/i,
  /security alert/i,
  /unauthorized access/i,
  /unusual activity/i,
  /verify it(?:'s| was) you/i,
];

export class IMAPVerifier {
  private timeout: number;

  constructor(timeout = 10_000) {
    this.timeout = timeout;
  }

  async connect(config: IMAPConfig): Promise<IMAPConnectionResult> {
    const start = Date.now();

    try {
      const connection = await imaps.connect({
        imap: {
          user: config.user,
          password: config.password,
          host: config.host,
          port: config.port,
          tls: config.tls,
          authTimeout: this.timeout,
          connTimeout: this.timeout,
          tlsOptions: { rejectUnauthorized: false },
        },
      });

      await connection.end();

      return {
        success: true,
        error: null,
        responseTime: Date.now() - start,
      };
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      let message = error.message;

      switch (error.code) {
        case "ECONNREFUSED":
          message = "Connection refused";
          break;
        case "ETIMEDOUT":
          message = "Connection timeout";
          break;
        case "ENOTFOUND":
          message = "Host not found";
          break;
      }

      if (message.includes("AUTHENTICATIONFAILED")) {
        message = "Authentication failed";
      }

      return {
        success: false,
        error: message,
        responseTime: Date.now() - start,
      };
    }
  }

  async tryAuthenticate(
    credentials: IMAPAuthCredentials,
  ): Promise<IMAPAuthResult> {
    const start = Date.now();

    try {
      const connection = await imaps.connect({
        imap: {
          user: credentials.user,
          password: credentials.password,
          host: credentials.host,
          port: credentials.port,
          tls: credentials.tls,
          authTimeout: this.timeout,
          connTimeout: this.timeout,
          tlsOptions: { rejectUnauthorized: false },
        },
      });

      await connection.end();

      return {
        success: true,
        errorType: null,
        responseTime: Date.now() - start,
      };
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      const message = error.message || "";
      const responseTime = Date.now() - start;

      // Классификация по коду ошибки
      if (error.code === "ETIMEDOUT") {
        return {
          success: false,
          errorType: "timeout",
          message: "Connection timeout",
          responseTime,
        };
      }

      if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
        return {
          success: false,
          errorType: "connection_error",
          message:
            error.code === "ECONNREFUSED"
              ? "Connection refused"
              : "Host not found",
          responseTime,
        };
      }

      // Классификация по сообщению
      // Проверка на защитные механизмы (CAPTCHA, 2FA, verification)
      const protectionCheck = detectProtectionMechanism(message);
      if (protectionCheck.isProtected) {
        return {
          success: false,
          errorType: "additional_verification_required",
          message: `Protection detected: ${protectionCheck.type} (pattern: ${protectionCheck.matchedPattern})`,
          responseTime,
        };
      }

      if (message.includes("Too many connections")) {
        return {
          success: false,
          errorType: "connection_error",
          message: "Too many connections",
          responseTime,
        };
      }

      if (
        message.includes("Authentication failed") ||
        message.includes("AUTHENTICATIONFAILED")
      ) {
        return {
          success: false,
          errorType: "auth_failed",
          message: "Authentication failed",
          responseTime,
        };
      }

      // Fallback
      return {
        success: false,
        errorType: "auth_failed",
        message: message || "Unknown error",
        responseTime,
      };
    }
  }

  /**
   * Authenticate and check INBOX accessibility
   * @param credentials - IMAP credentials
   * @returns Combined authentication and INBOX check result
   */
  async tryAuthenticateWithInbox(
    credentials: IMAPAuthCredentials,
  ): Promise<IMAPFullCheckResult> {
    const start = Date.now();

    try {
      // Step 1: Authenticate (establish connection)
      const connection = await imaps.connect({
        imap: {
          user: credentials.user,
          password: credentials.password,
          host: credentials.host,
          port: credentials.port,
          tls: credentials.tls,
          authTimeout: this.timeout,
          connTimeout: this.timeout,
          tlsOptions: { rejectUnauthorized: false },
        },
      });

      const authResponseTime = Date.now() - start;

      // Step 2: Check INBOX accessibility (only if auth succeeded)
      const inboxCheck = await this.checkInboxAccess(connection);

      // Step 3: Close connection
      await connection.end();

      return {
        success: true,
        errorType: null,
        responseTime: authResponseTime,
        inboxCheck,
      };
    } catch (err) {
      // If auth fails, return auth error (same logic as tryAuthenticate)
      const error = err as NodeJS.ErrnoException;
      const message = error.message || "";
      const responseTime = Date.now() - start;

      // Classification by error code
      if (error.code === "ETIMEDOUT") {
        return {
          success: false,
          errorType: "timeout",
          message: "Connection timeout",
          responseTime,
        };
      }

      if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
        return {
          success: false,
          errorType: "connection_error",
          message:
            error.code === "ECONNREFUSED"
              ? "Connection refused"
              : "Host not found",
          responseTime,
        };
      }

      // Check for protection mechanisms
      const protectionCheck = detectProtectionMechanism(message);
      if (protectionCheck.isProtected) {
        return {
          success: false,
          errorType: "additional_verification_required",
          message: `Protection detected: ${protectionCheck.type} (pattern: ${protectionCheck.matchedPattern})`,
          responseTime,
        };
      }

      if (message.includes("Too many connections")) {
        return {
          success: false,
          errorType: "connection_error",
          message: "Too many connections",
          responseTime,
        };
      }

      if (
        message.includes("Authentication failed") ||
        message.includes("AUTHENTICATIONFAILED")
      ) {
        return {
          success: false,
          errorType: "auth_failed",
          message: "Authentication failed",
          responseTime,
        };
      }

      // Fallback
      return {
        success: false,
        errorType: "auth_failed",
        message: message || "Unknown error",
        responseTime,
      };
    }
  }

  /**
   * Check INBOX accessibility after authentication
   * @param connection - Active IMAP connection (already authenticated)
   * @returns INBOX check result with message counts
   */
  private async checkInboxAccess(
    connection: any,
  ): Promise<IMAPInboxCheckResult> {
    const start = Date.now();

    try {
      // Use status() method - non-destructive, returns unseen count
      // connection.imap is the underlying node-imap Connection object
      const box: any = await new Promise((resolve, reject) => {
        connection.imap.status("INBOX", (err: Error, mailbox: any) => {
          if (err) reject(err);
          else resolve(mailbox);
        });
      });

      return {
        status: "fully_accessible",
        unseenCount: box.messages.unseen,
        totalCount: box.messages.total,
        responseTime: Date.now() - start,
      };
    } catch (err) {
      const error = err as Error;
      const message = error.message || "";
      const lowerMessage = message.toLowerCase();

      // Check if it's a permission/access error
      const isAccessError =
        lowerMessage.includes("permission") ||
        lowerMessage.includes("access denied") ||
        lowerMessage.includes("not allowed") ||
        lowerMessage.includes("restricted");

      return {
        status: "restricted_access",
        error: isAccessError ? "Access restricted" : message,
        responseTime: Date.now() - start,
      };
    }
  }

  /**
   * Check for security warnings in recent messages
   * @param connection - Active IMAP connection
   * @param limit - Maximum number of messages to scan
   * @returns Security warnings check result
   */
  private async checkSecurityWarnings(
    connection: any,
    limit: number = 10,
  ): Promise<SecurityWarningsCheckResult> {
    const start = Date.now();
    const warnings: SecurityWarning[] = [];

    try {
      await connection.openBox("INBOX");

      const searchCriteria = ["ALL"];
      const fetchOptions = {
        bodies: ["HEADER", "TEXT"],
        markSeen: false,
      };

      const messages = await connection.search(searchCriteria, fetchOptions);
      const recentMessages = messages.slice(-limit);

      for (const message of recentMessages) {
        const headerPart = message.parts.find((p: any) => p.which === "HEADER");

        if (headerPart?.body) {
          for (const [headerName] of Object.entries(SECURITY_WARNING_HEADERS)) {
            const headerValue = headerPart.body[headerName];

            if (headerValue && headerValue.length > 0) {
              warnings.push({
                type: "header",
                indicator: headerName,
                value: Array.isArray(headerValue)
                  ? headerValue[0]
                  : String(headerValue),
                severity: "high",
                matchedPattern: headerName,
              });
            }
          }
        }

        const textPart = message.parts.find((p: any) => p.which === "TEXT");

        if (textPart?.body) {
          const bodyText = String(textPart.body);

          for (const pattern of SECURITY_WARNING_KEYWORDS) {
            const match = bodyText.match(pattern);

            if (match) {
              warnings.push({
                type: "body",
                indicator: "security_keyword",
                value: match[0],
                severity: "medium",
                matchedPattern: pattern.source,
              });
              break;
            }
          }
        }
      }

      return {
        warnings,
        messagesScanned: recentMessages.length,
        hasSecurityWarnings: warnings.length > 0,
        responseTime: Date.now() - start,
      };
    } catch (err) {
      const error = err as Error;

      return {
        warnings: [],
        messagesScanned: 0,
        hasSecurityWarnings: false,
        responseTime: Date.now() - start,
        error: error.message || "Failed to check security warnings",
      };
    }
  }

  /**
   * Authenticate and check INBOX with security warnings
   * @param credentials - IMAP credentials
   * @param securityLimit - Number of messages to scan for warnings
   * @returns Full check result with security warnings
   */
  async tryAuthenticateWithSecurity(
    credentials: IMAPAuthCredentials,
    securityLimit: number = 10,
  ): Promise<IMAPFullCheckResult> {
    const start = Date.now();

    try {
      const connection = await imaps.connect({
        imap: {
          user: credentials.user,
          password: credentials.password,
          host: credentials.host,
          port: credentials.port,
          tls: credentials.tls,
          authTimeout: this.timeout,
          connTimeout: this.timeout,
          tlsOptions: { rejectUnauthorized: false },
        },
      });

      const authResponseTime = Date.now() - start;
      const inboxCheck = await this.checkInboxAccess(connection);

      let securityCheck: SecurityWarningsCheckResult | undefined;

      if (inboxCheck.status === "fully_accessible") {
        securityCheck = await this.checkSecurityWarnings(
          connection,
          securityLimit,
        );
      }

      await connection.end();

      return {
        success: true,
        errorType: null,
        responseTime: authResponseTime,
        inboxCheck: {
          ...inboxCheck,
          securityCheck,
        } as IMAPInboxCheckResultExtended,
      };
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      const message = error.message || "";
      const responseTime = Date.now() - start;

      if (error.code === "ETIMEDOUT") {
        return {
          success: false,
          errorType: "timeout",
          message: "Connection timeout",
          responseTime,
        };
      }

      if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
        return {
          success: false,
          errorType: "connection_error",
          message:
            error.code === "ECONNREFUSED"
              ? "Connection refused"
              : "Host not found",
          responseTime,
        };
      }

      const protectionCheck = detectProtectionMechanism(message);
      if (protectionCheck.isProtected) {
        return {
          success: false,
          errorType: "additional_verification_required",
          message: `Protection detected: ${protectionCheck.type} (pattern: ${protectionCheck.matchedPattern})`,
          responseTime,
        };
      }

      if (message.includes("Too many connections")) {
        return {
          success: false,
          errorType: "connection_error",
          message: "Too many connections",
          responseTime,
        };
      }

      if (
        message.includes("Authentication failed") ||
        message.includes("AUTHENTICATIONFAILED")
      ) {
        return {
          success: false,
          errorType: "auth_failed",
          message: "Authentication failed",
          responseTime,
        };
      }

      return {
        success: false,
        errorType: "auth_failed",
        message: message || "Unknown error",
        responseTime,
      };
    }
  }

  /**
   * Authenticate and classify account status
   * @param credentials - IMAP credentials
   * @param securityLimit - Number of messages to scan for warnings
   * @returns Full check result with account status classification
   */
  async tryAuthenticateWithStatus(
    credentials: IMAPAuthCredentials,
    securityLimit: number = 10,
  ): Promise<IMAPFullCheckResult> {
    const result = await this.tryAuthenticateWithSecurity(credentials, securityLimit);
    const accountStatus = classifyAccountStatus(
      { authResult: result, inboxCheck: result.inboxCheck },
      { includeReason: true },
    );
    return { ...result, accountStatus };
  }
}
