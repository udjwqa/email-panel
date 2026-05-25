import type {
  IMAPAuthResult,
  IMAPInboxCheckResultExtended,
} from "./types.js";

/**
 * Account health status (higher-level than AuthStatus)
 */
export type AccountStatus =
  | "active_clean"
  | "active_with_2fa"
  | "suspicious_activity"
  | "restricted"
  | "locked";

/**
 * Classification input data
 */
export interface AccountStatusInput {
  /** Authentication result */
  authResult: IMAPAuthResult;
  /** INBOX accessibility check (optional if auth failed) */
  inboxCheck?: IMAPInboxCheckResultExtended;
}

/**
 * Simple classification result
 */
export interface AccountStatusResult {
  status: AccountStatus;
}

/**
 * Detailed classification with reasoning
 */
export interface AccountStatusResultDetailed extends AccountStatusResult {
  /** Human-readable reason */
  reason: string;
  /** Matched classification rule */
  matchedRule: string;
  /** Contributing factors */
  factors: {
    authSuccess: boolean;
    inboxAccessible: boolean;
    hasSecurityHeaders: boolean;
    hasSuspiciousKeywords: boolean;
  };
}

/**
 * Classify account status based on auth and security checks
 */
export function classifyAccountStatus(
  input: AccountStatusInput
): AccountStatusResult;

export function classifyAccountStatus(
  input: AccountStatusInput,
  options: { includeReason: true }
): AccountStatusResultDetailed;

export function classifyAccountStatus(
  input: AccountStatusInput,
  options?: { includeReason?: boolean }
): AccountStatusResult | AccountStatusResultDetailed {
  const { authResult, inboxCheck } = input;
  const securityCheck = inboxCheck?.securityCheck;

  // Build factors
  const factors = {
    authSuccess: authResult.success,
    inboxAccessible: inboxCheck?.status === "fully_accessible",
    hasSecurityHeaders:
      securityCheck?.warnings.some((w) => w.type === "header") ?? false,
    hasSuspiciousKeywords:
      securityCheck?.warnings.some((w) => w.type === "body") ?? false,
  };

  let status: AccountStatus;
  let matchedRule: string;
  let reason: string;

  // Rule 1: Auth failure → locked
  if (!authResult.success) {
    status = "locked";
    matchedRule = authResult.errorType || "unknown_error";
    reason = `Authentication failed: ${authResult.errorType || "unknown error"}`;
  }
  // Rule 2: INBOX restricted → restricted
  else if (inboxCheck?.status === "restricted_access") {
    status = "restricted";
    matchedRule = "inbox_restricted";
    reason = `INBOX access restricted: ${inboxCheck.error || "unknown reason"}`;
  }
  // Rule 3: Suspicious keywords → suspicious_activity
  else if (factors.hasSuspiciousKeywords) {
    status = "suspicious_activity";
    matchedRule = "suspicious_keywords";
    const keywords = securityCheck!.warnings
      .filter((w) => w.type === "body")
      .map((w) => w.value)
      .join(", ");
    reason = `Suspicious activity detected in messages: ${keywords}`;
  }
  // Rule 4: Security headers → active_with_2fa
  else if (factors.hasSecurityHeaders) {
    status = "active_with_2fa";
    matchedRule = "security_headers";
    const headers = securityCheck!.warnings
      .filter((w) => w.type === "header")
      .map((w) => w.indicator)
      .join(", ");
    reason = `Active with security mechanisms: ${headers}`;
  } else {
    // Rule 5: No warnings → active_clean
    status = "active_clean";
    matchedRule = "no_warnings";
    reason = "Account is active with no security warnings";
  }

  // Return based on options
  if (options?.includeReason) {
    return { status, reason, matchedRule, factors };
  }

  return { status };
}
