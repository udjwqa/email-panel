import type {
  HttpResponseAnalysis,
  HttpResponseClassification,
  RateLimitInfo,
} from "./types.js";
import {
  STATUS_CODE_PATTERNS,
  JSON_ERROR_PATTERNS,
  BODY_KEYWORD_PATTERNS,
  RATE_LIMIT_HEADERS,
} from "./patterns.js";

/**
 * Analyze HTTP response and classify the result
 *
 * @param status - HTTP status code
 * @param headers - Response headers (case-insensitive keys)
 * @param body - Response body (any type)
 * @returns Analysis result with classification and reason
 */
export function analyzeHttpResponse(
  status: number,
  headers: Record<string, string>,
  body: any,
): HttpResponseAnalysis {
  // Step 1: Check for success (2xx + access_token)
  if (
    STATUS_CODE_PATTERNS.SUCCESS.includes(status) &&
    (body?.access_token || body?.accessToken)
  ) {
    return {
      classification: "auth_success",
      reason: {
        source: "status_code",
        value: String(status),
        confidence: 100,
      },
    };
  }

  // Step 2: Check JSON error code (highest priority - 95% confidence)
  const jsonResult = classifyByJsonError(body);
  if (jsonResult.classification) {
    return {
      classification: jsonResult.classification,
      reason: {
        source: "json_error",
        value: jsonResult.errorCode || "unknown",
        confidence: 95,
      },
      errorMessage: jsonResult.errorMessage,
      rateLimit:
        jsonResult.classification === "rate_limited"
          ? extractRateLimitInfo(headers)
          : undefined,
    };
  }

  // Step 3: Check HTTP status code (90% confidence)
  const statusClassification = classifyByStatusCode(status);
  if (statusClassification) {
    return {
      classification: statusClassification,
      reason: {
        source: "status_code",
        value: String(status),
        confidence: 90,
      },
      rateLimit:
        statusClassification === "rate_limited"
          ? extractRateLimitInfo(headers)
          : undefined,
    };
  }

  // Step 4: Check headers (85% confidence)
  const headerClassification = classifyByHeaders(headers);
  if (headerClassification) {
    return {
      classification: headerClassification,
      reason: {
        source: "header",
        value: "rate-limit-header",
        confidence: 85,
      },
      rateLimit: extractRateLimitInfo(headers),
    };
  }

  // Step 5: Check body keywords (fallback - 75% confidence)
  const keywordClassification = classifyByBodyKeywords(body);
  if (keywordClassification) {
    return {
      classification: keywordClassification,
      reason: {
        source: "body_keyword",
        value: "pattern-match",
        confidence: 75,
      },
    };
  }

  // Default fallback
  return {
    classification: "invalid_credentials",
    reason: {
      source: "status_code",
      value: String(status),
      confidence: 50,
    },
  };
}

/**
 * Classify by HTTP status code
 * Note: SUCCESS (2xx) requires access_token, so not checked here
 */
function classifyByStatusCode(
  status: number,
): HttpResponseClassification | null {
  if (STATUS_CODE_PATTERNS.INVALID_CREDENTIALS.includes(status)) {
    return "invalid_credentials";
  }
  if (STATUS_CODE_PATTERNS.RATE_LIMITED.includes(status)) {
    return "rate_limited";
  }
  if (STATUS_CODE_PATTERNS.ACCOUNT_LOCKED.includes(status)) {
    return "account_locked";
  }
  return null;
}

/**
 * Classify by JSON error code
 */
function classifyByJsonError(body: any): {
  classification: HttpResponseClassification | null;
  errorCode?: string;
  errorMessage?: string;
} {
  const errorCode = body?.error || body?.error_code || body?.errorCode;
  const errorDescription =
    body?.error_description || body?.errorDescription || body?.message;

  if (!errorCode) {
    return { classification: null };
  }

  const errorCodeLower = String(errorCode).toLowerCase();

  for (const [classification, patterns] of Object.entries(
    JSON_ERROR_PATTERNS,
  )) {
    if (
      patterns.some((pattern) => errorCodeLower.includes(pattern.toLowerCase()))
    ) {
      return {
        classification: classification as HttpResponseClassification,
        errorCode: String(errorCode),
        errorMessage: errorDescription,
      };
    }
  }

  return {
    classification: null,
    errorMessage: errorDescription,
  };
}

/**
 * Classify by headers
 */
function classifyByHeaders(
  headers: Record<string, string>,
): HttpResponseClassification | null {
  const headerKeys = Object.keys(headers).map((k) => k.toLowerCase());

  // Rate limit headers
  const hasRateLimitHeader = RATE_LIMIT_HEADERS.some((h) =>
    headerKeys.includes(h.toLowerCase()),
  );
  if (hasRateLimitHeader) {
    return "rate_limited";
  }

  // WWW-Authenticate header
  const wwwAuth = headers["www-authenticate"] || headers["WWW-Authenticate"];
  if (wwwAuth && /bearer/i.test(wwwAuth)) {
    return "invalid_credentials";
  }

  return null;
}

/**
 * Classify by body keywords
 */
function classifyByBodyKeywords(body: any): HttpResponseClassification | null {
  if (!body) return null;

  const bodyString = JSON.stringify(body).toLowerCase();

  for (const [classification, patterns] of Object.entries(
    BODY_KEYWORD_PATTERNS,
  )) {
    if (patterns.some((regex) => regex.test(bodyString))) {
      return classification as HttpResponseClassification;
    }
  }

  return null;
}

/**
 * Extract rate limit information from headers
 */
function extractRateLimitInfo(
  headers: Record<string, string>,
): RateLimitInfo {
  const lowercaseHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    lowercaseHeaders[key.toLowerCase()] = value;
  }

  const rateLimitRemaining =
    lowercaseHeaders["x-ratelimit-remaining"] ||
    lowercaseHeaders["x-rate-limit-remaining"] ||
    lowercaseHeaders["ratelimit-remaining"];

  const rateLimitLimit =
    lowercaseHeaders["x-ratelimit-limit"] ||
    lowercaseHeaders["x-rate-limit-limit"] ||
    lowercaseHeaders["ratelimit-limit"];

  const rateLimitReset =
    lowercaseHeaders["x-ratelimit-reset"] ||
    lowercaseHeaders["x-rate-limit-reset"] ||
    lowercaseHeaders["ratelimit-reset"];

  const retryAfter = lowercaseHeaders["retry-after"];

  if (!rateLimitRemaining && !retryAfter) {
    return { detected: false };
  }

  return {
    detected: true,
    limit: rateLimitLimit ? parseInt(rateLimitLimit, 10) : undefined,
    remaining: rateLimitRemaining
      ? parseInt(rateLimitRemaining, 10)
      : undefined,
    resetAt: rateLimitReset ? parseInt(rateLimitReset, 10) : undefined,
    retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
  };
}
