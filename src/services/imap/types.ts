import type { AccountStatusResultDetailed } from "./account-status-classifier.js";

export interface IMAPConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
}

export interface IMAPConnectionResult {
  success: boolean;
  error: string | null;
  responseTime: number;
}

export type AuthErrorType =
  | "auth_failed"
  | "connection_error"
  | "timeout"
  | "2fa_required"
  | "additional_verification_required";

export interface IMAPAuthCredentials {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
}

export interface IMAPAuthResult {
  success: boolean;
  errorType: AuthErrorType | null;
  message?: string;
  responseTime?: number;
}

/**
 * Inbox accessibility status
 */
export type InboxAccessibility = "fully_accessible" | "restricted_access";

/**
 * INBOX check result
 */
export interface IMAPInboxCheckResult {
  /** Accessibility status */
  status: InboxAccessibility;
  /** Number of unseen (unread) messages */
  unseenCount?: number;
  /** Total number of messages */
  totalCount?: number;
  /** Error message if restricted */
  error?: string;
  /** Response time in milliseconds */
  responseTime: number;
}

/**
 * Combined authentication + inbox check result
 */
export interface IMAPFullCheckResult extends IMAPAuthResult {
  /** INBOX accessibility check (only if auth successful) */
  inboxCheck?: IMAPInboxCheckResult;
  /** Account status classification (optional) */
  accountStatus?: AccountStatusResultDetailed;
}

/**
 * Security warning detected in message
 */
export interface SecurityWarning {
  /** Type of warning source */
  type: "header" | "body";
  /** Security indicator name or pattern */
  indicator: string;
  /** Matched value or text excerpt */
  value: string;
  /** Severity level */
  severity: "high" | "medium" | "low";
  /** Pattern that matched */
  matchedPattern: string;
}

/**
 * Security warnings check result
 */
export interface SecurityWarningsCheckResult {
  /** List of detected warnings */
  warnings: SecurityWarning[];
  /** Number of messages scanned */
  messagesScanned: number;
  /** Whether any warnings were found */
  hasSecurityWarnings: boolean;
  /** Response time in milliseconds */
  responseTime: number;
  /** Error if check failed */
  error?: string;
}

/**
 * Extended INBOX check result with security warnings
 */
export interface IMAPInboxCheckResultExtended extends IMAPInboxCheckResult {
  /** Security warnings check (optional) */
  securityCheck?: SecurityWarningsCheckResult;
}
