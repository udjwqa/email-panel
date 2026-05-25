import type { AuthStatus } from "../services/auth-results/types.js";

/**
 * Maps internal error types to unified AuthStatus for aggregation
 */
export function mapErrorTypeToAuthStatus(
  success: boolean,
  errorType: string | null,
): AuthStatus {
  if (success) return "success";

  switch (errorType) {
    case "auth_failed":
      return "auth_failed";
    case "connection_error":
      return "connection_error";
    case "timeout":
      return "timeout";
    case "2fa_required":
      return "2fa_required";
    case "additional_verification_required":
      return "captcha_required";
    case "processing_error":
      return "auth_failed";
    default:
      return "auth_failed";
  }
}
