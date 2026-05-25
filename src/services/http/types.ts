import { AxiosRequestConfig } from "axios";
import { ProxyEntry } from "../proxy/types.js";
import type { SessionStore } from "./session-store.js";

/**
 * Retry configuration for rate limiting and transient errors
 */
export interface RetryConfig {
  /** Enable retry logic (default: false) */
  enabled?: boolean;
  /** Maximum number of retry attempts (default: 5) */
  maxRetries?: number;
  /** Base delay in milliseconds (default: 1000) */
  baseDelay?: number;
  /** Jitter factor for randomization (default: 0.25 = ±25%) */
  jitterFactor?: number;
}

/**
 * Retry metadata tracked during request retries
 */
export interface RetryMetadata {
  /** Number of retry attempts made */
  attempts: number;
  /** Whether rate limiting was detected */
  rateLimited: boolean;
  /** Total time spent in retry delays (ms) */
  totalRetryDelay: number;
  /** Individual delay amounts for each retry (ms) */
  delays: number[];
}

/**
 * HTTP client configuration
 */
export interface HttpClientConfig {
  /** Request timeout in milliseconds (default: 15000) */
  timeout?: number;
  /** Maximum number of redirects to follow (default: 5) */
  maxRedirects?: number;
  /** Custom headers to include with every request */
  defaultHeaders?: Record<string, string>;
  /** User agent string (optional) */
  userAgent?: string;
  /** Session store for cookie management (optional) */
  sessionStore?: SessionStore;
  /** Retry configuration (optional) */
  retryConfig?: RetryConfig;
}

/**
 * Options for individual HTTP requests
 */
export interface HttpRequestOptions extends Omit<AxiosRequestConfig, "proxy"> {
  /** Proxy configuration for this request */
  proxy?: ProxyEntry;
  /** Override default timeout for this request */
  timeout?: number;
}

/**
 * Simplified HTTP response
 */
export interface HttpResponse<T = any> {
  /** Response status code */
  status: number;
  /** Response status text */
  statusText: string;
  /** Response headers */
  headers: Record<string, string>;
  /** Response data */
  data: T;
  /** Response time in milliseconds */
  responseTime: number;
  /** Retry metadata (if retries were made) */
  retryMetadata?: RetryMetadata;
}

/**
 * HTTP request result with error handling
 */
export interface HttpResult<T = any> {
  /** Whether the request succeeded */
  success: boolean;
  /** Response data (if success) */
  response?: HttpResponse<T>;
  /** Error message (if failed) */
  error?: string;
  /** Response time in milliseconds */
  responseTime: number;
}
