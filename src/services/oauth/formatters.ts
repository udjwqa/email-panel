import type { OAuthContentType } from "./types.js";

/**
 * Format request data based on content type
 *
 * @param params - Request parameters
 * @param contentType - Content type (JSON or form-urlencoded)
 * @returns Formatted data (object for JSON, string for form-urlencoded)
 */
export function formatRequestData(
  params: Record<string, any>,
  contentType: OAuthContentType,
): string | Record<string, any> {
  if (contentType === "application/json") {
    // Return object - axios will JSON.stringify automatically
    return cleanParams(params);
  }

  // Format as application/x-www-form-urlencoded
  return formatAsFormUrlEncoded(params);
}

/**
 * Format parameters as application/x-www-form-urlencoded
 *
 * Uses native URLSearchParams (Node.js >= 10)
 * Arrays are joined with spaces (OAuth 2.0 spec for scope)
 *
 * @param params - Parameters to format
 * @returns URL-encoded string
 *
 * @example
 * formatAsFormUrlEncoded({ scope: ["email", "profile"], user: "test" })
 * // Returns "scope=email+profile&user=test"
 */
export function formatAsFormUrlEncoded(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    // Skip undefined and null values
    if (value === undefined || value === null) continue;

    // Arrays are joined with spaces (OAuth 2.0 spec)
    if (Array.isArray(value)) {
      const joined = value.join(" ");
      searchParams.append(key, joined);
    } else {
      searchParams.append(key, String(value));
    }
  }

  return searchParams.toString();
}

/**
 * Clean parameters object (remove undefined/null)
 *
 * @param params - Parameters to clean
 * @returns Cleaned parameters
 */
function cleanParams(params: Record<string, any>): Record<string, any> {
  const cleaned: Record<string, any> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

/**
 * Build OAuth request headers
 *
 * @param contentType - Content type
 * @param additionalHeaders - Additional headers to merge
 * @returns Headers object
 */
export function buildOAuthHeaders(
  contentType: OAuthContentType,
  additionalHeaders: Record<string, string> = {},
): Record<string, string> {
  return {
    "Content-Type": contentType,
    Accept: "application/json",
    ...additionalHeaders,
  };
}

/**
 * Get Content-Type header value
 *
 * @param contentType - Content type
 * @returns Content-Type header value
 */
export function getContentTypeHeader(contentType: OAuthContentType): string {
  return contentType;
}

/**
 * Format query parameters for GET requests
 *
 * @param params - Parameters to format
 * @returns Query string (without leading ?)
 */
export function formatQueryParams(params: Record<string, any>): string {
  return formatAsFormUrlEncoded(params);
}
