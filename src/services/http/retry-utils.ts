import { analyzeHttpResponse } from "../../utils/http-response-analyzer/analyzer.js";
import { sleep, getRandomJitter } from "../../utils/randomization.js";
import type { HttpResponse } from "./types.js";

/**
 * Check if response indicates rate limiting
 *
 * Uses existing analyzeHttpResponse utility to detect:
 * - 429 status code
 * - Retry-After header
 * - Rate limit headers (X-RateLimit-*, etc.)
 * - JSON error codes (rate_limit_exceeded, etc.)
 */
export function isRateLimited(response: HttpResponse): boolean {
  const analysis = analyzeHttpResponse(
    response.status,
    response.headers,
    response.data,
  );

  return (
    analysis.classification === "rate_limited" ||
    analysis.rateLimit?.detected === true
  );
}

/**
 * Extract Retry-After delay in milliseconds
 * Supports both seconds and HTTP-date formats
 *
 * @param headers - Response headers
 * @returns Delay in milliseconds, or null if header not present/invalid
 *
 * @example
 * extractRetryAfterDelay({ "Retry-After": "30" }) // 30000ms
 * extractRetryAfterDelay({ "Retry-After": "Wed, 21 Oct 2015 07:28:00 GMT" }) // calculated delay
 */
export function extractRetryAfterDelay(
  headers: Record<string, string>,
): number | null {
  const retryAfter = headers["retry-after"] || headers["Retry-After"];
  if (!retryAfter) return null;

  // Case 1: Seconds (integer)
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Case 2: HTTP-date format
  try {
    const date = new Date(retryAfter);
    const delayMs = date.getTime() - Date.now();
    return delayMs > 0 ? delayMs : null;
  } catch {
    return null;
  }
}

/**
 * Calculate delay with exponential backoff and jitter
 *
 * Formula: (2^attempt × baseDelay) ± (jitterFactor × delay)
 *
 * @param attempt - Current retry attempt (0-indexed)
 * @param baseDelay - Base delay in milliseconds
 * @param jitterFactor - Jitter factor (0.25 = ±25%)
 * @returns Delay in milliseconds with jitter applied
 *
 * @example
 * calculateBackoffDelay(0, 1000, 0.25) // ~1000ms ±250ms
 * calculateBackoffDelay(1, 1000, 0.25) // ~2000ms ±500ms
 * calculateBackoffDelay(2, 1000, 0.25) // ~4000ms ±1000ms
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelay: number,
  jitterFactor: number,
): number {
  const exponentialDelay = Math.pow(2, attempt) * baseDelay;
  const jitterRange = exponentialDelay * jitterFactor;
  const jitter = getRandomJitter(-jitterRange, jitterRange);

  return Math.max(0, exponentialDelay + jitter);
}

/**
 * Determine retry delay based on response
 *
 * Priority:
 * 1. Server-specified Retry-After header (with jitter)
 * 2. Exponential backoff (2^attempt × baseDelay ± jitter)
 *
 * @param response - HTTP response
 * @param attempt - Current retry attempt (0-indexed)
 * @param baseDelay - Base delay in milliseconds
 * @param jitterFactor - Jitter factor (0.25 = ±25%)
 * @returns Delay in milliseconds
 */
export function getRetryDelay(
  response: HttpResponse,
  attempt: number,
  baseDelay: number,
  jitterFactor: number,
): number {
  // Priority 1: Server-specified Retry-After
  const retryAfterDelay = extractRetryAfterDelay(response.headers);
  if (retryAfterDelay !== null) {
    // Add jitter to server delay (±jitterFactor%)
    const jitterRange = retryAfterDelay * jitterFactor;
    const jitter = getRandomJitter(-jitterRange, jitterRange);
    return Math.max(0, retryAfterDelay + jitter);
  }

  // Priority 2: Exponential backoff
  return calculateBackoffDelay(attempt, baseDelay, jitterFactor);
}

export { sleep };
