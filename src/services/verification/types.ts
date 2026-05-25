/**
 * Unified verification types for all protocols
 */

import type { AuthStatus } from "../auth-results/types.js";
import type { OAuthProvider } from "../oauth/types.js";
import type { ProxyEntry } from "../proxy/types.js";
import type { WebAuthSelectors, ProtectionDetection } from "../web-auth/types.js";
import type { AccountStatus } from "../imap/account-status-classifier.js";

/**
 * Base credential with email and password
 */
export interface BaseCredential {
  email: string;
  password: string;
}

/**
 * IMAP credential
 */
export interface IMAPCredential extends BaseCredential {
  protocol: "IMAP";
  host: string;
  port: number;
  tls: boolean;
}

/**
 * POP3 credential
 */
export interface POP3Credential extends BaseCredential {
  protocol: "POP3";
  host: string;
  port: number;
  tls: boolean;
}

/**
 * SMTP credential (email verification only)
 */
export interface SMTPCredential {
  protocol: "SMTP";
  email: string;
}

/**
 * Web Authentication credential
 */
export interface WebAuthCredential extends BaseCredential {
  protocol: "WEB_AUTH";
  url: string;
  selectors?: WebAuthSelectors;
}

/**
 * OAuth credential
 */
export interface OAuthCredential extends BaseCredential {
  protocol: "OAUTH";
  provider: OAuthProvider | string | null;
}

/**
 * Discriminated union of all credential types
 */
export type CredentialInput =
  | IMAPCredential
  | POP3Credential
  | SMTPCredential
  | WebAuthCredential
  | OAuthCredential;

/**
 * Verification options
 */
export interface VerificationOptions {
  /** Concurrency limit (default: 5) */
  concurrency?: number;
  /** Timeout per verification in milliseconds (default: 10000) */
  timeout?: number;
  /** Use random jitter delays between requests (default: true) */
  useJitter?: boolean;
  /** Jitter range in milliseconds [min, max] (default: [1000, 5000]) */
  jitterRange?: [number, number];
  /** Save results to database (default: true) */
  saveResults?: boolean;
  /** User ID for saved results */
  userId?: number;
  /** Proxy configuration */
  proxy?: ProxyEntry;
}

/**
 * Unified verification result (protocol-agnostic)
 */
export interface UnifiedVerificationResult {
  /** Original credential */
  credential: CredentialInput;
  /** Protocol used */
  protocol: string;
  /** Success flag */
  success: boolean;
  /** Unified status */
  status: AuthStatus;
  /** Error message */
  errorMessage: string | null;
  /** Response time in milliseconds */
  responseTime: number;
  /** Protocol-specific metadata */
  metadata?: {
    /** Error type (IMAP/POP3) */
    errorType?: string;
    /** OAuth provider */
    provider?: string;
    /** SMTP MX host */
    mxHost?: string;
    /** WebAuth protection detection */
    protection?: ProtectionDetection;
  };
  /** Account health status (IMAP only) */
  accountStatus?: AccountStatus;
  /** Account status classification reason (IMAP only) */
  accountStatusReason?: string;
}

/**
 * Batch verification result with statistics
 */
export interface VerificationBatchResult {
  /** Total credentials processed */
  total: number;
  /** Number completed */
  completed: number;
  /** Number successful */
  successful: number;
  /** Number failed */
  failed: number;
  /** Number with errors */
  errors: number;
  /** Number protected (2FA/CAPTCHA) */
  protected: number;
  /** All results */
  results: UnifiedVerificationResult[];
  /** Aggregated statistics */
  stats: {
    /** Average response time */
    averageResponseTime: number;
    /** Results by protocol */
    byProtocol: Record<string, number>;
    /** Results by status */
    byStatus: Record<string, number>;
  };
  /** Batch start time */
  startTime: Date;
  /** Batch end time */
  endTime: Date;
  /** Total duration in milliseconds */
  duration: number;
}

/**
 * Event: Batch started
 */
export interface StartEvent {
  /** Total credentials */
  total: number;
  /** Start timestamp */
  timestamp: Date;
}

/**
 * Event: Progress update
 */
export interface ProgressEvent {
  /** Completed count */
  completed: number;
  /** Total count */
  total: number;
  /** Percentage (0-100) */
  percentage: number;
  /** Current credential being processed */
  current: CredentialInput;
}

/**
 * Event: Individual result
 */
export interface ResultEvent {
  /** Credential */
  credential: CredentialInput;
  /** Result */
  result: UnifiedVerificationResult;
  /** Index in batch */
  index: number;
}

/**
 * Event: Error occurred
 */
export interface ErrorEvent {
  /** Credential */
  credential: CredentialInput;
  /** Error */
  error: Error;
  /** Index in batch */
  index: number;
}

/**
 * Event: Batch complete
 */
export interface CompleteEvent {
  /** Batch result */
  batchResult: VerificationBatchResult;
  /** Duration in milliseconds */
  duration: number;
}
