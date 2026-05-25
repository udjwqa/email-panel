import { saveAuthResult } from "../auth-results/aggregator.js";
import type { AuthStatus } from "../auth-results/types.js";
import type { OAuthAuthResult } from "./types.js";

/**
 * Save OAuth authentication result to database
 *
 * @param result - OAuth authentication result
 * @param userId - User ID (optional)
 */
export async function saveOAuthResult(
  result: OAuthAuthResult,
  userId: number | null = null,
): Promise<void> {
  const status = mapOAuthResultToAuthStatus(result);

  // Get error description from response if available
  const errorMessage =
    result.error ??
    (result.response && !result.response.success
      ? result.response.errorDescription
      : null) ??
    null;

  await saveAuthResult({
    email: result.email,
    password: "", // OAuth doesn't store password
    protocol: "IMAP", // TODO: Extend AuthProtocol to include "OAuth"
    host: result.endpoint || "oauth",
    port: 443,
    status,
    errorMessage,
    responseTime: result.responseTime,
    userId,
    accountStatus: null,
    accountStatusReason: null,
  });
}

/**
 * Map OAuth result to AuthStatus
 */
function mapOAuthResultToAuthStatus(result: OAuthAuthResult): AuthStatus {
  if (result.success) {
    return "success";
  }

  // Get error code from response if available
  const errorCode =
    result.response && !result.response.success
      ? result.response.errorCode
      : undefined;

  switch (errorCode) {
    case "invalid_grant":
    case "invalid_client":
      return "auth_failed";
    case "access_denied":
      return "verification_required";
    case "rate_limit_exceeded":
      return "connection_error";
    default:
      return result.error?.includes("timeout") ? "timeout" : "connection_error";
  }
}
