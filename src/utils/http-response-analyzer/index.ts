// Main analyzer function
export { analyzeHttpResponse } from "./analyzer.js";

// Types
export type {
  HttpResponseClassification,
  HttpResponseAnalysis,
  ClassificationReason,
  ClassificationSource,
  RateLimitInfo,
} from "./types.js";

// Patterns (for testing and extensions)
export {
  STATUS_CODE_PATTERNS,
  JSON_ERROR_PATTERNS,
  BODY_KEYWORD_PATTERNS,
  RATE_LIMIT_HEADERS,
  AUTH_CHALLENGE_HEADERS,
} from "./patterns.js";
