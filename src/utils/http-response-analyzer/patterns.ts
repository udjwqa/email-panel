import type { HttpResponseClassification } from "./types.js";

/**
 * HTTP status code patterns for classification
 */
export const STATUS_CODE_PATTERNS = {
  SUCCESS: [200, 201, 202, 204] as number[],
  INVALID_CREDENTIALS: [401, 403] as number[],
  RATE_LIMITED: [429] as number[],
  ACCOUNT_LOCKED: [423] as number[],
  SERVER_ERROR: [500, 502, 503, 504] as number[],
};

/**
 * JSON error code patterns
 */
export const JSON_ERROR_PATTERNS: Record<
  Exclude<HttpResponseClassification, "auth_success">,
  string[]
> = {
  invalid_credentials: [
    "invalid_grant",
    "invalid_client",
    "unauthorized",
    "authentication_failed",
    "invalid_password",
    "wrong_credentials",
    "access_denied",
  ],
  rate_limited: [
    "rate_limit_exceeded",
    "too_many_requests",
    "quota_exceeded",
    "throttled",
    "rate_limited",
  ],
  captcha_required: [
    "captcha_required",
    "challenge_required",
    "recaptcha_required",
    "captcha_challenge",
  ],
  account_locked: [
    "account_locked",
    "account_suspended",
    "account_disabled",
    "user_blocked",
    "account_blocked",
  ],
  "2fa_required": [
    "mfa_required",
    "2fa_required",
    "otp_required",
    "verification_required",
    "two_factor_required",
  ],
};

/**
 * Body keyword patterns (regex)
 */
export const BODY_KEYWORD_PATTERNS: Record<
  Exclude<HttpResponseClassification, "auth_success">,
  RegExp[]
> = {
  invalid_credentials: [
    /invalid.*(password|credentials|username)/i,
    /authentication.*failed/i,
    /incorrect.*(password|username)/i,
    /wrong.*credentials/i,
  ],
  rate_limited: [
    /rate.*limit/i,
    /too.*many.*(requests|attempts)/i,
    /quota.*exceeded/i,
    /throttled/i,
  ],
  captcha_required: [
    /captcha/i,
    /recaptcha/i,
    /challenge.*required/i,
    /solve.*puzzle/i,
  ],
  account_locked: [
    /account.*(locked|suspended|disabled|blocked)/i,
    /(locked|suspended).*account/i,
  ],
  "2fa_required": [
    /2fa/i,
    /two.*factor/i,
    /verification.*code/i,
    /\botp\b/i,
    /\bmfa\b/i,
  ],
};

/**
 * Rate limit header names
 */
export const RATE_LIMIT_HEADERS = [
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "x-rate-limit-limit",
  "x-rate-limit-remaining",
  "x-rate-limit-reset",
  "ratelimit-limit",
  "ratelimit-remaining",
  "ratelimit-reset",
  "retry-after",
] as const;

/**
 * Authentication challenge header names
 */
export const AUTH_CHALLENGE_HEADERS = [
  "www-authenticate",
  "x-auth-challenge",
] as const;
