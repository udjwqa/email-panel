/**
 * HTTP Response Analysis Types
 */

/**
 * Classification of HTTP response
 */
export type HttpResponseClassification =
  | "auth_success"
  | "invalid_credentials"
  | "rate_limited"
  | "captcha_required"
  | "account_locked"
  | "2fa_required";

/**
 * Source of classification
 */
export type ClassificationSource =
  | "status_code"
  | "json_error"
  | "header"
  | "body_keyword";

/**
 * Reason for classification
 */
export interface ClassificationReason {
  /** Method used for classification */
  source: ClassificationSource;
  /** Specific value that triggered classification */
  value: string;
  /** Confidence level (0-100) */
  confidence: number;
}

/**
 * Rate limit information extracted from response
 */
export interface RateLimitInfo {
  /** Whether rate limit was detected */
  detected: boolean;
  /** Maximum requests allowed in the period */
  limit?: number;
  /** Remaining requests in the current period */
  remaining?: number;
  /** Timestamp when the limit resets (Unix timestamp or seconds) */
  resetAt?: number;
  /** Seconds to wait before retrying */
  retryAfter?: number;
}

/**
 * Result of HTTP response analysis
 */
export interface HttpResponseAnalysis {
  /** Primary classification */
  classification: HttpResponseClassification;
  /** Primary reason for classification */
  reason: ClassificationReason;
  /** Additional reasons if multiple patterns matched */
  additionalReasons?: ClassificationReason[];
  /** Rate limit information (if detected) */
  rateLimit?: RateLimitInfo;
  /** Error message from response (if any) */
  errorMessage?: string;
}
