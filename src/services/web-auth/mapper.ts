import type { AuthStatus } from "../auth-results/types.js";
import type { WebAuthResultType } from "./types.js";

/**
 * Map WebAuthResultType to AuthStatus
 */
export function mapWebAuthResultToAuthStatus(
  type: WebAuthResultType,
): AuthStatus {
  const mapping: Record<WebAuthResultType, AuthStatus> = {
    success: "success",
    invalid_credentials: "auth_failed",
    captcha_required: "captcha_required",
    "2fa_required": "2fa_required",
    rate_limited: "verification_required",
    timeout: "timeout",
    selector_not_found: "connection_error",
    unknown_error: "auth_failed",
  };

  return mapping[type] || "auth_failed";
}
